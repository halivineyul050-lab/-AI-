import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedDouyinPage,extractPublicDouyin} from '../backend/douyin-public.mjs';
import {createLinkExtractor} from '../backend/link-extract.mjs';

test('public browser requests permit only known platform assets, never arbitrary hosts',()=>{
 for(const host of ['www.douyin.com','www.iesdouyin.com','lf-cdn-tos.bytescm.com','lf3-static.bytednsdoc.com'])assert.equal(allowedDouyinPage(`https://${host}/a`),true);
 for(const url of ['http://www.douyin.com/a','https://127.0.0.1/','https://douyin.com.evil.test/','https://user@www.douyin.com/','https://www.douyin.com:444/','file:///etc/passwd','https://evil.test/'])assert.equal(allowedDouyinPage(url),false,url);
});
test('public extractor refuses other platforms before launching a browser',async()=>{
 await assert.rejects(extractPublicDouyin({platform:'xiaohongshu',url:'https://xhslink.com/o/a'},AbortSignal.timeout(1000)),/抖音/);
});
test('public tickets belong to one account and public parsing is bounded and video-only',async()=>{
 let resolve;
 const service=createLinkExtractor({publicMode:true,extractPublic:async()=>new Promise(r=>resolve=r)});
 assert.equal(service.enabled,true);
 await assert.rejects(service.parse('https://v.douyin.com/abc/',AbortSignal.timeout(1000)),/登录/);
 await assert.rejects(service.parse('https://xhslink.com/o/a',AbortSignal.timeout(1000),'1'),/抖音/);
 const pending=service.parse('https://v.douyin.com/abc/',AbortSignal.timeout(1000),'1');
 await assert.rejects(service.parse('https://v.douyin.com/abc/',AbortSignal.timeout(1000),'2'),/正在解析/);
 resolve({platform:'douyin',id:'123',video:'https://v1.douyinvod.com/a.mp4',cover:null,text:'caption',source:'https://www.douyin.com/video/123'});
 const result=await pending;assert.equal(result.audio,null);
 const id=result.video.split('/').at(-2);
 await assert.rejects(service.download(id,'video',{}, {},AbortSignal.timeout(1000),'2'),/过期|不可用/);
 await assert.rejects(service.download(id,'audio',{}, {},AbortSignal.timeout(1000),'1'),/音频/);
 const coverOnly=createLinkExtractor({publicMode:true,extractPublic:async()=>({cover:'https://p1.douyinpic.com/a.jpg'})});
 await assert.rejects(coverOnly.parse('https://v.douyin.com/abc/',AbortSignal.timeout(1000),'1'),/视频/);
});
test('public ticket capacity never evicts a still-valid download',async()=>{
 let calls=0;
 const service=createLinkExtractor({publicMode:true,extractPublic:async()=>{calls++;return {platform:'douyin',id:'123',video:'https://v1.douyinvod.com/a.mp4'};}});
 let first;
 for(let i=0;i<100;i++){const r=await service.parse('https://v.douyin.com/abc/',AbortSignal.timeout(1000),'1');first??=r;}
 await assert.rejects(service.parse('https://v.douyin.com/abc/',AbortSignal.timeout(1000),'1'),/任务较多/);
 assert.equal(calls,100);
 // Reaches the kind check, proving the original ticket remains authorized and present.
 await assert.rejects(service.download(first.video.split('/').at(-2),'invalid',{}, {},AbortSignal.timeout(1000),'1'),/类型/);
});
