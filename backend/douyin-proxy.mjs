import {createServer} from 'node:http';
import {connect} from 'node:net';
import {lookup as dnsLookup} from 'node:dns/promises';
import {publicAddress} from './link-extract-core.mjs';

const hosts=['douyin.com','iesdouyin.com','douyinstatic.com','douyinpic.com','douyinvod.com','byteimg.com','bytegoofy.com','bytetos.com','bytescm.com','bytednsdoc.com'];
export function allowedDouyinPage(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}
}
// Enforce restrictions at the actual TCP connection, including every redirect destination.
export async function createDouyinProxy({lookup=dnsLookup,dial=connect}={}){
 const sockets=new Set();let bytes=0,closed=false;
 const server=createServer((_req,res)=>{res.writeHead(403);res.end();});
 const track=socket=>{
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.setTimeout?.(15000,()=>socket.destroy());
  socket.on('data',chunk=>{bytes+=chunk.length;if(bytes>64*1024*1024)for(const s of sockets)s.destroy();});
 };
 server.on('connection',track);
 server.on('connect',async(req,client,head)=>{
  const deny=()=>{if(!client.destroyed)client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
  try{
   if(closed||bytes>64*1024*1024||sockets.size>=64||!/^([a-z0-9.-]+):443$/i.test(req.url)||!allowedDouyinPage(`https://${req.url}`))return deny();
   const hostname=req.url.slice(0,-4);
   const addresses=await lookup(hostname,{all:true,family:4});
   if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))return deny();
   if(closed||client.destroyed)return;
   const upstream=dial({host:addresses[0].address,port:443});track(upstream);
   client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());
   upstream.once('connect',()=>{if(client.destroyed)return upstream.destroy();client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
  }catch{deny();}
 });
 server.headersTimeout=5000;server.requestTimeout=5000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {port:server.address().port,async close(){closed=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
