import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { spawn } from 'node:child_process';
import { parseShare, allowedMedia, publicAddress } from './link-extract-core.mjs';
import { extractInBrowser } from './link-extract-browser.mjs';

const MAX_BYTES=1024**3;
export async function openMedia(value,{signal,range,redirects=0}={}) {
 if(!allowedMedia(value)||redirects>4)throw new Error('媒体地址不可用，请重新解析。');
 const u=new URL(value);const addresses=await lookup(u.hostname,{all:true,family:4});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('媒体地址未通过校验。');
 signal?.throwIfAborted();
 const res=await new Promise((resolve,reject)=>{
  const req=httpsRequest(u,{signal,headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','Referer':u.hostname.endsWith('.xhscdn.com')?'https://www.xiaohongshu.com/':'https://www.douyin.com/','Accept-Encoding':'identity',...(range?{Range:range}:{})},lookup:(_h,options,cb)=>options.all?cb(null,[addresses[0]]):cb(null,addresses[0].address,4)},resolve);
  req.setTimeout(30000,()=>req.destroy(new Error('媒体服务器响应超时。')));req.on('error',reject);req.end();
 });
 if([301,302,303,307,308].includes(res.statusCode)){res.destroy();return openMedia(new URL(res.headers.location,u).href,{signal,range,redirects:redirects+1});}
 if(![200,206].includes(res.statusCode)){res.destroy();throw new Error('源文件暂时无法下载，请重新解析或稍后再试。');}
 if(Number(res.headers['content-length'])>MAX_BYTES){res.destroy();throw new Error('源视频超过 1GiB，本次无法处理。');}
 const type=String(res.headers['content-type']||'').split(';')[0];
 if(!/^(video\/mp4|audio\/(mp4|mpeg)|image\/(jpeg|png|webp)|application\/octet-stream)$/.test(type)){res.destroy();throw new Error('来源未返回支持的媒体文件。');}
 return res;
}
function byteLimit(){let bytes=0;return new Transform({transform(chunk,_encoding,cb){bytes+=chunk.length;cb(bytes>MAX_BYTES?new Error('文件超过 1GiB 限制。'):null,chunk);}});}
export async function convertAudio(input,output,{signal,ffmpeg=process.env.NIKE_FFMPEG_PATH||'ffmpeg'}={}) {
 await new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-nostdin','-v','error','-protocol_whitelist','file,pipe','-f','mov','-i',input,'-map','0:a:0','-vn','-c:a','libmp3lame','-q:a','2','-y',output],{windowsHide:true,signal,stdio:['ignore','ignore','pipe']});
  let error='',processError=null;child.stderr.on('data',d=>{error=(error+d.toString()).slice(-1000);});
  child.on('error',e=>{processError=e;});
  child.on('close',code=>code===0&&!processError?resolve():reject(new Error(processError?'音频处理已停止或不可用，请检查本机 FFmpeg。':/matches no streams/.test(error)?'这个视频没有可提取的音轨。':'音频提取失败，请确认视频可正常播放后重试。')));
 });
}
export function createLinkExtractor({endpoint=process.env.NIKE_LINK_BROWSER_WS||'',portFile=process.env.NIKE_LINK_BROWSER_FILE||''}={}) {
 const tickets=new Map();let parsing=false,audioBusy=false;
 function ticket(id){const value=tickets.get(id);if(!value||value.expires<Date.now()){tickets.delete(id);throw new Error('下载链接已过期，请重新解析。');}return value;}
 return {
  enabled:Boolean(endpoint||portFile),
  async parse(text,signal){
   if(!endpoint&&!portFile)throw new Error('本机解析尚未启用。请配置本机浏览器连接后使用。');
   const share=parseShare(text);if(parsing)throw new Error('已有一条链接正在解析，请稍后再试。');parsing=true;
   try{let ws=endpoint;if(portFile){let info;try{info=(await readFile(portFile,'utf8')).trim().split(/\r?\n/);}catch{throw new Error('无法读取本机浏览器连接，请先打开解析浏览器并启用远程调试。');}if(!/^\d+$/.test(info[0])||!/^\/devtools\/browser\/[a-z\d-]+$/i.test(info[1]))throw new Error('本机浏览器连接文件无效。');ws=`ws://127.0.0.1:${info[0]}${info[1]}`;}
    const result=await extractInBrowser(share,ws,signal);for(const [id,t] of tickets)if(t.expires<Date.now())tickets.delete(id);if(tickets.size>=30)tickets.delete(tickets.keys().next().value);
    const id=randomBytes(24).toString('hex');tickets.set(id,{...result,expires:Date.now()+20*60*1000});
    const {audioSource,...publicResult}=result;
    return {...publicResult,video:result.video?`/api/utilities/link-extract/${id}/video`:null,cover:result.cover?`/api/utilities/link-extract/${id}/cover`:null,audio:result.video||audioSource?`/api/utilities/link-extract/${id}/audio`:null};
   }finally{parsing=false;}
  },
  async download(id,kind,request,response,signal){
   const item=ticket(id);if(!['video','audio','cover'].includes(kind))throw new Error('不支持的下载类型。');
   const source=kind==='cover'?item.cover:kind==='audio'?(item.audioSource||item.video):item.video;if(!source)throw new Error('该作品没有此资源。');
   if(kind==='audio'){
    if(audioBusy)throw new Error('已有音频正在提取，请完成后重试。');audioBusy=true;let dir;
    try{dir=await mkdtemp(join(tmpdir(),'nike-audio-'));const input=join(dir,'input.mp4'),output=join(dir,'audio.mp3');
     const remote=await openMedia(source,{signal});await pipeline(remote,byteLimit(),createWriteStream(input),{signal});await convertAudio(input,output,{signal});
     response.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':(await stat(output)).size,'Content-Disposition':`attachment; filename="${item.platform}-${item.id}.mp3"`});
     await pipeline(createReadStream(output),response,{signal});
    }finally{try{if(dir)await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:150});}finally{audioBusy=false;}}
   }else{
    const range=request.headers.range;if(range&&!/^bytes=\d*-\d*$/.test(range))throw new Error('不支持的媒体范围。');
    const remote=await openMedia(source,{signal,range});const type=String(remote.headers['content-type']||'').split(';')[0];
    const ext=kind==='video'?'mp4':({'image/png':'png','image/webp':'webp'}[type]||'jpg');
    const headers={'Content-Type':type,'Content-Disposition':`${new URL(request.url,'http://localhost').searchParams.has('download')?'attachment':'inline'}; filename="${item.platform}-${item.id}.${ext}"`,'Accept-Ranges':'bytes'};
    for(const key of ['content-length','content-range'])if(remote.headers[key])headers[key]=remote.headers[key];
    response.writeHead(remote.statusCode,headers);await pipeline(remote,byteLimit(),response,{signal});
   }
  }
 };
}
