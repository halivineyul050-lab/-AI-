import { parseShare, normalizeDouyin, normalizeXhs } from './link-extract-core.mjs';

// Read only the requested work's response; never export browser credentials or user state.
export async function extractInBrowser(share, endpoint, signal) {
 const u=new URL(endpoint);
 if(u.protocol!=='ws:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('解析浏览器必须配置为本机调试连接。');
 const ws=new WebSocket(endpoint);let seq=0,sid,targetId;const pending=new Map(), bodies=new Map(), candidates=[];
 const timeoutSignal=AbortSignal.any([signal,AbortSignal.timeout(45000)]);
 const call=(method,params={},sessionId=sid)=>new Promise((resolve,reject)=>{
  if(ws.readyState!==1)return reject(new Error('本机浏览器连接已断开。'));
  const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('浏览器响应超时。'));},8000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
 });
 const close=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('解析已停止。'));}pending.clear();ws.close();};
 ws.addEventListener('message',async e=>{
  const m=JSON.parse(e.data);
  if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error('浏览器读取失败。')):p.resolve(m.result);}return;}
  if(m.sessionId!==sid)return;
  if(m.method==='Network.responseReceived'){
   const r=m.params.response;let url;try{url=new URL(r.url);}catch{return;}
   if((url.hostname.endsWith('.douyin.com')&&url.pathname==='/aweme/v1/web/aweme/detail/')||(url.hostname.endsWith('.xiaohongshu.com')&&url.pathname==='/api/sns/web/v1/feed'))bodies.set(m.params.requestId,true);
  }
  if(m.method==='Network.loadingFinished'&&bodies.delete(m.params.requestId)&&m.params.encodedDataLength<4000000){
   try{const r=await call('Network.getResponseBody',{requestId:m.params.requestId});const j=JSON.parse(r.base64Encoded?Buffer.from(r.body,'base64').toString():r.body);if(j.aweme_detail)candidates.push(j.aweme_detail);for(const i of j.data?.items||[])if(i.note_card)candidates.push({...i.note_card,note_id:i.id});}catch{}
  }
 });
 try{
  await new Promise((resolve,reject)=>{const fail=()=>reject(new Error('无法连接本机解析浏览器，请确认 Chrome 已开启远程调试。'));ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',fail,{once:true});timeoutSignal.addEventListener('abort',fail,{once:true});});
  timeoutSignal.throwIfAborted();
  targetId=(await call('Target.createTarget',{url:'about:blank',background:true})).targetId;
  sid=(await call('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  await call('Network.enable',{maxResourceBufferSize:4000000,maxTotalBufferSize:8000000});
  await call('Page.navigate',{url:share.url});
  while(!timeoutSignal.aborted){
   const r=await call('Runtime.evaluate',{expression:`JSON.stringify({url:location.href, note: (()=>{const id=location.pathname.match(/\\/(?:explore|discovery\\/item)\\/([a-z\\d]+)/i)?.[1];return window.__INITIAL_STATE__?.note?.noteDetailMap?.[id]?.note||null})()})`,returnByValue:true});
   let page;try{page=JSON.parse(r.result.value);}catch{}
   if(page){
    let current;try{current=parseShare(page.url);}catch{}
    if(current?.id&&current.platform===share.platform&&(!share.id||share.id===current.id)){
     if(page.note)candidates.push(page.note);
     for(const candidate of candidates){const result=share.platform==='douyin'?normalizeDouyin(candidate,current.id):normalizeXhs(candidate,current.id);if(result&&(result.video||result.cover||result.text))return {...result,source:current.url};}
    }
   }
   await new Promise(r=>setTimeout(r,600));
  }
  throw new Error('未获取到作品数据。请检查链接，或先在本机浏览器打开该作品完成登录/验证后重试。');
 }finally{
  if(targetId&&ws.readyState===1)await call('Target.closeTarget',{targetId},null).catch(()=>{});
  close();
 }
}
