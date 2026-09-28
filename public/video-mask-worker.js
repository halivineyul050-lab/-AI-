import createFFmpegCore from './assets/vendor/ffmpeg/ffmpeg-core.js';
import { createMaskCommand } from './video-mask-core.js?v=20260908-2';

self.onmessage=async({data})=>{
  try {
    const args=createMaskCommand(data.settings);
    self.postMessage({type:'loading'});
    const ffmpeg=await createFFmpegCore({locateFile:()=>new URL('./assets/vendor/ffmpeg/ffmpeg-core.wasm',import.meta.url).href});
    ffmpeg.setProgress(({progress})=>self.postMessage({type:'progress',progress:Math.max(0,Math.min(.99,progress))}));
    ffmpeg.FS.writeFile('input.video',new Uint8Array(data.input));
    self.postMessage({type:'progress',progress:0});
    ffmpeg.exec(...args);
    if(ffmpeg.ret!==0)throw new Error('无法处理这个视频，请尝试较小的 MP4/H.264 视频。');
    const output=ffmpeg.FS.readFile('output.mp4');
    if(!output.length)throw new Error('导出文件为空，请更换视频重试。');
    self.postMessage({type:'done',output:output.buffer},[output.buffer]);
  } catch(error){self.postMessage({type:'error',message:error.message||'本地处理失败，请刷新重试。'});}
};
