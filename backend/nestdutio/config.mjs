import {chatEndpoint} from '../model-discovery.mjs';
import {validateBilling,defaultBilling} from './metering.mjs';
import {validateProcurement} from './request-accounting.mjs';
import {HttpError} from '../validation.mjs';import {assertSafeUpstreamUrl} from '../safe-upstream.mjs';
export function createConfig(db,box,assistant){
 const read=()=>{const r=db.prepare('SELECT document FROM nestdutio_config WHERE id=1').get();return r?JSON.parse(r.document):{mode:'inherit',enabled:false,endpoint:'',model:'',encryptedKey:'',maxTokens:16000,requestTimeoutSeconds:180};};
 const fail=()=>{throw new HttpError(422,'nestdutio_config_invalid','请检查模型、资源上限与接口地址');};
 return {
  config(){const saved=read(),effective=saved.mode==='inherit'?assistant.config():saved;return {procurement:validateProcurement(saved.procurement??{}),billing:validateBilling(saved.billing??{}),mode:saved.mode,enabled:saved.enabled,endpoint:effective.endpoint||'',model:effective.model||'',hasKey:saved.mode==='inherit'?effective.hasKey:!!saved.encryptedKey,maxTokens:saved.maxTokens,requestTimeoutSeconds:saved.requestTimeoutSeconds,ready:!!(saved.enabled&&(saved.mode==='inherit'?effective.ready:box&&saved.endpoint&&saved.model&&saved.encryptedKey))};},
  key(){const s=read();return s.mode==='inherit'?assistant.key():box?.decrypt(s.encryptedKey)||'';},
  async configure(input,options={}){if(!input||!['inherit','independent'].includes(input.mode)||typeof input.enabled!=='boolean')fail();const previous=read(),maxTokens=input.maxTokens??previous.maxTokens,requestTimeoutSeconds=input.requestTimeoutSeconds??previous.requestTimeoutSeconds;if(!Number.isSafeInteger(maxTokens)||maxTokens<4000||maxTokens>32000||!Number.isSafeInteger(requestTimeoutSeconds)||requestTimeoutSeconds<60||requestTimeoutSeconds>180)fail();const billing=validateBilling(input.billing===undefined?{}:input.billing,previous.billing??defaultBilling);if(input.procurement!==undefined)validateProcurement(input.procurement);const procurement=validateProcurement({...previous.procurement,...input.procurement});let next={...previous,billing,procurement,mode:input.mode,enabled:input.enabled,maxTokens,requestTimeoutSeconds};if(input.mode==='independent'){
   if(typeof input.endpoint!=='string'||typeof input.model!=='string'||!input.model.trim()||input.model.length>120)fail();let url;try{url=new URL(chatEndpoint(input.endpoint));}catch{fail();}try{await assertSafeUpstreamUrl(url.toString(),{...options,signal:AbortSignal.timeout(10000)});}catch{fail();}
   if(input.clearKey!==undefined&&typeof input.clearKey!=='boolean')fail();let encryptedKey=input.clearKey?'':previous.encryptedKey;if(input.apiKey){if(typeof input.apiKey!=='string'||input.apiKey.length>4096)fail();if(!box)throw new HttpError(503,'nestdutio_encryption_unavailable','服务器尚未配置密钥加密');encryptedKey=box.encrypt(input.apiKey.trim());}if(input.enabled&&!encryptedKey)fail();next={...next,endpoint:url.toString(),model:input.model.trim(),encryptedKey};
  }db.prepare('INSERT OR IGNORE INTO nestdutio_config(id,document) VALUES(1,?)').run(JSON.stringify(next));db.prepare('UPDATE nestdutio_config SET document=? WHERE id=1').run(JSON.stringify(next));return this.config();}
 };
}
