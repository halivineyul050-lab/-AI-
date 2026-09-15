import { isIP } from 'node:net';

const shareHosts = new Map([
 ['v.douyin.com','douyin'], ['www.douyin.com','douyin'], ['www.iesdouyin.com','douyin'],
 ['xhslink.com','xiaohongshu'], ['www.xhslink.com','xiaohongshu'], ['www.xiaohongshu.com','xiaohongshu']
]);
export function parseShare(text) {
 if(typeof text!=='string'||text.length>8000) throw new Error('请粘贴 8000 字以内的分享内容。');
 const links=[...new Set((text.match(/https?:\/\/[^\s<>"'\[\]()，。！；]+/g)||[]))];
 if(links.length!==1) throw new Error('请每次粘贴一条抖音或小红书链接。');
 const u=new URL(links[0]);const platform=shareHosts.get(u.hostname);
 if(u.protocol==='http:')u.protocol='https:';
 if(!platform||u.username||u.password||u.port||u.protocol!=='https:')throw new Error('暂时只支持 HTTPS 抖音、小红书分享链接。');
 const id=platform==='douyin'?u.pathname.match(/\/(?:share\/)?video\/(\d+)/)?.[1]:u.pathname.match(/\/(?:explore|discovery\/item)\/([a-z\d]+)/i)?.[1];
 if(!id && !['v.douyin.com','xhslink.com','www.xhslink.com'].includes(u.hostname))throw new Error('请使用具体作品的分享链接。');
 u.hash='';return {url:u.href,platform,id};
}
export function allowedMedia(value) {
 try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['douyinvod.com','douyinpic.com','byteimg.com','ibytedtos.com','bytecdn.cn','xhscdn.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}
}
export function publicAddress(ip) {
 if(isIP(ip)!==4)return false; // Only resolved public IPv4 addresses are used for media requests.
 const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);
}
function media(value) {const u=typeof value==='string'?value.replace(/^http:/,'https:'):'';return allowedMedia(u)?u:null;}
function address(v) {return (v?.url_list||v?.urlList||[]).map(media).find(Boolean)||null;}
export function normalizeDouyin(item,id) {
 if(!item||String(item.aweme_id)!==String(id))return null;
 const v=item.video||{};
 return {platform:'douyin',id:String(id),title:String(item.desc||'抖音视频').slice(0,180),text:String(item.desc||'').slice(0,20000),author:String(item.author?.nickname||''),
 video:address(v.play_addr_h264)||address(v.play_addr),cover:address(v.origin_cover)||address(v.cover),duration:Number(v.duration||0)/1000,
 audioSource:(v.bit_rate_audio||[]).filter(a=>a.audio_meta?.media_type==='audio').map(a=>media(a.audio_meta.url_list?.main_url)).find(Boolean)||null,
 watermark:v.has_watermark===true?'source-marked':v.has_watermark===false?'source-unmarked':'unknown'};
}
export function normalizeXhs(item,id) {
 if(!item||String(item.note_id||item.noteId||item.id)!==String(id))return null;
 const streams=item.video?.media?.stream?.h264||[];
 const pictures=item.image_list||item.imageList||[];
 const first=pictures[0]||{};
 return {platform:'xiaohongshu',id:String(id),title:String(item.title||'小红书笔记').slice(0,180),text:[item.title,item.desc].filter(Boolean).join('\n\n').slice(0,20000),author:String(item.user?.nickname||''),
 video:streams.map(s=>media(s.master_url||s.masterUrl)).find(Boolean)||null,
 cover:media(first.url_default||first.urlDefault||first.url)||null,duration:Number(item.video?.media?.video?.duration||0),watermark:'unknown'};
}
