import {randomUUID} from 'node:crypto';
import {HttpError} from './validation.mjs';
import {chatEndpoint} from './model-discovery.mjs';

const fail=(status,code,message)=>new HttpError(status,code,message);
const invalid=()=>fail(422,'invalid_model_profile','请检查配置名称、类型、HTTPS 地址、模型和 API Key');
function text(value,max,allowEmpty=false){
 if(typeof value!=='string'||value.length>max||(!allowEmpty&&!value.trim())||/[\x00-\x1f\x7f]/.test(value))throw invalid();
 return value.trim();
}
function kindFor(value){if(!['chat','image'].includes(value))throw invalid();return value;}
function endpointFor(value,kind){
 const address=text(value,2048);let url;
 try{url=new URL(address);}catch{throw invalid();}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw invalid();
 return kind==='chat'?chatEndpoint(address):url.href;
}
function publicProfile(row){
 return {id:row.id,name:row.name,kind:row.kind,endpoint:row.endpoint,model:row.model,hasKey:true,createdAt:row.created_at,updatedAt:row.updated_at};
}

export function createModelProfileStore(db,box){
 const requireBox=()=>{if(!box||typeof box.encrypt!=='function'||typeof box.decrypt!=='function')throw fail(503,'model_profile_key_unconfigured','服务器加密配置不可用');};
 const find=id=>{
  const row=typeof id==='string'?db.prepare('SELECT * FROM model_profiles WHERE id = ?').get(id):null;
  if(!row)throw fail(404,'model_profile_not_found','模型配置不存在');return row;
 };
 return {
  list(kind){
   const rows=kind===undefined?db.prepare('SELECT * FROM model_profiles ORDER BY created_at, id').all():db.prepare('SELECT * FROM model_profiles WHERE kind = ? ORDER BY created_at, id').all(kindFor(kind));
   return rows.map(publicProfile);
  },
  get(id){return publicProfile(find(id));},
  key(id){const row=find(id);requireBox();try{return box.decrypt(row.encrypted_key);}catch{throw fail(503,'model_profile_key_unavailable','模型配置密钥不可用，请重新创建配置');}},
  create(input){
   requireBox();if(!input||typeof input!=='object'||Array.isArray(input))throw invalid();
   const name=text(input.name,80),kind=kindFor(input.kind),endpoint=endpointFor(input.endpoint,kind),model=text(input.model,120,kind==='image'),apiKey=text(input.apiKey,4096);
   const id=randomUUID(),now=new Date().toISOString(),encryptedKey=box.encrypt(apiKey);
   if(db.prepare('SELECT id FROM model_profiles WHERE name = ?').get(name))throw fail(409,'model_profile_name_exists','配置名称已存在，请使用其它名称');
   const inserted=db.prepare(`INSERT INTO model_profiles (id,name,kind,endpoint,model,encrypted_key,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM model_profiles) < 100`);
   try{
    if(!Number(inserted.run(id,name,kind,endpoint,model,encryptedKey,now,now).changes))throw fail(409,'model_profile_limit','最多保存 100 套模型配置');
   }catch(error){
    if(error.code==='ER_DUP_ENTRY'||String(error.code).startsWith('SQLITE_CONSTRAINT'))throw fail(409,'model_profile_name_exists','配置名称已存在，请使用其它名称');
    throw error;
   }
   return this.get(id);
  },
  remove(id){find(id);db.prepare('DELETE FROM model_profiles WHERE id = ?').run(id);return {deleted:true};}
 };
}
