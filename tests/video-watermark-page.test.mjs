import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';

test('watermark page is discoverable and its engine is allowed by the page and worker CSP',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nikai-watermark-test-'));
  const app=buildApplication({dbPath:join(dir,'test.db'),logger:false,analyticsSalt:'watermark-test-salt'});
  try{
    const address=await app.listen(0,'127.0.0.1'),base=`http://127.0.0.1:${address.port}`;
    const response=await fetch(base+'/utilities/video-watermark');assert.equal(response.status,200);
    const html=await response.text();assert.match(html,/视频加水印/);assert.match(html,/watermark-logo-file/);
    assert.match(response.headers.get('content-security-policy'),/wasm-unsafe-eval/);
    assert.match(response.headers.get('content-security-policy'),/media-src 'self' blob:/);
    assert.match(response.headers.get('content-security-policy'),/img-src 'self' data: blob:/);
    for(const name of ['video-watermark.css','video-watermark.js','video-watermark-core.js','video-watermark-worker.js']){
      const asset=await fetch(base+'/'+name);assert.equal(asset.status,200,name);
      if(name.endsWith('-worker.js'))assert.match(asset.headers.get('content-security-policy'),/wasm-unsafe-eval/);
    }
    assert.match(await (await fetch(base+'/utilities')).text(),/href="\/utilities\/video-watermark"/);
    assert.match(await (await fetch(base+'/sitemap.xml')).text(),/\/utilities\/video-watermark/);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
