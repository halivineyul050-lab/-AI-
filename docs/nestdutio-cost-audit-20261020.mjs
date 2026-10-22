import { openMariaDatabase } from '/opt/nikai-ai/backend/mariadb-compat.mjs';
const db=openMariaDatabase();
try {
 const read=table=>{const row=db.prepare(`SELECT document FROM ${table} WHERE id=1`).get();return row?JSON.parse(row.document):{};};
 const config=read('nestdutio_config'),assistant=read('assistant_provider');
 const creditRow=db.prepare('SELECT config_json FROM credit_config WHERE id=1').get();
 const credits=creditRow?JSON.parse(creditRow.config_json):{};
 console.log(JSON.stringify({configuration:{mode:config.mode,model:config.mode==='inherit'?assistant.model:config.model,maxTokens:config.maxTokens,billing:config.billing,fixedCredits:credits.modelPrices?.nestdutio??credits.defaultImageCredits},packages:credits.packages,firstPurchase:credits.firstPurchase},null,2));
 const tasks=db.prepare(`SELECT t.id,t.state,t.created_at,t.updated_at,u.snapshot_json,u.prompt_tokens,u.completion_tokens,u.request_count,u.budget_credits,u.charged_credits
 FROM nestdutio_tasks t LEFT JOIN nestdutio_task_usage u ON u.task_id=t.id ORDER BY t.created_at DESC LIMIT 20`).all();
 const states={};for(const t of tasks)states[t.state]=(states[t.state]??0)+1;
 console.log(JSON.stringify({recentTasks:tasks.length,states,recordedUsage:tasks.filter(t=>t.prompt_tokens!==null).length},null,2));
 console.log(JSON.stringify(db.prepare(`SELECT state,error_code,COUNT(*) AS n FROM nestdutio_tasks GROUP BY state,error_code ORDER BY n DESC`).all(),null,2));
 const samples=db.prepare(`SELECT v.artifact FROM nestdutio_tasks t JOIN nestdutio_versions v ON v.id=t.version_id WHERE t.state='ready' ORDER BY t.created_at DESC LIMIT 4`).all();
 console.log(JSON.stringify({readyArtifactMetrics:samples.map(r=>{const a=JSON.parse(r.artifact);return {files:a.files.length,bytes:a.files.reduce((n,f)=>n+Buffer.byteLength(f.content),0),acceptance:a.acceptance.length,interactiveChecks:a.acceptance.filter(c=>c.kind!=='visible').length,capabilities:a.capabilities};})},null,2));
} finally {db.close();}
