import {spawn as nodeSpawn} from 'node:child_process';
import {existsSync,readFileSync,statSync,realpathSync} from 'node:fs';
import {dirname,join,resolve,isAbsolute,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Validate PNG structure and bounded pixel decompression. This does not decode QR content.
function validPng(bytes){try{
 if(bytes.length<57||bytes.length>8*1024*1024||!bytes.subarray(0,8).equals(PNG_SIGNATURE))return false;
 let offset=8,header=null,ended=false,palette=false,idatEnded=false;const compressed=[];
 while(offset<bytes.length){if(offset+12>bytes.length)return false;const size=bytes.readUInt32BE(offset),end=offset+12+size;if(end>bytes.length)return false;const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+size);if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))return false;
  if(!header&&type!=='IHDR')return false;
  if(type==='IHDR'){if(header||size!==13)return false;const width=data.readUInt32BE(0),height=data.readUInt32BE(4),depth=data[8],color=data[9],allowed={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};if(!width||!height||width>8192||height>8192||!allowed[color]?.includes(depth)||data[10]||data[11]||data[12])return false;const channels={0:1,2:3,3:1,4:2,6:4}[color],rowBytes=Math.ceil(width*channels*depth/8),expected=(rowBytes+1)*height;if(expected>32*1024*1024)return false;header={height,color,rowBytes,expected};}
  else if(type==='PLTE'){if(palette||compressed.length||!size||size%3||size>768)return false;palette=true;}
  else if(type==='IDAT'){if(idatEnded||(header.color===3&&!palette))return false;compressed.push(data);}
  else if(type==='IEND'){if(size||!compressed.length||end!==bytes.length)return false;ended=true;offset=end;break;}
  else {if(type[0]===type[0].toUpperCase())return false;if(compressed.length)idatEnded=true;}
  offset=end;
 }
 if(!ended)return false;const pixels=inflateSync(Buffer.concat(compressed),{maxOutputLength:header.expected+1});if(pixels.length!==header.expected)return false;for(let row=0;row<header.height;row++)if(pixels[row*(header.rowBytes+1)]>4)return false;return true;
 }catch{return false;}}
const DEFAULT_CLI='D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
function localPath(value,label){if(typeof value!=='string'||!value||value.startsWith('-')||/[\x00-\x1f\x7f]/.test(value)||/^\\\\|^\/\//.test(value))throw Error(label+'必须为本地路径');return resolve(value);}
function toolPaths(cli){const batch=localPath(cli??DEFAULT_CLI,'CLI');if(!isAbsolute(batch)||!['.bat','.js'].includes(extname(batch).toLowerCase()))throw Error('请选择官方 cli.bat 或 cli.js');const dir=dirname(batch),exe=join(dir,'node.exe'),script=join(dir,'cli.js');for(const file of [batch,exe,script])if(!existsSync(file)||!statSync(file).isFile())throw Error('找不到官方开发者工具文件：'+file);return {exe:realpathSync(exe),script:realpathSync(script)};}
export async function runDevtools(options,{spawn=nodeSpawn,timeoutMs=120000}={}){
 if(!options||Object.keys(options).some(k=>!['command','cli','project','qrOutput','version','description'].includes(k)))throw Error('未知参数');
 const {command}=options;if(!['doctor','islogin','preview','upload'].includes(command))throw Error('只支持 doctor、islogin、preview、upload');
 const {exe,script}=toolPaths(options.cli);
 if(command==='doctor')return {ok:true,status:'tool_found',exe,script,notice:'仅检查本地工具文件；请手工开启开发者工具服务端口后执行 islogin。'};
 const args=[script,command];let qrOutput;
 if(command==='preview'||command==='upload'){
  const project=localPath(options.project,'项目');if(!existsSync(project)||!statSync(project).isDirectory())throw Error('项目目录不存在');
  const config=JSON.parse(readFileSync(join(project,'project.config.json'),'utf8'));if(config.compileType!=='miniprogram'||!/^wx[0-9a-fA-F]{16}$/.test(config.appid??''))throw Error('需要原生小程序配置和有效 AppID');args.push('--project',realpathSync(project));
  if(command==='preview'){qrOutput=localPath(options.qrOutput,'二维码输出');if(extname(qrOutput).toLowerCase()!=='.png'||!existsSync(dirname(qrOutput))||existsSync(qrOutput))throw Error('二维码输出应为尚不存在的本地 PNG 文件');args.push('--qr-format','image','--qr-output',qrOutput);}
  else {if(typeof options.version!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/.test(options.version)||typeof options.description!=='string'||!options.description.trim()||options.description.length>200||/[\x00-\x1f\x7f]/.test(options.description)||options.description.startsWith('-'))throw Error('显式上传需提供安全版本号和1至200字说明');args.push('--version',options.version,'--desc',options.description);}
 }
 const output=await new Promise((resolvePromise,reject)=>{let stdout='',stderr='',settled=false,timer;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolvePromise(value);};let child;try{child=spawn(exe,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}catch(error){finish(error);return;}const append=(key,data)=>{if(key==='out')stdout+=String(data);else stderr+=String(data);if(stdout.length+stderr.length>1024*1024){child.kill();finish(Error('官方 CLI 输出超限'));}};child.stdout?.on('data',d=>append('out',d));child.stderr?.on('data',d=>append('err',d));child.on('error',e=>finish(e));child.on('close',(code,signal)=>{if(code!==0||signal)finish(Error('官方 CLI 失败：'+(stderr||stdout||signal||code).slice(-2000)));else if(/(?:error|failed|未登录|not logged|未开启|未启动|服务端口)/i.test(stdout+'\n'+stderr))finish(Error('官方 CLI 未完成：'+(stderr||stdout).slice(-2000)));else finish(null,{stdout,stderr});});timer=setTimeout(()=>{child.kill();finish(Error('官方 CLI 超时；请检查服务端口与登录状态'));},timeoutMs);});
 if(qrOutput){if(!existsSync(qrOutput)||!statSync(qrOutput).isFile()||statSync(qrOutput).size>8*1024*1024||!validPng(readFileSync(qrOutput)))throw Error('官方 CLI 未生成有效的 PNG 预览图像');}
 return {ok:true,status:command==='upload'?'uploaded':command==='preview'?'preview_generated':'login_checked',published:false,...(qrOutput?{qrOutput}:{}),...output};
}
export function parseArgs(argv){const command=argv[0],out={command},map={'--cli':'cli','--project':'project','--qr-output':'qrOutput','--version':'version','--description':'description'};for(let i=1;i<argv.length;i+=2){const key=map[argv[i]],value=argv[i+1];if(!key||Object.hasOwn(out,key)||!value||value.startsWith('--'))throw Error('参数无效或重复');out[key]=value;}return out;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await runDevtools(parseArgs(process.argv.slice(2))),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
