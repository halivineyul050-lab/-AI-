import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fetchNewsFeed, parseNewsFeed } from '../backend/news-feed-fetch.mjs';

const resolver = async () => [{ address: '93.184.216.34', family: 4 }];
function fakeRequest(replies, inspect = () => {}) {
  return (url, options, callback) => {
    inspect(url, options);
    const req = new EventEmitter(); req.destroy = () => {}; req.write = () => {};
    req.end = () => queueMicrotask(() => {
      const reply = replies.shift();
      const res = Readable.from(reply.chunks || [reply.text || '']);
      res.statusCode = reply.status || 200; res.headers = reply.headers || {};
      reply.inspectResponse?.(res);
      callback(res);
    });
    return req;
  };
}
test('blocks credentials, ports and private/reserved addresses before connecting', async () => {
  for (const url of ['http://user:secret@example.com','http://example.com:8080','http://127.0.0.1','http://169.254.169.254','http://[::1]','http://0x7f000001']) {
    await assert.rejects(fetchNewsFeed(url), { code: 'NEWS_UNSAFE_URL' });
  }
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver:async()=>[{address:'10.0.0.1',family:4}]}), {code:'NEWS_UNSAFE_URL'});
});
test('pins checked DNS and sends identity encoding and etag', async () => {
  const result = await fetchNewsFeed('https://example.com/feed',{resolver,etag:'abc',request:fakeRequest([{text:'ok',headers:{etag:'def'}}],(url,options)=>{
    assert.equal(options.headers['Accept-Encoding'],'identity'); assert.equal(options.headers['If-None-Match'],'abc');
    options.lookup('example.com',{},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
  })});
  assert.equal(result.text,'ok'); assert.equal(result.etag,'def');
});
test('validates redirected destination and limits redirect chains', async () => {
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver,request:fakeRequest([{status:302,headers:{location:'http://127.0.0.1'}}])}),{code:'NEWS_UNSAFE_URL'});
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver,request:fakeRequest(Array.from({length:4},()=>({status:302,headers:{location:'/again'}})))}),{code:'NEWS_REDIRECT_LIMIT'});
});
test('bounds DNS time and streamed body bytes', async () => {
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver:()=>new Promise(()=>{}),timeoutMs:15}),{code:'NEWS_TIMEOUT'});
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver,maxBytes:4,request:fakeRequest([{chunks:['abc','def']}])}),{code:'NEWS_TOO_LARGE'});
});
test('rejects mixed DNS answers and rebinding on a redirect',async()=>{
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver:async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]}),{code:'NEWS_UNSAFE_URL'});
  let calls=0;
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver:async()=>[{address:++calls===1?'93.184.216.34':'127.0.0.1',family:4}],request:fakeRequest([{status:302,headers:{location:'/new'}}])}),{code:'NEWS_UNSAFE_URL'});
});
test('preserves conditional response and bounds hanging connections',async()=>{
  const response=await fetchNewsFeed('https://example.com',{resolver,etag:'cached',request:fakeRequest([{status:304}])});
  assert.equal(response.notModified,true);assert.equal(response.etag,'cached');assert.equal(response.text,'');
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver,timeoutMs:15,request:()=>{const req=new EventEmitter();req.end=()=>{};return req;}}),{code:'NEWS_TIMEOUT'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(fetchNewsFeed('https://example.com',{signal:controller.signal,resolver}),{code:'NEWS_ABORTED'});
});
test('normalizes RSS and Atom and strips executable HTML',()=>{
  const opts={type:'rss',url:'https://example.com/feed',name:'Example',now:'2026-10-10T00:00:00.000Z'};
  const rss=parseNewsFeed('<rss><channel><item><title>Hello</title><link>https://example.com/a</link><description><![CDATA[<script>evil()</script><b>Good &amp; safe</b>]]></description></item></channel></rss>',opts);
  assert.equal(rss[0].summary,'Good & safe');assert.equal(rss[0].publishedAt,null);
  const atom=parseNewsFeed('<feed><entry><id>x</id><title>Atom</title><link href="https://example.com/b"/><updated>2026-10-09T00:00:00Z</updated></entry></feed>',opts);
  assert.equal(atom[0].canonicalUrl,'https://example.com/b');assert.equal(atom[0].publishedAt,'2026-10-09T00:00:00.000Z');
});
test('rejects XXE and malformed XML and oversized/too many entries',()=>{
  const opts={type:'rss',url:'https://example.com',name:'Example'};
  assert.throws(()=>parseNewsFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',opts));
  assert.throws(()=>parseNewsFeed('<rss><broken></rss>',opts));
  assert.throws(()=>parseNewsFeed('x'.repeat(2097153),opts));
  assert.throws(()=>parseNewsFeed(JSON.stringify({items:Array.from({length:2001},()=>({title:'x'}))}),{...opts,type:'json'}));
});
test('accepts large official feeds while limiting normalized output',()=>{
  const items=Array.from({length:2000},(_,i)=>({title:`item ${i}`,url:`https://example.com/${i}`}));
  assert.equal(parseNewsFeed(JSON.stringify({items}),{type:'json',url:'https://example.com/feed'}).length,30);
});
test('destroys redirect and error bodies without draining them',async()=>{
  const replies=[{status:302,headers:{location:'/next'}},{status:500}];
  let drained=false;let destroyed=0;
  for(const reply of replies)reply.inspectResponse=res=>{res.resume=()=>{drained=true;};const destroy=res.destroy.bind(res);res.destroy=()=>{destroyed++;return destroy();};};
  await assert.rejects(fetchNewsFeed('https://example.com',{resolver,request:fakeRequest(replies)}),{code:'NEWS_HTTP_ERROR'});
  assert.equal(drained,false);assert.equal(destroyed,2);
});
test('normalizes JSON and AIHOT without invented dates and discards bad dates/private links',()=>{
  const opts={url:'https://example.com/feed',name:'Example',now:'2026-10-10T00:00:00Z'};
  const rows=parseNewsFeed(JSON.stringify({items:[{title:'one',url:'https://example.com/1'},{title:'bad',url:'https://example.com/2',publishedAt:'garbage'},{title:'private',url:'http://10.0.0.1'}]}),{...opts,type:'json'});
  assert.equal(rows.length,1);assert.equal(rows[0].publishedAt,null);
  const ai=parseNewsFeed(JSON.stringify({items:[{id:'a',title:'AI',source:{name:'Publisher'},links:{original:'https://publisher.com/a',aihot:'https://aihot.virxact.com/a'},attribution:{name:'AI HOT',url:'https://aihot.virxact.com/a'}}]}),{...opts,type:'aihot'});
  assert.equal(ai[0].sourceName,'Publisher');assert.equal(ai[0].canonicalUrl,'https://publisher.com/a');assert.equal(ai[0].attribution.name,'AI HOT');
});
test('keeps at most thirty newest real dates ahead of undated items',()=>{
  const items=Array.from({length:35},(_,i)=>({title:`item ${i}`,url:`https://example.com/${i}`,publishedAt:new Date(Date.UTC(2026,0,i+1)).toISOString()}));
  items.unshift({title:'unknown',url:'https://example.com/unknown'});
  const rows=parseNewsFeed(JSON.stringify({items}),{type:'json',url:'https://example.com/feed'});
  assert.equal(rows.length,30);assert.equal(rows[0].title,'item 34');assert.equal(rows[29].title,'item 5');
});
test('upstream failures expose only bounded status metadata and never their body',async()=>{await assert.rejects(fetchNewsFeed('https://example.com',{resolver,request:fakeRequest([{status:401,text:'SECRET_CREDENTIALS'}])}),e=>{assert.equal(e.code,'NEWS_HTTP_ERROR');assert.equal(e.status,401);assert.doesNotMatch(e.message,/SECRET_CREDENTIALS/);return true;});});
