import { createHash } from 'node:crypto';
import { inspectImage } from './image-generation-gateway.mjs';

export const BRIEF_SOURCES = [
 ['ai-search-hot','AI 行业热点搜索','https://aihot.virxact.com/api/v1/items?mode=selected&window=24h&limit=30'],
 ['ai-search-products','AI 产品与热门应用搜索','https://aihot.virxact.com/api/v1/items?mode=selected&window=7d&category=ai-products&limit=20'],
 ['ai-search-funding','AI 投融资与企业动态搜索','https://aihot.virxact.com/api/v1/items?mode=selected&window=7d&q=%E8%9E%8D%E8%B5%84&limit=20'],
 ['ai-search-tech','AI 前沿论文与技术搜索','https://aihot.virxact.com/api/v1/items?mode=selected&window=7d&category=paper&limit=20'],
 ['google-ai-official','Google AI 官方博客','https://blog.google/technology/ai/rss/'],
 ['nvidia-official','NVIDIA 官方博客','https://blogs.nvidia.com/feed/']
].map(([id,name,url])=>({id,name,url,type:id.startsWith('ai-search')?'search':'rss',enabled:true,policy:'auto'}));
const trusted=['openai.com','anthropic.com','blog.google','deepmind.google','research.google','nvidia.com','microsoft.com','ai.meta.com','about.fb.com','huggingface.co','arxiv.org','qwen.ai','deepseek.com','alibabacloud.com','moonshot.cn','zhipuai.cn','minimaxi.com','baidu.com','tencent.com','volcengine.com','techcrunch.com','reuters.com','bloomberg.com','venturebeat.com','36kr.com','ithome.com','jiqizhixin.com','a16z.com','sequoiacap.com','theverge.com','wired.com','technologyreview.com','infoq.com','infoq.cn'];
export function trustedNewsUrl(url){try{const host=new URL(url).hostname.toLowerCase();return trusted.some(d=>host===d||host.endsWith('.'+d));}catch{return false;}}
export function cleanNewsText(text,max=1000){return String(text||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function attributes(tag){const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))out[m[1].toLowerCase()]=cleanNewsText(m[2]??m[3],2000);return out;}
export function articleMetadata(html,base){const meta={};for(const tag of String(html).match(/<meta\b[^>]*>/gi)||[]){const a=attributes(tag);meta[a.property||a.name]=a.content;}
 let image=meta['og:image']||meta['twitter:image']||'';try{image=image?new URL(image,base).href:'';}catch{image='';}
 return {title:meta['og:title']||cleanNewsText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],200),summary:meta.description||meta['og:description']||'',imageUrl:image,publishedAt:meta['article:published_time']||meta.date||''};}
export function newsEventKey(entry){return cleanNewsText(entry.originalTitle||entry.title,300).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');}
export function briefCategory(entry){const t=entry.title+' '+entry.summary;if(/融资|投资|funding|investment|raises?\b|series [a-f]/i.test(t))return '投融资';if(/论文|研究|arxiv|research|paper|benchmark/i.test(t))return '前沿技术';if(/发布|推出|上线|release|launch|update/i.test(t))return '产品更新';if(/案例|应用|使用|workflow|application/i.test(t))return '应用案例';return '行业动态';}
export function createNewsImages(db){const maria=db.backend==='mariadb';return {
 save(bytes){const image=inspectImage(bytes);if(image.bytes.length>2*1024*1024)throw Error('NEWS_IMAGE_TOO_LARGE');const id=createHash('sha256').update(image.bytes).digest('hex');db.prepare(`INSERT OR IGNORE INTO news_cover_images(id,mime_type,image_bytes) VALUES(?,?,${maria?'FROM_BASE64(?)':'?'})`).run(id,image.mimeType,maria?image.bytes.toString('base64'):image.bytes);return '/api/v1/news/images/'+id;},
 read(id){const row=db.prepare(`SELECT mime_type AS mimeType,${maria?'TO_BASE64(image_bytes)':'image_bytes'} AS bytes FROM news_cover_images WHERE id=?`).get(id);return row?{mimeType:row.mimeType,bytes:Buffer.from(row.bytes,maria?'base64':undefined)}:null;}
 };}
export async function prepareNewsBrief(entry,{request,images,signal,now=Date.now()}){
 const result={...entry,category:briefCategory(entry),verified:false,coverUrl:'',imageStatus:'missing'};
 if(!trustedNewsUrl(entry.canonicalUrl))return {...result,reason:'原始来源尚未纳入可信来源，暂不自动发布'};
 if(/传闻|网传|未经证实|尚未证实|rumou?r|unconfirmed|sources say/i.test(entry.title+' '+entry.summary))return {...result,reason:'消息包含未经证实内容，暂不自动发布'};
 try{
  const raw=await request(entry.canonicalUrl,{signal,timeoutMs:12000,maxBytes:2*1024*1024});
  if(!trustedNewsUrl(raw.finalUrl||entry.canonicalUrl))return {...result,reason:'原文跳转到未核验来源'};
  const meta=articleMetadata(raw.text||'',raw.finalUrl||entry.canonicalUrl);
  if(!meta.title||!meta.summary||/access denied|just a moment|verify you are human/i.test(meta.title))return {...result,reason:'原文暂不可读取或缺少标题摘要'};
  const timestamp=Date.parse(meta.publishedAt||entry.publishedAt);
  if(!Number.isFinite(timestamp)||timestamp>now+300000||timestamp<now-72*3600000)return {...result,reason:'原文时间不明确或不在最近72小时内'};
  result.publishedAt=new Date(timestamp).toISOString();result.verified=true;result.verification='可信原文已读取';
  // Search summaries remain evidence; official English feeds use their own original metadata.
  result.evidenceSummary=cleanNewsText(meta.summary,1000);
  if(!result.summary)result.summary=result.evidenceSummary;
  const urls=[entry.imageUrl,meta.imageUrl].filter(Boolean);
  for(const url of [...new Set(urls)].slice(0,2)){
   try{const image=await request(url,{signal,binary:true,timeoutMs:10000,maxBytes:2*1024*1024});result.coverUrl=images.save(image.bytes);result.imageStatus='saved';break;}catch{result.imageStatus='failed';}
  }
  return result;
 }catch{return {...result,reason:'原文网络访问失败，暂不自动发布'};}
}
