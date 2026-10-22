import {domainToASCII} from 'node:url';import {isIP} from 'node:net';import {Resolver} from 'node:dns/promises';
export function normalizeDomain(input){
 if(typeof input!=='string'||input!==input.trim()||input.length>253||/[\s/:*\\;@%?#]/.test(input))throw Error('Invalid domain');
 const domain=domainToASCII(input).toLowerCase(),labels=domain.split('.');
 if(!domain||isIP(domain)||labels.length<2||labels.some(label=>!label||label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))||!(/^[a-z]{2,63}$/.test(labels.at(-1))||labels.at(-1).startsWith('xn--'))||['localhost','internal','invalid','test','example','local'].includes(labels.at(-1)))throw Error('Invalid domain');
 if(['ontimo.cn','www.ontimo.cn','ai.ontimo.cn','admin.ontimo.cn','api.ontimo.cn','auth.ontimo.cn','login.ontimo.cn','mail.ontimo.cn','apps.ontimo.cn','preview.ontimo.cn'].includes(domain)||domain.endsWith('.apps.ontimo.cn')||domain.endsWith('.preview.ontimo.cn'))throw Error('Reserved domain');return domain;
}
export async function verifyDomainDns(domain,txtValue,addresses,{dns=new Resolver({timeout:1500,tries:1})}={}){
 domain=normalizeDomain(domain);if(!Array.isArray(addresses)||!addresses.length||addresses.some(ip=>!isIP(ip)))return false;
 let timer;const query=async(method,name)=>{try{return await dns[method](name);}catch(error){if(['ENODATA','ENOTFOUND','ENONAME'].includes(error.code))return [];throw error;}};
 try{return await Promise.race([(async()=>{const [txt,v4,v6]=await Promise.all([query('resolveTxt','_nestdutio.'+domain),query('resolve4',domain),query('resolve6',domain)]);const ips=[...v4,...v6];return txt.some(row=>Array.isArray(row)&&row.join('')===txtValue)&&ips.length>0&&ips.every(ip=>addresses.includes(ip));})(),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),5000);})]);}catch{return false;}finally{clearTimeout(timer);}
}
