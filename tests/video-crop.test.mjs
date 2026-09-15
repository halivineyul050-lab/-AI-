import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitCrop, moveCrop, resizeCrop, resizeCropByKey, setCropSize, createCropCommand } from '../video-crop-core.js';

test('crop presets fit landscape and portrait video without leaving the picture', () => {
  assert.deepEqual(fitCrop(1920,1080,1), {x:420,y:0,width:1080,height:1080});
  assert.deepEqual(fitCrop(1080,1920,1), {x:0,y:420,width:1080,height:1080});
  const c=fitCrop(1920,1080,9/16);
  assert.ok(Math.abs(c.width/c.height-9/16)<0.002);
  assert.ok(c.x>=0 && c.y>=0 && c.x+c.width<=1920 && c.y+c.height<=1080);
  assert.equal(c.width%2,0); assert.equal(c.height%2,0);
});
test('crop accepts 4K dimensions and rejects inputs beyond the longest-edge limit', () => {
  assert.deepEqual(fitCrop(3840, 2160), {x:0,y:0,width:3840,height:2160});
  assert.throws(() => fitCrop(3841, 2160), /3840px/);
});
test('crop movement clamps at both edges while preserving dimensions', () => {
  const c={x:20,y:40,width:100,height:80};
  assert.deepEqual(moveCrop(c,-100,-100,320,180),{x:0,y:0,width:100,height:80});
  assert.deepEqual(moveCrop(c,500,500,320,180),{x:220,y:100,width:100,height:80});
});
test('corner resizing keeps the opposite corner and locks aspect ratio', () => {
  const c={x:40,y:20,width:100,height:100};
  const next=resizeCrop(c,'nw',0,0,320,180,1);
  assert.equal(next.x+next.width,140); assert.equal(next.y+next.height,120);
  assert.equal(next.width,next.height);
  const bounded=resizeCrop(c,'se',999,999,320,180,null);
  assert.deepEqual(bounded,{x:40,y:20,width:280,height:160});
});
test('precise crop size links the other dimension when a ratio is locked', () => {
  const c={x:0,y:0,width:320,height:180};
  const square=setCropSize(c,'width',120,320,180,1);
  assert.deepEqual(square,{x:0,y:0,width:120,height:120});
  assert.throws(()=>setCropSize(c,'width',NaN,320,180,null));
  const free=setCropSize(c,'height',81,320,180,null);
  assert.equal(free.height,80);
});
test('locked-ratio handles can expand outward using keyboard on all four corners', () => {
  const c={x:40,y:40,width:100,height:100};
  for(const corner of ['nw','ne','sw','se']) {
    const result=resizeCropByKey(c,corner,corner.includes('w')?-2:2,0,320,240,1);
    assert.equal(result.width,102);assert.equal(result.height,102);
    assert.equal(result.x+(corner.includes('w')?result.width:0),c.x+(corner.includes('w')?c.width:0));
    const vertical=resizeCropByKey(c,corner,0,corner.includes('n')?-2:2,320,240,1);
    assert.equal(vertical.width,102);assert.equal(vertical.height,102);
  }
});
test('export command crops the displayed orientation and preserves optional audio', () => {
  const args=createCropCommand({x:40,y:20,width:160,height:100},320,180);
  assert.equal(args[args.indexOf('-vf')+1],'scale=320:180,setsar=1,crop=160:100:40:20');
  assert.ok(args.includes('0:a:0?'));
  assert.equal(args[args.indexOf('-c:a')+1],'aac');
  assert.equal(args.at(-1),'output.mp4');
  assert.throws(()=>createCropCommand({x:300,y:0,width:160,height:100},320,180));
});
