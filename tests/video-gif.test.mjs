import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFramePlan, createGifSession } from '../video-gif-core.js';
import { validateVideoFile } from '../video-input-limits.js';

const input = { duration: 20, width: 1920, height: 1080, start: 2, end: 7, fps: 10, speed: 1, maxEdge: 480 };
test('GIF source validation accepts 500MB while frame planning retains its work guard', () => {
  assert.doesNotThrow(() => validateVideoFile({size:500 * 1024 * 1024}));
  assert.throws(() => validateVideoFile({size:500 * 1024 * 1024 + 1}));
  assert.throws(() => buildFramePlan({...input,start:0,end:20,fps:20,maxEdge:720,width:1000,height:1000}));
});
test('GIF frame planning preserves aspect ratio, trim and playback speed', () => {
  const plan = buildFramePlan(input);
  assert.deepEqual([plan.width, plan.height], [480, 270]);
  assert.equal(plan.times.length, 50);
  assert.equal(plan.times[0], 2);
  assert.ok(plan.times.at(-1) < 7);
  assert.equal(plan.delays.reduce((a,b) => a+b, 0), 5000);
  const fast = buildFramePlan({ ...input, speed: 2 });
  assert.equal(fast.times.length, 25);
  assert.equal(fast.delays.reduce((a,b) => a+b, 0), 2500);
  const small = buildFramePlan({ ...input, width: 120, height: 240 });
  assert.deepEqual([small.width, small.height], [120,240]);
});
test('GIF planning rejects invalid intervals and excessive work before allocation', () => {
  for (const patch of [{start: 8}, {start:-1}, {end:21}, {end:2}, {fps:0}, {speed:0}, {width:NaN}, {duration:Infinity}, {maxEdge:1000}, {end:40,duration:50}, {start:0,end:20,fps:20,maxEdge:720,width:1000,height:1000}]) {
    assert.throws(() => buildFramePlan({...input,...patch}));
  }
});
test('GIF encoder writes looping multiple frames with the planned delays', () => {
  const session = createGifSession(2, 2);
  for (const color of [[255,0,0,255],[0,0,255,255]]) {
    session.add(new Uint8ClampedArray(Array(4).fill(color).flat()), 100);
  }
  const bytes = session.finish();
  assert.equal(Buffer.from(bytes.subarray(0,6)).toString(), 'GIF89a');
  assert.equal(bytes[6] | bytes[7]<<8, 2);
  assert.equal(bytes[8] | bytes[9]<<8, 2);
  assert.equal(bytes.at(-1), 0x3b);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('NETSCAPE2.0')));
  let controls=0;
  for(let i=0;i<bytes.length-7;i++) if(bytes[i]===0x21 && bytes[i+1]===0xf9 && bytes[i+2]===4) {
    controls++; assert.equal(bytes[i+4] | bytes[i+5]<<8, 10);
  }
  assert.equal(controls,2);
});
