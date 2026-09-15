import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateImageInput, createImageTools } from '../backend/image-tools.mjs';
function png(w=64,h=64) {
  const b=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a0000000d49484452','hex').copy(b);
  b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);b[24]=8;b[25]=6;
  return 'data:image/png;base64,'+b.toString('base64');
}
test('image tools bound dimensions separately and reject non-PNG and unknown modes',()=>{
  assert.equal(validateImageInput({image:png(1024)},'background').width,1024);
  for(const [image,mode] of [[png(513),'enhance'],[png(2049),'background'],[png(15),'background'],['https://example.com/a','background'],[png(),'unknown']])
    assert.throws(()=>validateImageInput({image},mode));
});
test('background and enhancement share a slot and cancellation/timeout clean up',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'image-tools-test-'));
  try {
    const script=join(dir,'fake.mjs'),model=join(dir,'model');
    await writeFile(script,'setTimeout(()=>{},10000)');await writeFile(model,'test');
    const service=createImageTools({python:process.execPath,script,backgroundModel:model,enhanceModel:model,tempRoot:dir,timeoutMs:100});
    assert.deepEqual(service.status,{background:true,enhance:true});
    const controller=new AbortController();
    const first=service.run('background',{image:png()},controller.signal);
    const rejected=assert.rejects(first,e=>e.status===499);
    await assert.rejects(service.run('enhance',{image:png()}),e=>e.status===429);
    controller.abort();await rejected;
    await assert.rejects(service.run('enhance',{image:png()}),e=>e.status===504);
    assert.deepEqual((await readdir(dir)).sort(),['fake.mjs','model']);
  } finally {await rm(dir,{recursive:true,force:true});}
});
