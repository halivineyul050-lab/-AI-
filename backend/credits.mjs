import {createHash, randomBytes, randomUUID} from 'node:crypto';
const MAX=1_000_000_000;
const defaults={defaultImageCredits:20,verificationGift:60,modelPrices:{},packages:[{id:'starter',name:'入门包',priceCents:600,credits:600},{id:'standard',name:'标准包',priceCents:1800,credits:2000},{id:'premium',name:'进阶包',priceCents:5000,credits:6000},{id:'large',name:'畅享包',priceCents:10000,credits:12500}],payments:{wechat:false,alipay:false},firstPurchase:{enabled:false,packageId:'starter',priceCents:1,originalPriceCents:600}};
function fail(message,code='credit_invalid',statusCode=422){throw Object.assign(new Error(message),{code,statusCode,status:statusCode});}
function integer(v,min=0,max=MAX){if(!Number.isSafeInteger(v)||v<min||v>max)fail('积分参数必须为有效整数');return v;}
function string(v,max=191){if(typeof v!=='string'||!v.trim()||v.length>max)fail('参数无效');return v;}
const hash=v=>createHash('sha256').update(v).digest('hex');
export function createCreditStore(db){
 const get=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
 const exact=db.backend==='mariadb'?'BINARY user_id = BINARY ?':'user_id = ?';
 const now=()=>new Date().toISOString();
 function tx(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 function config(){const row=get('SELECT config_json FROM credit_config WHERE id=1');const stored=row?JSON.parse(row.config_json):{};const c={...structuredClone(defaults),...stored};c.firstPurchase={...defaults.firstPurchase,...stored.firstPurchase,enabled:Boolean(stored.firstPurchase?.enabled)};if(stored.firstPurchase?.originalPriceCents)c.packages=c.packages.map(p=>p.id===c.firstPurchase.packageId?{...p,priceCents:c.firstPurchase.originalPriceCents}:p);return c;}

 function configure(input){if(!input||typeof input!=='object'||Array.isArray(input))fail('配置无效');const c={...config(),...input};integer(c.defaultImageCredits,1);integer(c.verificationGift);if(!c.modelPrices||typeof c.modelPrices!=='object'||Array.isArray(c.modelPrices))fail('模型价格无效');for(const [id,v]of Object.entries(c.modelPrices)){string(id);integer(v,1);}if(!Array.isArray(c.packages)||!c.packages.length||c.packages.length>30)fail('套餐无效');const ids=new Set();for(const p of c.packages){if(!p||typeof p!=='object'||Array.isArray(p))fail('套餐无效');string(p.id);string(p.name,100);integer(p.priceCents,1);integer(p.credits,1);if(ids.has(p.id))fail('套餐编号重复');ids.add(p.id);}const promo={...config().firstPurchase,...input.firstPurchase};if(typeof promo.enabled!=='boolean')fail('首购开关无效');string(promo.packageId);integer(promo.priceCents,1);const target=c.packages.find(p=>p.id===promo.packageId);if(promo.enabled&&(!target||promo.priceCents>=target.priceCents))fail('首购套餐不存在或优惠价不低于原价');promo.originalPriceCents=target?.priceCents??promo.originalPriceCents;if(c.payments?.wechat!==false||c.payments?.alipay!==false)fail('支付渠道尚未启用');const clean={defaultImageCredits:c.defaultImageCredits,verificationGift:c.verificationGift,modelPrices:{...c.modelPrices},packages:c.packages.map(({id,name,priceCents,credits})=>({id,name,priceCents,credits})),payments:{wechat:false,alipay:false},firstPurchase:{enabled:promo.enabled,packageId:promo.packageId,priceCents:promo.priceCents,originalPriceCents:promo.originalPriceCents}};run('INSERT INTO credit_config(id,config_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json',JSON.stringify(clean));return clean;}
 function entry(user,kind,amount,ref){run('INSERT INTO credit_ledger(id,user_id,kind,amount,reference_id,created_at) VALUES(?,?,?,?,?,?)',randomUUID(),user,kind,amount,ref,now());}
 function ensure(user){string(user);const userExact=db.backend==='mariadb'?'BINARY id = BINARY ?':'id = ?';if(!get(`SELECT id FROM users WHERE ${userExact}`,user))fail('用户不存在','credit_user_missing',404);run('INSERT OR IGNORE INTO credit_wallets(user_id) VALUES(?)',user);run('UPDATE credit_wallets SET balance=balance WHERE user_id=?',user);if(get(`SELECT user_id FROM user_email_verifications WHERE ${exact}`,user)){const claimed=run('INSERT OR IGNORE INTO credit_gift_claims(user_id,created_at) VALUES(?,?)',user,now());if(Number(claimed.changes)){const gift=config().verificationGift;add(user,gift);entry(user,'verification_gift',gift,null);}}}
 function rawWallet(user){const r=get('SELECT balance,frozen FROM credit_wallets WHERE user_id=?'+(db.backend==='mariadb'?' FOR UPDATE':''),user);return {balance:Number(r.balance),frozen:Number(r.frozen)};}
 function add(user,amount){const result=run('UPDATE credit_wallets SET balance=balance+? WHERE user_id=? AND balance<=?',amount,user,MAX-amount);if(!Number(result.changes))fail('积分余额超出上限');}
 function wallet(user){return tx(()=>{ensure(user);return rawWallet(user);});}
 function createCodes({credits,count=1,label='',expiresAt=null}={},adminId=null){integer(credits,1);integer(count,1,100);if(typeof label!=='string'||label.length>200)fail('备注无效');if(expiresAt!==null){if(typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt)))fail('到期时间无效');if(Date.parse(expiresAt)<=Date.now())fail('到期时间必须在未来');expiresAt=new Date(expiresAt).toISOString();}return tx(()=>Array.from({length:count},()=>{const id=randomUUID(),code=randomBytes(24).toString('base64url');run('INSERT INTO credit_codes(id,code_hash,credits,label,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)',id,hash(code),credits,label,expiresAt,adminId,now());return {id,code,credits,expiresAt,label};}));}
 function redeem(user,code){string(code,200);return tx(()=>{ensure(user);const c=get('SELECT * FROM credit_codes WHERE code_hash=?',hash(code));if(c?.redeemed_by!=null)fail('兑换码已使用','credit_code_invalid',409);if(!c||c.disabled||(c.expires_at&&c.expires_at<=now()))fail('兑换码无效、已使用或已过期','credit_code_invalid');const result=run('UPDATE credit_codes SET redeemed_by=?,redeemed_at=? WHERE id=? AND redeemed_by IS NULL AND disabled=0',user,now(),c.id);if(!Number(result.changes))fail('兑换码已使用','credit_code_invalid',409);add(user,Number(c.credits));entry(user,'redeem',Number(c.credits),c.id);return rawWallet(user);});}
 // Internal synchronous hooks let related task writes share the financial transaction.
 function transactionHook(hook,value){
  if(hook===undefined)return;
  if(typeof hook!=='function')throw new TypeError('Transaction hook must be a function');
  const result=hook(value);
  if(result&&typeof result.then==='function')throw new TypeError('Transaction hook must be synchronous');
 }
 function reserve(user,{requestId,count,modelRecordId=null}={},onReserved){
  string(requestId);integer(count,1,100);if(modelRecordId!==null)string(modelRecordId);
  return tx(()=>{
   ensure(user);
   if(get('SELECT id FROM credit_reservations WHERE request_id=?'+(db.backend==='mariadb'?' FOR UPDATE':''),requestId))fail('请求已预留积分','credit_duplicate_request',409);
   const c=config(),unitCredits=(Object.hasOwn(c.modelPrices,modelRecordId)?c.modelPrices[modelRecordId]:c.defaultImageCredits),reservedCredits=integer(unitCredits*count,1);
   const w=rawWallet(user);
   const result=run('UPDATE credit_wallets SET frozen=frozen+? WHERE user_id=? AND balance-frozen>=?',reservedCredits,user,reservedCredits);
   if(!Number(result.changes))fail(`积分不足：可用 ${w.balance-w.frozen}，需要 ${reservedCredits}`,'credit_insufficient',402);
   const id=randomUUID();
   run('INSERT INTO credit_reservations(id,user_id,request_id,model_record_id,count,unit_credits,reserved_credits,created_at) VALUES(?,?,?,?,?,?,?,?)',id,user,requestId,modelRecordId,count,unitCredits,reservedCredits,now());
   const reservation={id,unitCredits,reservedCredits,count};
   transactionHook(onReserved,reservation);
   return reservation;
  });
 }
 function settle(id,successCount,onSettled){
  string(id);integer(successCount);
  return tx(()=>{
   const r=get('SELECT * FROM credit_reservations WHERE id=?'+(db.backend==='mariadb'?' FOR UPDATE':''),id);
   if(!r)fail('积分预留不存在','credit_reservation_missing',404);
   if(r.billing_mode==='tokens')fail('Token 预算必须按实际用量结算','credit_billing_mode_invalid',409);
   if(successCount>Number(r.count))fail('成功数量超过预留数量');
   if(r.settled_at!==null&&Number(r.success_count)!==successCount)fail('预留已按其他成功数量结算','credit_settlement_conflict',409);
   run('UPDATE credit_wallets SET balance=balance WHERE user_id=?',r.user_id);
   const changed=run('UPDATE credit_reservations SET success_count=?,settled_at=? WHERE id=? AND settled_at IS NULL',successCount,now(),id);
   if(Number(changed.changes)){
    const charge=Number(r.unit_credits)*successCount;
    run('UPDATE credit_wallets SET frozen=frozen-?,balance=balance-? WHERE user_id=?',Number(r.reserved_credits),charge,r.user_id);
    entry(r.user_id,r.model_record_id==='nestdutio'?'nestdutio_generation':'image_generation',-charge,id);
   }
   const wallet=rawWallet(r.user_id);
   transactionHook(onSettled,wallet);
   return wallet;
  });
 }
 function reserveBudget(user,{requestId,budgetCredits,modelRecordId='nestdutio'}={},onReserved){
  string(requestId);integer(budgetCredits,1,10000);if(modelRecordId!=='nestdutio')fail('预算预留仅适用于 NeStudio');
  return tx(()=>{
   ensure(user);
   if(get('SELECT id FROM credit_reservations WHERE request_id=?'+(db.backend==='mariadb'?' FOR UPDATE':''),requestId))fail('请求已预留积分','credit_duplicate_request',409);
   const w=rawWallet(user);
   const changed=run('UPDATE credit_wallets SET frozen=frozen+? WHERE user_id=? AND balance-frozen>=?',budgetCredits,user,budgetCredits);
   if(!Number(changed.changes))fail(`积分不足：可用 ${w.balance-w.frozen}，需要 ${budgetCredits}`,'credit_insufficient',402);
   const id=randomUUID();
   run("INSERT INTO credit_reservations(id,user_id,request_id,model_record_id,count,unit_credits,reserved_credits,created_at,billing_mode) VALUES(?,?,?,?,?,?,?,?,?)",id,user,requestId,modelRecordId,1,0,budgetCredits,now(),'tokens');
   const reservation={id,unitCredits:0,reservedCredits:budgetCredits,count:1,billingMode:'tokens'};
   transactionHook(onReserved,reservation);return reservation;
  });
 }
 function settleBudget(id,actualCredits,onSettled){
  string(id);integer(actualCredits,0,10000);
  return tx(()=>{
   const r=get('SELECT * FROM credit_reservations WHERE id=?'+(db.backend==='mariadb'?' FOR UPDATE':''),id);
   if(!r)fail('积分预留不存在','credit_reservation_missing',404);
   if(r.billing_mode!=='tokens')fail('固定计费预留不能按 Token 结算','credit_billing_mode_invalid',409);
   if(actualCredits>Number(r.reserved_credits))fail('实际消耗超过预留预算');
   if(r.settled_at!==null&&Number(r.charged_credits)!==actualCredits)fail('预留已按其他金额结算','credit_settlement_conflict',409);
   run('UPDATE credit_wallets SET balance=balance WHERE user_id=?',r.user_id);
   const changed=run('UPDATE credit_reservations SET charged_credits=?,settled_at=? WHERE id=? AND settled_at IS NULL',actualCredits,now(),id);
   if(Number(changed.changes)){
    run('UPDATE credit_wallets SET frozen=frozen-?,balance=balance-? WHERE user_id=?',Number(r.reserved_credits),actualCredits,r.user_id);
    entry(r.user_id,'nestdutio_generation',-actualCredits,id);
    transactionHook(onSettled,rawWallet(r.user_id));
   }
   return rawWallet(r.user_id);
  });
 }
 function grant({userId,credits,reason,requestId}={},actor){
  string(userId);integer(credits,1);string(reason,200);string(requestId,100);string(actor);
  return tx(()=>{ensure(userId);const prior=get('SELECT * FROM credit_grants WHERE request_id=?',requestId);if(prior){if(prior.user_id!==userId||Number(prior.credits)!==credits||prior.reason!==reason.trim()||prior.actor!==actor)fail('同一派发请求的内容已改变','credit_grant_conflict',409);return {...rawWallet(userId),grantId:prior.id};}
   const id=randomUUID();run('INSERT INTO credit_grants(id,user_id,credits,reason,actor,request_id,created_at) VALUES(?,?,?,?,?,?,?)',id,userId,credits,reason.trim(),actor,requestId,now());add(userId,credits);entry(userId,'admin_grant',credits,id);return {...rawWallet(userId),grantId:id};});
 }
 function findGrantAccount(query){string(query);const user=get('SELECT id,email,display_name FROM users WHERE id=? OR normalized_email=?',query,query.trim().toLowerCase());if(!user)fail('账户不存在，请填写完整邮箱或账户 ID','credit_user_missing',404);return {id:user.id,email:user.email,displayName:user.display_name,...wallet(user.id)};}
 function listGrants(){return all('SELECT g.id,g.user_id,g.credits,g.reason,g.actor,g.created_at,u.email FROM credit_grants g JOIN users u ON u.id=g.user_id ORDER BY g.created_at DESC,g.id DESC LIMIT 100');}
 return {grant,findGrantAccount,listGrants,config,configure,wallet,createCodes,redeem,reserve,settle,reserveBudget,settleBudget,ledger:(user,limit=50)=>{string(user);integer(limit,1,100);return all('SELECT id,kind,amount,reference_id,created_at FROM credit_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?',user,limit);},listCodes:()=>all('SELECT id,credits,label,expires_at,disabled,redeemed_by,redeemed_at,created_by,created_at FROM credit_codes ORDER BY created_at DESC,id DESC LIMIT 100'),disableCode:(id)=>{string(id);run('UPDATE credit_codes SET disabled=1 WHERE id=?',id);},pendingReservations:()=>all('SELECT * FROM credit_reservations WHERE settled_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100')};
}
