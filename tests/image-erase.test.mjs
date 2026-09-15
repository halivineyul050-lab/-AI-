import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateEraseInput, createImageEraser } from '../backend/image-erase.mjs';

function png(w=64,h=64) {
  const b=Buffer.alloc(33); Buffer.from('89504e470d0a1a0a0000000d49484452','hex').copy(b);
  b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);b[24]=8;b[25]=6;
  return 'data:image/png;base64,'+b.toString('base64');
}
test('eraser validates PNG signature, dimensions, same-sized mask and bounded input',()=>{
  assert.equal(validateEraseInput({image:png(),mask:png()}).width,64);
  for(const body of [{image:'https://a.test/x',mask:png()},{image:png(4096),mask:png(4096)},
    {image:png(),mask:png(32)},{image:png(1),mask:png(1)},{image:'data:image/png;base64,AAAA',mask:png()}])
    assert.throws(()=>validateEraseInput(body));
});
test('eraser serializes work, cancels child and removes request directories',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'erase-test-'));
  const script=join(dir,'fake.mjs'), model=join(dir,'model');
  await writeFile(script,"setTimeout(()=>{},10000)");await writeFile(model,'test');
  const service=createImageEraser({python:process.execPath,script,model,tempRoot:dir,timeoutMs:1000});
  const abort=new AbortController();
  const first=service.run({image:png(),mask:png()},abort.signal);
  const rejected=assert.rejects(first,/取消/);
  await assert.rejects(service.run({image:png(),mask:png()}),e=>e.status===429);
  abort.abort();await rejected;
  assert.deepEqual((await readdir(dir)).sort(),['fake.mjs','model']);
  const timed=service.run({image:png(),mask:png()});
  await assert.rejects(timed,/超时/);
  assert.deepEqual((await readdir(dir)).sort(),['fake.mjs','model']);
  await rm(dir,{recursive:true,force:true});
});
