import {createHmac,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {HttpError,normalizeEmail} from './validation.mjs';

export function validateEmailCode(code) {
 if(typeof code!=='string'||!/^\d{6}$/.test(code)) throw new HttpError(422,'invalid_email_code','请输入6位邮箱验证码');
 return code;
}

export function createAuthEmailService(db,{env=process.env,fetchImpl=fetch,now=Date.now}={}) {
 const key=String(env.RESEND_API_KEY||'').trim();const from=String(env.AUTH_EMAIL_FROM||'').trim();
 const digest=(email,purpose,id,code)=>createHmac('sha256',key).update(JSON.stringify([email,purpose,id,code])).digest('hex');
 const invalid=()=>new HttpError(422,'invalid_email_code','验证码错误、已过期或已使用，请重新获取');
 function configured(){if(!key||!from)throw new HttpError(503,'email_not_configured','邮箱验证服务尚未配置，请稍后重试');}
 async function issue(rawEmail,purpose){
  configured();const email=normalizeEmail(rawEmail);const time=now();
  if(!['register','reset','verify'].includes(purpose))throw new HttpError(422,'invalid_code_purpose','验证码用途无效');
  const latest=db.prepare('SELECT created_at FROM auth_email_codes WHERE normalized_email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1').get(email,purpose);
  if(latest&&time-Number(latest.created_at)<60_000)throw new HttpError(429,'email_code_cooldown','请等待60秒后再获取验证码');
  const recent=Number(db.prepare('SELECT COUNT(*) AS count FROM auth_email_codes WHERE normalized_email = ? AND created_at > ?').get(email,time-3600_000).count);
  if(recent>=5)throw new HttpError(429,'email_code_rate_limit','验证码发送过于频繁，请一小时后重试');
  db.prepare('DELETE FROM auth_email_codes WHERE created_at < ?').run(time-7*86400_000);
  const id=randomUUID();const code=String(randomInt(0,1000000)).padStart(6,'0');
  // Reserve before awaiting delivery, so concurrent requests observe the cooldown.
  db.prepare('INSERT INTO auth_email_codes (id,normalized_email,purpose,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)').run(id,email,purpose,digest(email,purpose,id,code),time,time+600_000);
  const eligible=purpose!=='reset'||Boolean(db.prepare("SELECT 1 FROM users JOIN user_email_verifications ON users.id = user_email_verifications.user_id WHERE normalized_email = ? AND status = 'active'").get(email));
  if(!eligible)return {message:'如果该邮箱符合条件，将收到验证码；未验证邮箱请先登录账号中心完成验证。',retryAfter:60};
  try{
   const result=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15_000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],subject:`泥壳AI ${purpose==='reset'?'密码重置':'邮箱验证'}验证码`,text:`你的验证码是 ${code}，10分钟内有效。请勿向他人透露验证码。如果不是你本人操作，请忽略这封邮件。`})});
   if(!result.ok)throw new Error('delivery_rejected');
   const receipt=await result.json();if(!receipt?.id)throw new Error('delivery_unconfirmed');
   // Invalidate previous successfully sent codes only when the new delivery succeeds.
   db.prepare('UPDATE auth_email_codes SET consumed = 1 WHERE normalized_email = ? AND purpose = ? AND id <> ?').run(email,purpose,id);
   db.prepare('UPDATE auth_email_codes SET delivered = 1 WHERE id = ?').run(id);
  }catch{throw new HttpError(503,'email_send_failed','验证码发送失败，请稍后重新获取');}
  return {message:purpose==='reset'?'如果该邮箱符合条件，将收到验证码；未验证邮箱请先登录账号中心完成验证。':'验证码已发送，请检查收件箱和垃圾邮件。',retryAfter:60};
 }
 function authorize(rawEmail,purpose,rawCode){
  configured();const email=normalizeEmail(rawEmail);const code=validateEmailCode(rawCode);const time=now();
  const row=db.prepare('SELECT * FROM auth_email_codes WHERE normalized_email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1').get(email,purpose);
  if(!row||!row.delivered||row.consumed||Number(row.expires_at)<=time||Number(row.attempts)>=5)throw invalid();
  const actual=digest(email,purpose,row.id,code);
  if(!timingSafeEqual(Buffer.from(actual),Buffer.from(row.code_hash))){db.prepare('UPDATE auth_email_codes SET attempts = attempts + 1 WHERE id = ? AND consumed = 0').run(row.id);throw invalid();}
  // Execute this closure inside the same transaction as the account mutation.
  return ()=>{
   const result=db.prepare('UPDATE auth_email_codes SET consumed = 1 WHERE id = ? AND code_hash = ? AND consumed = 0 AND delivered = 1 AND attempts < 5 AND expires_at > ?').run(row.id,actual,now());
   if(Number(result.changes)!==1)throw invalid();
  };
 }
 return {issue,authorize};
}
