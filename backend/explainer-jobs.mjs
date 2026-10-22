import {randomUUID} from 'node:crypto';
import {HttpError} from './validation.mjs';
const active=['queued','planning','building','checking','repairing'];
const safeCodes=new Set(['explainer_timeout','explainer_provider_rejected','explainer_output_truncated','explainer_invalid_scene','explainer_generation_failed','explainer_unconfigured','assistant_running','assistant_daily_limit','explainer_running','explainer_daily_limit','account_disabled']);
export function createExplainerJobs(db,runner,store,options={}){
 const concurrency=options.concurrency??3,capacity=options.capacity??30;let closing=false,running=0;const queue=[],inflight=new Set();
 const transaction=fn=>{db.exec(db.backend==='mariadb'?'START TRANSACTION':'BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
 const find=id=>db.prepare('SELECT * FROM explainer_tasks WHERE id=?').get(id);
 const update=(id,state)=>db.prepare('UPDATE explainer_tasks SET state=?,updated_at=? WHERE id=?').run(state,new Date().toISOString(),id);
 const expose=row=>({id:row.id,state:row.state,createdAt:row.created_at,updatedAt:row.updated_at,...(row.state==='ready'?{scene:JSON.parse(row.result)}:{}),...(row.state==='failed'?{error:{code:row.error_code}}:{})});
 // Recover reservations in the same transaction as terminal state. Never replay a provider request.
 for(const row of db.prepare("SELECT * FROM explainer_tasks WHERE state NOT IN ('ready','failed')").all())transaction(()=>{if(row.reservation)store.settle(row.user_id,JSON.parse(row.reservation),true);db.prepare("UPDATE explainer_tasks SET state='failed',error_code='explainer_interrupted',reservation='',updated_at=? WHERE id=?").run(new Date().toISOString(),row.id);});
 async function execute(id){const row=find(id);try{
  const scene=await runner.run(row.user_id,{question:row.question,mode:row.mode,level:row.level},{taskId:id,
   reserve(reserve){return transaction(()=>{const reservation=reserve();db.prepare('UPDATE explainer_tasks SET reservation=?,updated_at=? WHERE id=?').run(JSON.stringify(reservation),new Date().toISOString(),id);return reservation;});},
   onReservation(reservation){db.prepare('UPDATE explainer_tasks SET reservation=?,updated_at=? WHERE id=?').run(JSON.stringify(reservation),new Date().toISOString(),id);},
   onPhase(phase){if(!active.includes(phase))throw Error('Invalid phase');update(id,phase);},
   commitSuccess(scene,reservation){transaction(()=>{store.settle(row.user_id,reservation,false);db.prepare("UPDATE explainer_tasks SET state='ready',result=?,reservation='',error_code='',updated_at=? WHERE id=?").run(JSON.stringify(scene),new Date().toISOString(),id);});}
  });
  // Test/custom runners may omit commitSuccess; production runner always uses it.
  if(find(id).state!=='ready')db.prepare("UPDATE explainer_tasks SET state='ready',result=?,reservation='',updated_at=? WHERE id=?").run(JSON.stringify(scene),new Date().toISOString(),id);
 }catch(error){transaction(()=>{const current=find(id);if(current.reservation)store.settle(row.user_id,JSON.parse(current.reservation),true);db.prepare("UPDATE explainer_tasks SET state='failed',error_code=?,reservation='',updated_at=? WHERE id=?").run(safeCodes.has(error?.code)?error.code:'explainer_generation_failed',new Date().toISOString(),id);});}}
 function pump(){while(queue.length&&running<concurrency){const id=queue.shift();running++;const promise=execute(id).catch(()=>{/* Leave durable state for restart recovery after a database failure. */}).finally(()=>{running--;inflight.delete(promise);pump();});inflight.add(promise);}}
 return {
  submit(user,input,requestKey){store.assertUser(user);if(closing)throw new HttpError(503,'explainer_jobs_stopping','服务正在重启');if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey))throw new HttpError(422,'invalid_explainer_request_key','请求标识无效');
   const previous=db.prepare('SELECT * FROM explainer_tasks WHERE user_id=? AND request_key=?').get(user,requestKey);if(previous&&previous.user_id===user)return expose(previous);
   if(typeof input?.question!=='string'||!input.question.trim()||input.question.length>1000)throw new HttpError(422,'invalid_explainer_question','请输入不超过1000字的问题');
   if(Number(db.prepare("SELECT COUNT(*) AS count FROM explainer_tasks WHERE state NOT IN ('ready','failed')").get().count)>=capacity)throw new HttpError(429,'explainer_jobs_busy','生成任务较多，请稍后再试');
   if(db.prepare("SELECT id FROM explainer_tasks WHERE user_id=? AND state NOT IN ('ready','failed')").get(user))throw new HttpError(409,'explainer_running','请等待当前讲解完成');
   const id=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO explainer_tasks(id,user_id,request_key,state,question,mode,level,result,error_code,reservation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user,requestKey,'queued',input.question.trim(),['参数实验','逐步演示','关系图'].includes(input.mode)?input.mode:'自动',input.level==='standard'?'standard':'simple','','','',now,now);queue.push(id);queueMicrotask(pump);return expose(find(id));
  },
  list(user,{q='',state='all',offset='0'}={}){
   store.assertUser(user);
   if(typeof q!=='string'||q.length>80||!['all','ready','running','failed'].includes(state)||!/^\d+$/.test(String(offset))||Number(offset)>10000)throw new HttpError(422,'explainer_projects_query','搜索或分页参数无效');
   const escaped=q.trim().replace(/[!%_]/g,c=>'!'+c),params=[user,'%'+escaped+'%','%'+escaped+'%'];
   const filter=state==='running'?" AND state NOT IN ('ready','failed')":state==='all'?'':' AND state=?';if(['ready','failed'].includes(state))params.push(state);
   const rows=db.prepare("SELECT id,state,question,mode,level,result,created_at,updated_at FROM explainer_tasks WHERE user_id=? AND (question LIKE ? ESCAPE '!' OR result LIKE ? ESCAPE '!')"+filter+' ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?').all(...params,Number(offset));
   return {items:rows.slice(0,20).map(row=>{let title=row.question;try{title=JSON.parse(row.result)?.title||title;}catch{}return {id:row.id,title,question:row.question,state:row.state,createdAt:row.created_at,updatedAt:row.updated_at};}),nextOffset:rows.length>20?Number(offset)+20:null};
  },
  get(user,id){store.assertUser(user);const row=find(id);if(!row||row.user_id!==user)throw new HttpError(404,'explainer_task_not_found','讲解任务不存在');return {...expose(row),question:row.question,mode:row.mode,level:row.level};},
  async shutdown(){closing=true;while(queue.length||inflight.size){pump();await Promise.allSettled([...inflight]);}}
 };
}
