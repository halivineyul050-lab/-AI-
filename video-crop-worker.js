import createFFmpegCore from './assets/vendor/ffmpeg/ffmpeg-core.js';
import { createCropCommand } from './video-crop-core.js';

self.onmessage = async ({data}) => {
  let ffmpeg;
  try {
    self.postMessage({type:'loading'});
    ffmpeg=await createFFmpegCore({locateFile:()=>new URL('./assets/vendor/ffmpeg/ffmpeg-core.wasm',import.meta.url).href});
    ffmpeg.setProgress(({progress})=>self.postMessage({type:'progress',progress:Math.min(0.99,Math.max(0,progress))}));
    ffmpeg.FS.writeFile('input.video',new Uint8Array(data.input));
    self.postMessage({type:'progress',progress:0});
    ffmpeg.exec(...createCropCommand(data.crop,data.width,data.height));
    if(ffmpeg.ret!==0) throw new Error('无法导出这个视频，请尝试较短的 MP4/H.264 视频。');
    const output=ffmpeg.FS.readFile('output.mp4');
    if(!output.length) throw new Error('导出文件为空，请更换视频。');
    self.postMessage({type:'done',output:output.buffer},[output.buffer]);
  } catch(error) { self.postMessage({type:'error',message:error.message||'本地导出失败，请尝试更小的视频。'}); }
  finally { ffmpeg=null; }
};
