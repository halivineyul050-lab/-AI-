import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShare, normalizeDouyin, normalizeXhs, allowedMedia, publicAddress } from '../backend/link-extract-core.mjs';
test('share text extracts exact supported link and retains Xiaohongshu signed parameters',()=>{
 assert.equal(parseShare('文字 [https://v.douyin.com/Zz3vFYpegDw/](https://v.douyin.com/Zz3vFYpegDw/) 复制').platform,'douyin');
 assert.equal(parseShare('https://www.xiaohongshu.com/explore/abcdef123456789012345678?xsec_token=abc&xsec_source=pc').url,'https://www.xiaohongshu.com/explore/abcdef123456789012345678?xsec_token=abc&xsec_source=pc');
 assert.equal(parseShare('http://xhslink.com/o/abc123').url,'https://xhslink.com/o/abc123');
 for(const s of ['https://v.douyin.com.evil.test/a','https://evil.test/','https://user@v.douyin.com/a','http://127.0.0.1/','https://v.douyin.com:444/a']) assert.throws(()=>parseShare(s));
});
test('Douyin matches exact ID and chooses playback instead of watermarked download or background music',()=>{
 const item={aweme_id:'123',desc:'正文',music:{play_url:{url_list:['https://music.test/wrong.mp3']}},video:{has_watermark:true,duration:3000,play_addr_h264:{url_list:['https://v1.douyinvod.com/movie.mp4']},cover:{url_list:['https://p1.douyinpic.com/cover.jpg']},download_addr:{url_list:['https://v1.douyinvod.com/watermarked.mp4']}}};
 assert.equal(normalizeDouyin(item,'999'),null);
 const r=normalizeDouyin(item,'123');assert.equal(r.video,'https://v1.douyinvod.com/movie.mp4');assert.equal(r.text,'正文');assert.equal(r.watermark,'source-marked');assert.equal(r.duration,3);assert.equal(r.audio,undefined);
});
test('Xiaohongshu picks the requested note, never a recommendation',()=>{
 const item={note_id:'abc',title:'标题',desc:'正文',video:{media:{stream:{h264:[{master_url:'http://sns-video-bd.xhscdn.com/a.mp4'}]}}},image_list:[{url_default:'https://sns-img-bd.xhscdn.com/a.jpg'}]};
 assert.equal(normalizeXhs(item,'other'),null);assert.equal(normalizeXhs(item,'abc').video,'https://sns-video-bd.xhscdn.com/a.mp4');
});
test('media destinations reject private networks and lookalike hosts',()=>{
 assert.equal(allowedMedia('https://v1.douyinvod.com/a'),true);
 for(const u of ['https://evil.test/a','https://douyinvod.com.evil.test/a','file:///etc/passwd','https://v1.douyinvod.com:99/a','https://user@v1.douyinvod.com/a']) assert.equal(allowedMedia(u),false);
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1','fc00::1','100.64.0.1','0.0.0.0'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('audio uses only the video audio track, not the post music',()=>{
 const r=normalizeDouyin({aweme_id:'1',video:{bit_rate_audio:[{audio_meta:{media_type:'audio',url_list:{main_url:'https://v1.douyinvod.com/media-audio-und-mp4a/'}}}]}},'1');
 assert.equal(r.audioSource,'https://v1.douyinvod.com/media-audio-und-mp4a/');
});
