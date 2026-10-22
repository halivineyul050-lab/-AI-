import createFFmpegCore from './assets/vendor/ffmpeg/ffmpeg-core.js';
import {createWatermarkCommand} from './video-watermark-core.js?v=20261021-2';
import {validateFullVideoMetadata} from './video-input-limits.js';

self.onmessage=async({data})=>{
  try{
    let args=data.type==='prepare'?null:createWatermarkCommand(data.settings);
    self.postMessage({type:'loading'});
    const ffmpeg=await createFFmpegCore({locateFile:()=>new URL('./assets/vendor/ffmpeg/ffmpeg-core.wasm',import.meta.url).href});
    ffmpeg.setProgress(({progress})=>self.postMessage({type:'progress',progress:Math.max(0,Math.min(.99,progress))}));
    ffmpeg.FS.writeFile('input.video',new Uint8Array(data.input));
    if(data.type==='prepare'){
      const probeLog=[];ffmpeg.setLogger(({message})=>{if(probeLog.length<200)probeLog.push(message);});
      ffmpeg.exec('-i','input.video','-map','0:v:0','-frames:v','1','-f','null','-');
      const log=probeLog.join('\n');
      const duration=log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const dimensions=log.match(/Video:[^\n]*?[, ](\d{1,5})x(\d{1,5})(?:[ ,\[])/);
      if(ffmpeg.ret!==0||!duration||!dimensions)throw new Error('无法识别视频，请检查文件是否完整或更换 MP4/H.264 视频。');
      validateFullVideoMetadata({width:Number(dimensions[1]),height:Number(dimensions[2]),duration:Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3])});
      ffmpeg.reset();
      args=['-i','input.video','-map','0:v:0','-map','0:a:0?','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1','-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y','output.mp4'];
    }else ffmpeg.FS.writeFile('logo.png',new Uint8Array(data.logo));
    ffmpeg.exec(...args);
    if(ffmpeg.ret!==0)throw new Error('视频导出失败，请尝试较小的 MP4/H.264 视频。');
    const output=ffmpeg.FS.readFile('output.mp4');
    if(!output.length)throw new Error('导出结果为空，请更换视频重试。');
    self.postMessage({type:'done',output:output.buffer},[output.buffer]);
  }catch(error){self.postMessage({type:'error',message:error.message||'本地处理失败，请刷新重试。'});}
};
