import test from 'node:test';
import assert from 'node:assert/strict';
import {connect} from 'node:net';
import {PassThrough} from 'node:stream';
import {createDouyinProxy} from '../backend/douyin-proxy.mjs';

test('browser egress proxy rejects every forbidden CONNECT and pins allowed connections to validated IPv4',async t=>{
 const dialed=[];
 const proxy=await createDouyinProxy({lookup:async host=>[{address:host==='private.douyin.com'?'127.0.0.1':'8.8.8.8',family:4}],dial:options=>{dialed.push(options);const stream=new PassThrough();queueMicrotask(()=>stream.emit('connect'));return stream;}});
 t.after(()=>proxy.close());
 const attempt=target=>new Promise((resolve,reject)=>{const s=connect(proxy.port,'127.0.0.1',()=>s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));s.once('data',d=>{resolve(d.toString());s.destroy();});s.on('error',reject);});
 for(const target of ['127.0.0.1:443','evil.test:443','douyin.com.evil.test:443','www.douyin.com:80','private.douyin.com:443','user@www.douyin.com:443'])assert.match(await attempt(target),/^HTTP\/1.1 403/);
 assert.equal(dialed.length,0);
 assert.match(await attempt('www.douyin.com:443'),/^HTTP\/1.1 200/);
 assert.equal(dialed.length,1);assert.deepEqual(dialed[0],{host:'8.8.8.8',port:443});
 // A new destination after any redirect must establish another tunnel and is checked again.
 assert.match(await attempt('169.254.169.254:443'),/^HTTP\/1.1 403/);assert.equal(dialed.length,1);
});
