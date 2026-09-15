import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedSize, cropRect, resizeSize, sniffImage, fitCrop } from '../image-edit-core.mjs';
test('large inputs fit allocation limits while preserving proportion', () => {
  assert.deepEqual(boundedSize(12000,6000), {width:4096,height:2048});
  assert.deepEqual(boundedSize(300,600), {width:300,height:600});
  for (const x of [0,NaN,Infinity,-1]) assert.throws(()=>boundedSize(x,200));
});
test('crop clamps negative and oversized coordinates inside image',()=>{
 assert.deepEqual(cropRect({x:-20,y:90,width:999,height:100},200,100),{x:0,y:90,width:200,height:10});
 assert.throws(()=>cropRect({x:0,y:0,width:0,height:2},20,20));
});
test('locked resize computes other axis and rejects excessive canvas allocations',()=>{
 assert.deepEqual(resizeSize(300,100,600,'width',true),{width:600,height:200});
 assert.deepEqual(resizeSize(300,100,200,'height',true),{width:600,height:200});
 assert.throws(()=>resizeSize(300,100,9000,'width',true));
});
test('file type uses signature rather than suffix or claimed MIME',()=>{
 assert.equal(sniffImage(Uint8Array.from([137,80,78,71,13,10,26,10])), 'image/png');
 assert.equal(sniffImage(new TextEncoder().encode('<svg>')), null);
 assert.equal(sniffImage(Uint8Array.from([255,216,255,224])), 'image/jpeg');
});

test('locked crop moves within bounds without silently changing its ratio',()=>{
 assert.deepEqual(fitCrop({x:600,y:0,width:420,height:420},640,420,1),{x:220,y:0,width:420,height:420});
 assert.deepEqual(fitCrop({x:0,y:0,width:900,height:900},640,420,1),{x:0,y:0,width:420,height:420});
 const r=fitCrop({x:600,y:300,width:320,height:180},640,420,16/9);
 assert.deepEqual(r,{x:320,y:240,width:320,height:180});
});
