import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildWatermark,watermarkPosition,createWatermarkCommand,route} from '../public/video-watermark-core.js';

const base={width:320,height:180,duration:3,logoWidth:100,logoHeight:60,mode:'internal',size:.12,opacity:.4};
test('rejects invalid watermark settings before allocating the processing engine',()=>{
  for(const patch of [{size:0},{size:.41},{opacity:0},{opacity:1.1},{mode:'unknown'},{logoWidth:0},{logoHeight:Infinity},{duration:0},{duration:1801},{width:3841},{size:.4,logoHeight:2000}])assert.throws(()=>buildWatermark({...base,...patch}));
});
test('all four trajectories keep the complete image inside a five percent margin in portrait and landscape',()=>{
  for(const mode of ['static','diagonal','patrol','internal'])for(const [width,height] of [[1920,1080],[1080,1920]]){
    const p=buildWatermark({...base,width,height,mode});
    for(let i=0;i<=1000;i++){
      const {x,y}=watermarkPosition(p,p.duration*i/1000);
      assert(x>=width*.05-1e-6&&y>=height*.05-1e-6);
      assert(x+p.logoWidth<=width*.95+1e-6&&y+p.logoHeight<=height*.95+1e-6);
    }
  }
});
test('skill paths preserve anchors, orientation and static/diagonal endpoints',()=>{
  assert.deepEqual(route('static'),[[-.72,.72],[-.72,.72]]);
  assert.deepEqual(route('diagonal'),[[-.72,.72],[.72,-.72]]);
  const p=buildWatermark({...base,mode:'diagonal'});
  const start=watermarkPosition(p,0),end=watermarkPosition(p,3);
  assert(start.x<end.x&&start.y<end.y);
  const fixed=buildWatermark({...base,mode:'static'});
  assert.deepEqual(watermarkPosition(fixed,0),watermarkPosition(fixed,2));
  assert.deepEqual(watermarkPosition(p,-5),start);
  assert.deepEqual(watermarkPosition(p,30),end);
});
test('time assigned to each segment maintains equal speed in actual canvas dimensions',()=>{
  const p=buildWatermark({...base,width:1080,height:1920});
  const speeds=p.points.slice(1).map((b,i)=>{const a=p.points[i];return Math.hypot(b.x-a.x,b.y-a.y)/(b.t-a.t);});
  for(const speed of speeds)assert(Math.abs(speed-speeds[0])<1e-6);
});
test('MP4 export preserves optional audio, alpha and shares trajectory expressions with preview',()=>{
  const args=createWatermarkCommand(base),graph=args[args.indexOf('-filter_complex')+1];
  assert(args.includes('0:a:0?'));assert(args.includes('libx264'));assert(args.includes('aac'));
  assert.match(graph,/format=rgba,colorchannelmixer=aa=0.4/);
  assert.match(graph,/overlay=x='/);assert.match(graph,/eof_action=repeat/);
  assert.equal(args.at(-1),'output.mp4');
});
