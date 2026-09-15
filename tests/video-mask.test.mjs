import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMask, effectParameters, createMaskCommand } from '../video-mask-core.js';

const settings={width:320,height:180,duration:3,region:{x:40,y:20,width:160,height:100},mode:'mosaic',strength:5,start:1,end:2};
test('mask validation rejects invalid timing and regions before processing',()=>{
  assert.doesNotThrow(()=>validateMask(settings));
  for(const patch of [{start:-1},{end:4},{start:2,end:1},{start:1,end:1},{start:NaN},{mode:'anything'},{strength:0},{strength:11},{strength:1.5},{width:3841},{duration:1800.01},{region:{x:300,y:0,width:100,height:100}},{region:{x:41,y:20,width:160,height:100}}])assert.throws(()=>validateMask({...settings,...patch}));
});
test('mask accepts 30-minute 4K video metadata',()=>{
  assert.doesNotThrow(()=>validateMask({...settings,width:3840,height:2160,duration:1800}));
});
test('stronger mosaic uses larger blocks and stronger blur remains valid for tiny regions',()=>{
  const weak=effectParameters({...settings,strength:1}),strong=effectParameters({...settings,strength:10});
  assert.ok(strong.gridWidth<weak.gridWidth);assert.ok(strong.gridHeight<weak.gridHeight);
  assert.ok(strong.radius>weak.radius);
  const tiny=effectParameters({...settings,mode:'blur',region:{x:0,y:0,width:2,height:2},strength:10});
  assert.equal(tiny.radius,1);assert.equal(tiny.chromaRadius,0);
});
test('mosaic command affects a fixed region only within the chosen interval and keeps audio',()=>{
  const args=createMaskCommand(settings),graph=args[args.indexOf('-filter_complex')+1];
  assert.match(graph,/crop=160:100:40:20/);
  assert.match(graph,/flags=neighbor/);
  assert.match(graph,/overlay=40:20:enable='gte\(t,1\)\*lt\(t,2\)'/);
  assert.ok(args.includes('0:a:0?'));assert.ok(args.includes('[out]'));assert.equal(args.at(-1),'output.mp4');
});
test('blur command uses a local blur branch instead of pixelating or blurring the whole frame',()=>{
  const args=createMaskCommand({...settings,mode:'blur'}),graph=args[args.indexOf('-filter_complex')+1];
  assert.match(graph,/\[region\]crop=160:100:40:20,boxblur=/);
  assert.doesNotMatch(graph,/flags=neighbor/);
  assert.match(graph,/\[base\]\[masked\]overlay=/);
});
test('mask export does not shift video independently from the preserved audio timeline',()=>{
  const args=createMaskCommand(settings),graph=args[args.indexOf('-filter_complex')+1];
  assert.doesNotMatch(graph,/setpts=PTS-STARTPTS/);
  assert.ok(args.includes('0:a:0?'));
});
