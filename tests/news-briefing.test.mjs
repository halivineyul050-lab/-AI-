import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../backend/database.mjs';
import {createNewsSync} from '../backend/news-sync.mjs';
import {parseNewsFeed} from '../backend/news-feed-fetch.mjs';
import {prepareNewsBrief,createNewsImages,articleMetadata,BRIEF_SOURCES} from '../backend/news-briefing.mjs';
const clock=Date.parse('2026-10-13T08:00:00Z');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const entry={id:'a',title:'Google 发布新的AI工具',summary:'Google发布新工具，帮助用户完成文档处理。',canonicalUrl:'https://blog.google/ai/update',publishedAt:'2026-10-13T07:00:00Z'};
const html='<title>Google AI update</title><meta content="原文工具说明" name="description"><meta property="og:image" content="/cover.png">';
test('RSS media enclosure and search JSON retain original image and title',()=>{
 const rss='<rss><channel><item><title>AI news</title><link>https://blog.google/ai/update</link><enclosure url="https://blog.google/p.png" type="image/png"/><pubDate>Tue, 13 Oct 2026 07:00:00 GMT</pubDate></item></channel></rss>';
 assert.equal(parseNewsFeed(rss,{url:'https://blog.google/feed'})[0].imageUrl,'https://blog.google/p.png');
 assert.equal(parseNewsFeed(JSON.stringify({items:[{...entry,links:{original:entry.canonicalUrl},originalTitle:'AI update'}]}),{type:'search',url:'https://aihot.virxact.com/api/v1/items'})[0].originalTitle,'AI update');
});
test('verified original image is stored and served from immutable same-origin asset',async()=>{
 const db=openDatabase(':memory:');const images=createNewsImages(db);let calls=0;
 const result=await prepareNewsBrief(entry,{images,now:clock,request:async(_url,options)=>{calls++;return options.binary?{bytes:png}:{text:html}}});
 assert.equal(result.verified,true);assert.equal(result.imageStatus,'saved');assert.match(result.coverUrl,/^\/api\/v1\/news\/images\/[a-f0-9]{64}$/);
 assert.deepEqual(images.read(result.coverUrl.split('/').at(-1)).bytes,png);assert.equal(calls,2);db.close();
});
test('HTML masquerading as an image cannot be saved and does not block verified news',async()=>{
 const db=openDatabase(':memory:');const result=await prepareNewsBrief(entry,{images:createNewsImages(db),now:clock,request:async(_u,o)=>o.binary?{bytes:Buffer.from('<html>not image</html>')}:{text:html}});
 assert.equal(result.verified,true);assert.equal(result.coverUrl,'');assert.equal(result.imageStatus,'failed');assert.equal(db.prepare('SELECT COUNT(*) n FROM news_cover_images').get().n,0);db.close();
});
test('untrusted URLs, rumours, stale news and challenge pages cannot auto publish',async()=>{
 for(const e of [{...entry,canonicalUrl:'https://unknown.example/news'},{...entry,title:'网传公司融资'},{...entry,publishedAt:'2026-10-01'}]){
  const r=await prepareNewsBrief(e,{now:clock,images:{save(){throw Error()}},request:async()=>({text:html})});assert.equal(r.verified,false);
 }
 assert.equal((await prepareNewsBrief(entry,{now:clock,images:{},request:async()=>({text:'<title>Just a moment</title>'})})).verified,false);
});
test('daily rollout retains saved model configuration and custom sources',()=>{
 const db=openDatabase(':memory:');const legacy=createNewsSync(db,{defaults:[]});
 legacy.configure({revision:legacy.read().config.revision,enabled:false,intervalMinutes:5,sources:[{id:'custom',name:'Custom',url:'https://blog.google/feed',type:'rss',enabled:true,policy:'review'}]});
 const service=createNewsSync(db,{dailyBriefing:true,defaults:[],now:()=>clock});const cfg=service.read().config;
 assert.equal(cfg.intervalMinutes,1440);assert.equal(cfg.enabled,true);assert.ok(cfg.sources.some(s=>s.id==='custom'));assert.equal(cfg.sources.filter(s=>s.type==='search').length,4);db.close();
});
test('daily brief auto publishes bounded Chinese summaries and covers, deduplicating before model work',async()=>{
 const db=openDatabase(':memory:');const service=createNewsSync(db,{defaults:[],dailyBriefing:true,now:()=>clock,feedFetcher:async()=>({text:JSON.stringify({items:[entry,{...entry,id:'b',canonicalUrl:undefined,url:'https://blog.google/ai/duplicate'}].map(i=>({...i,url:i.canonicalUrl||i.url}))})}),safeRequest:async(_u,o)=>o.binary?{bytes:png}:{text:html}});
 service.configure({revision:service.read().config.revision,enabled:true,intervalMinutes:1440,sources:[{...BRIEF_SOURCES[0],type:'json',url:'https://blog.google/feed'}]});
 const run=await service.run();assert.equal(run.published,1);assert.equal(run.duplicates,1);assert.equal(run.imagesSaved,1);
 const article=db.prepare("SELECT * FROM articles WHERE kind='news'").get();assert.match(article.cover_url,/\/api\/v1\/news\/images\//);assert.ok(article.excerpt.length<=180);assert.equal((await service.run()).published,0);await service.close();db.close();
});
test('English fallback never auto publishes as a completed Chinese brief',async()=>{
 const db=openDatabase(':memory:');const service=createNewsSync(db,{defaults:[],dailyBriefing:true,now:()=>clock,feedFetcher:async()=>({text:JSON.stringify({items:[{...entry,title:'English AI release',summary:'English description',url:entry.canonicalUrl}]})}),safeRequest:async()=>({text:'<title>Official AI</title><meta name="description" content="Source evidence">'})});
 service.configure({revision:service.read().config.revision,enabled:true,intervalMinutes:1440,sources:[{...BRIEF_SOURCES[0],type:'json',url:'https://blog.google/feed'}]});const run=await service.run();assert.equal(run.published,0);assert.equal(service.read().pending.length,1);await service.close();db.close();
});
test('per-run limit is enforced and daily restart keeps its scheduled next run',async()=>{
 const db=openDatabase(':memory:');const entries=Array.from({length:4},(_,i)=>({...entry,id:String(i),title:'AI工具更新'+i,url:'https://blog.google/news/'+i}));
 const service=createNewsSync(db,{defaults:[],dailyBriefing:true,now:()=>clock,feedFetcher:async()=>({text:JSON.stringify({items:entries})}),safeRequest:async()=>({text:'<title>AI update</title><meta name="description" content="Official evidence">'})});
 service.configure({revision:service.read().config.revision,enabled:true,intervalMinutes:1440,briefing:{enabled:true,limit:2},sources:[{...BRIEF_SOURCES[0],type:'json',url:'https://blog.google/feed'}]});
 const run=await service.run();assert.equal(run.published,2);assert.equal(run.limited,2);await service.close();
 const restarted=createNewsSync(db,{defaults:[],dailyBriefing:true,now:()=>clock+3600000});restarted.start();assert.equal(restarted.read().status.nextRunAt,new Date(clock+86400000).toISOString());await restarted.close();db.close();
});
