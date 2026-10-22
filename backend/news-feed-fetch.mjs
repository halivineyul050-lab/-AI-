import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const LIMIT = 2 * 1024 * 1024;
function failure(code, status) { const error = new Error(code); error.code = code; if (Number.isInteger(status)) error.status=status; return error; }
function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
function checkedUrl(value, base) {
  let url; try { url = new URL(value, base); } catch { throw failure('NEWS_UNSAFE_URL'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname || url.hostname.includes(':') || (isIP(url.hostname) && !publicIPv4(url.hostname))) throw failure('NEWS_UNSAFE_URL');
  url.hash = ''; return url;
}
function raceAbort(promise, signal) {
  return new Promise((resolve,reject) => {
    const abort = () => reject(failure(signal.reason?.code === 'NEWS_TIMEOUT' ? 'NEWS_TIMEOUT' : 'NEWS_ABORTED'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
export async function safeNewsRequest(value, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(failure('NEWS_ABORTED'));
  options.signal?.addEventListener('abort',abort,{once:true});
  if (options.signal?.aborted) abort();
  const timer = setTimeout(()=>controller.abort(failure('NEWS_TIMEOUT')),Math.min(options.timeoutMs || 15000,60000));
  const signal = controller.signal;
  const maxBytes = Math.min(options.maxBytes || LIMIT,LIMIT);
  try {
    let url = checkedUrl(value);
    for (let redirects = 0; ; redirects++) {
      const records = await raceAbort((options.resolver || lookup)(url.hostname,{family:4,all:true,signal}),signal);
      if (!Array.isArray(records) || !records.length || records.some(row=>!publicIPv4(row.address))) throw failure('NEWS_UNSAFE_URL');
      const address = records[0].address;
      const result = await raceAbort(new Promise((resolve,reject)=>{
        const request = options.request || (url.protocol === 'https:' ? https.request : http.request);
        const headers = { ...options.headers, 'User-Agent':'NikaiAI-NewsFeed/1.0', 'Accept-Encoding':'identity' };
        if (options.etag) headers['If-None-Match'] = options.etag;
        const req = request(url,{method:options.method || 'GET',headers,agent:false,signal,lookup:(_host, lookupOptions, callback)=>callback(null,lookupOptions?.all ? [{address,family:4}] : address,4)},res=>{
          const status = res.statusCode || 0;
          if ([301,302,303,307,308].includes(status)) { res.destroy(); resolve({redirect:res.headers.location}); return; }
          if (status === 304) {res.destroy();resolve({text:'',notModified:true,status,etag:res.headers.etag || options.etag || null});return;}
          if (status < 200 || status >= 300) {res.destroy();reject(failure('NEWS_HTTP_ERROR',status));return;}
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {res.destroy();reject(failure('NEWS_ENCODING'));return;}
          if (Number(res.headers['content-length']) > maxBytes) {res.destroy();reject(failure('NEWS_TOO_LARGE'));return;}
          let bytes=0;const chunks=[];
          res.on('data',chunk=>{ const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;if(bytes>maxBytes){res.destroy();reject(failure('NEWS_TOO_LARGE'));}else chunks.push(buffer); });
          res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({text:options.binary?'':bytes.toString('utf8'),...(options.binary?{bytes}:{}),contentType:res.headers['content-type']||'',notModified:false,status,etag:res.headers.etag || null});});
          res.on('error',()=>reject(failure('NEWS_NETWORK_ERROR')));
        });
        req.on('error',()=>reject(failure(signal.aborted ? (signal.reason?.code || 'NEWS_ABORTED') : 'NEWS_NETWORK_ERROR')));
        if (options.body) req.write(options.body);
        req.end();
      }),signal);
      if (!('redirect' in result)) return {...result,finalUrl:url.href};
      if (!result.redirect) throw failure('NEWS_HTTP_ERROR');
      if (redirects >= 3) throw failure('NEWS_REDIRECT_LIMIT');
      // Never forward API credentials or a POST body to another endpoint.
      if ((options.method || 'GET') !== 'GET') throw failure('NEWS_REDIRECT_UNSUPPORTED');
      url = checkedUrl(result.redirect,url);
    }
  } catch(error) { if (error?.code?.startsWith('NEWS_')) throw error; throw failure('NEWS_NETWORK_ERROR'); }
  finally {clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
export async function fetchNewsFeed(url,options={}) { return safeNewsRequest(url,{...options,timeoutMs:Math.min(options.timeoutMs||15000,15000)}); }

function plain(value,max) {
  if (value && typeof value === 'object') value=value['#text'] || '';
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi,entity=>{
    const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
    if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
    const n=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
    return n>0 && n<=0x10ffff && !(n>=0xd800 && n<=0xdfff)?String.fromCodePoint(n):'';
  }).replace(/\s+/g,' ').trim().slice(0,max);
}
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
function link(value,base) { if(typeof value!=='string' || !value.trim())return null;try{return checkedUrl(value,base).href;}catch{return null;} }
export function parseNewsFeed(text,{type='rss',url,name='News',now=new Date().toISOString()}={}) {
  if (typeof text !== 'string' || Buffer.byteLength(text)>LIMIT) throw failure('NEWS_TOO_LARGE');
  let rows;
  try {
    if (type === 'rss') {
      if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text)!==true) throw failure('NEWS_INVALID_FEED');
      const doc=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,processEntities:false}).parse(text);
      rows=doc.rss?.channel?.item || doc.feed?.entry || doc['rdf:RDF']?.item || [];
      rows=array(rows).map(item=>{
        const links=array(item.link); const chosen=links.find(x=>typeof x==='object' && (!x['@_rel'] || x['@_rel']==='alternate')) || links[0];
        const image=array(item['media:content']).find(x=>x?.['@_url']) || array(item['media:thumbnail'])[0] || (item.enclosure?.['@_type']?.startsWith('image/')?item.enclosure:null);
        return {imageUrl:image?.['@_url'] || '',id:item.guid || item.id,title:item.title,summary:item.description || item.summary || item.content || item['content:encoded'],url:typeof chosen==='object'?chosen['@_href']:chosen,publishedAt:item.pubDate || item.published || item.updated || item['dc:date']};
      });
    } else if (type === 'json' || type === 'aihot' || type === 'search') { const doc=JSON.parse(text); rows=Array.isArray(doc)?doc:doc.items; }
    else throw failure('NEWS_INVALID_FEED');
  } catch {throw failure('NEWS_INVALID_FEED');}
  if (!Array.isArray(rows) || rows.length>2000) throw failure('NEWS_INVALID_FEED');
  const sourceUrl=link(url); if(!sourceUrl)throw failure('NEWS_UNSAFE_URL');
  const normalized=[];
  for(const item of rows){
    if(!item || typeof item!=='object')continue;
    const title=plain(item.title,200);const canonicalUrl=link(item.links?.original || item.url || item.link,sourceUrl);
    if(!title || !canonicalUrl)continue;
    let publishedAt=null;
    if(item.publishedAt != null && item.publishedAt !== '') {const date=new Date(item.publishedAt);if(!Number.isFinite(date.getTime()))continue;publishedAt=date.toISOString();}
    const attributionUrl=link(item.attribution?.url || item.links?.aihot,sourceUrl);
    normalized.push({id:plain(item.id,200) || createHash('sha256').update(canonicalUrl+'\n'+title).digest('hex'),title,originalTitle:plain(item.originalTitle,200),imageUrl:link(item.imageUrl || item.image || item.coverUrl,canonicalUrl),summary:plain(item.summary || item.description,1000),publishedAt,discoveredAt:now,sourceName:plain(item.source?.name || name,200),sourceUrl,canonicalUrl,...(attributionUrl?{attribution:{name:plain(item.attribution?.name || 'AI HOT',200),url:attributionUrl}}:{})});
  }
  return normalized.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,30);
}
