import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateFullVideoMetadata} from '../public/video-input-limits.js';

async function prepare(metadata){
  const messages=[],commands=[];let logger;
  const engine={ret:0,FS:{writeFile(){},readFile(name){return name==='metadata.json'?JSON.stringify(metadata):new Uint8Array([1,2,3]);}},setLogger(fn){logger=fn;},setProgress(){},reset(){},exec(...args){if(args.includes('null')){logger({message:'Duration: 00:00:'+metadata.format.duration+', start: 0.0'});logger({message:'Stream #0:0: Video: mpeg4, yuv420p, '+metadata.streams[0].width+'x'+metadata.streams[0].height+', 24 fps'});}else commands.push(args);}};
  const code=(await readFile(new URL('../public/video-watermark-worker.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/video-watermark-worker.js'));
  const self={postMessage(message){messages.push(message);}};
  vm.runInNewContext(code,{self,createFFmpegCore:async()=>engine,createWatermarkCommand(){throw new Error('not an export');},validateFullVideoMetadata,Uint8Array,URL,TextDecoder});
  await self.onmessage({data:{type:'prepare',input:new ArrayBuffer(2)}});
  return {messages,commands};
}
test('unsupported browser codecs are converted locally into playable H264 MP4',async()=>{
  const {messages,commands}=await prepare({streams:[{width:320,height:180}],format:{duration:'2'}});
  assert.equal(messages.at(-1).type,'done');
  assert(commands[0].includes('libx264'));
  assert(commands[0].includes('yuv420p'));
});
test('compatibility conversion checks source limits before encoding',async()=>{
  const {messages,commands}=await prepare({streams:[{width:7680,height:4320}],format:{duration:'2'}});
  assert.equal(messages.at(-1).type,'error');assert.match(messages.at(-1).message,/3840/);assert.equal(commands.length,0);
});
test('cancel also aborts loading the converted preview',async()=>{
  const source=await readFile(new URL('../public/video-watermark.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('async function chooseVideo'),source.indexOf('async function chooseLogo'));
  let calls=0,ready,previewSignal;
  const loading=new Promise(resolve=>{ready=resolve;});
  const elements=new Map();
  const context={busy:false,videoVersion:0,videoLoading:null,disposed:false,sourceURL:null,worker:null,exportAbort:null,
    AbortController,File,DOMException,URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},
    $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},
    resetVideo(){},clearResult(){},update(){},validateVideoFile(){},status(){},lock(){},
    prepareVideo:async()=>new ArrayBuffer(2),
    loadVideo:async(url,signal)=>{if(++calls===1)throw new Error('codec');previewSignal=signal;ready();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancel','AbortError')),{once:true}));}
  };
  vm.createContext(context);vm.runInContext(code,context);
  const selection=context.chooseVideo(new File(['x'],'clip.mp4',{type:'video/mp4'}));
  await loading;
  assert.equal(previewSignal,context.exportAbort.signal);
  context.exportAbort.abort();await selection;assert.equal(previewSignal.aborted,true);
});

