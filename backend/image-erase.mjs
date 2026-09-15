import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './validation.mjs';

const signature=Buffer.from('89504e470d0a1a0a','hex');
const error=(status,code,message)=>new HttpError(status,code,message);
function dimensions(bytes) {
  if(bytes.length<33 || !bytes.subarray(0,8).equals(signature) || bytes.readUInt32BE(8)!==13 || bytes.toString('ascii',12,16)!=='IHDR')
    throw error(422,'invalid_image','图片或选区不是有效的 PNG。');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(Math.min(width,height)<16 || Math.max(width,height)>2048 || width*height>4*1024*1024)
    throw error(422,'invalid_dimensions','图片最长边不能超过 2048px，短边至少 16px。');
  return {width,height};
}
function decode(value,maxBytes) {
  const prefix='data:image/png;base64,';
  if(typeof value!=='string'||!value.startsWith(prefix)) throw error(422,'invalid_image','请重新上传图片并绘制选区。');
  const encoded=value.slice(prefix.length);
  if(encoded.length>Math.ceil(maxBytes/3)*4) throw error(413,'image_too_large','图片数据过大，请缩小图片后重试。');
  if(!encoded || encoded.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw error(422,'invalid_image','图片编码无效。');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length>maxBytes) throw error(413,'image_too_large','图片数据过大，请缩小图片后重试。');
  return {bytes,...dimensions(bytes)};
}
export function validateEraseInput(body) {
  const image=decode(body?.image,18*1024*1024),mask=decode(body?.mask,2*1024*1024);
  if(image.width!==mask.width||image.height!==mask.height) throw error(422,'mask_mismatch','选区与图片尺寸不一致，请重新绘制。');
  return {image:image.bytes,mask:mask.bytes,width:image.width,height:image.height};
}

export function createImageEraser({python=process.env.NIKE_ERASE_PYTHON||'', model=process.env.NIKE_ERASE_MODEL||'',
  script=fileURLToPath(new URL('../scripts/image-erase.py',import.meta.url)),tempRoot=tmpdir(),timeoutMs=120000}={}) {
  let busy=false;
  const enabled=Boolean(python&&model&&existsSync(python)&&existsSync(model)&&existsSync(script));
  return {enabled, async run(body,signal) {
    if(!enabled) throw error(503,'erase_unavailable','图片消除服务暂未就绪，请稍后重试。');
    if(busy) throw error(429,'erase_busy','正在处理另一张图片，请稍后再试。');
    if(signal?.aborted) throw error(499,'cancelled','已取消处理。');
    busy=true;
    let directory;
    try {
      const input=validateEraseInput(body);
      directory=await mkdtemp(join(tempRoot,'nikai-erase-'));
      const imagePath=join(directory,'image.png'),maskPath=join(directory,'mask.png'),output=join(directory,'output.png');
      await Promise.all([writeFile(imagePath,input.image),writeFile(maskPath,input.mask)]);
      if(signal?.aborted) throw error(499,'cancelled','已取消处理。');
      await new Promise((resolve,reject)=>{
        const child=spawn(python,[script,'--image',imagePath,'--mask',maskPath,'--output',output,'--model',model],{
          windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1',PYTHONIOENCODING:'utf-8'}
        });
        let failure=null,stderr='';
        const stop=(reason)=>{failure ||= reason;child.kill('SIGKILL');};
        const abort=()=>stop(error(499,'cancelled','已取消处理。'));
        const timer=setTimeout(()=>stop(error(504,'erase_timeout','处理超时，请缩小选区或图片后重试。')),timeoutMs);
        signal?.addEventListener('abort',abort,{once:true});
        child.stderr.on('data',chunk=>{if(stderr.length<2000)stderr+=chunk.toString('utf8');});
        child.on('error',()=>{failure ||= error(503,'erase_unavailable','图片消除服务启动失败，请稍后重试。');});
        // Wait for close before releasing the slot or removing files, even after abort/error.
        child.on('close',code=>{
          clearTimeout(timer);signal?.removeEventListener('abort',abort);
          if(failure)reject(failure);
          else if(code!==0)reject(error(422,'erase_failed',code===2?stderr.trim().slice(0,300):'图片处理失败，请缩小选区后重试。'));
          else resolve();
        });
        if(signal?.aborted)abort();
      });
      if(signal?.aborted) throw error(499,'cancelled','已取消处理。');
      if((await stat(output)).size>18*1024*1024) throw error(422,'output_too_large','输出图片过大，请缩小图片后重试。');
      const result=await readFile(output),size=dimensions(result);
      if(size.width!==input.width||size.height!==input.height)throw error(422,'output_invalid','输出图片尺寸异常，请重试。');
      return result;
    } finally {
      try {if(directory)await rm(directory,{recursive:true,force:true});} finally {busy=false;}
    }
  }};
}
