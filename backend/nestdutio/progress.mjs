import {nativePath} from './native-artifact.mjs';
import {artifactPath} from './artifact.mjs';
const phases=new Set(['queued','planning','generating','checking','repairing','ready','failed']);
const codes=new Set(['manifest_validated','file_started','file_saved','file_retry','file_continue','checkpoint_reused','phase','model_waiting','model_responded','model_received','plan_validated','artifact_validated','check_issue','check_started','check_passed','checks_passed','repair_started','json_invalid','artifact_invalid','provider_http_error','output_limit','completed','failed']);
const issues=new Set(['native_structure_failed','network_blocked','runtime_error','missing_resource','popup_blocked','entry_failed','storage_leak','interaction_failed','form_not_received','form_result_mismatch','horizontal_overflow','storage_not_used','storage_not_persistent','navigation_blocked','browser_check_failed','business_check_failed']);
export function safeProgress(input){
 if(!input||!phases.has(input.phase)||!codes.has(input.code))return null;
 const event={phase:input.phase,code:input.code};
 if(['target','result'].includes(input.step))event.step=input.step;
 if(issues.has(input.issue))event.issue=input.issue;
 for(const [key,min,max]of [['attempt',1,10],['index',1,100],['total',0,100],['characters',0,3000000],['status',400,599]])if(Number.isSafeInteger(input[key])&&input[key]>=min&&input[key]<=max)event[key]=input[key];
 for(const key of ['file','path'])try{event[key]=/\.(?:wxml|wxss)$|^project\.config\.json$/.test(input[key])?nativePath(input[key]):artifactPath(input[key]);}catch{}
 return event;
}
export function readProgress(value){
 try{const events=JSON.parse(value||'[]');if(!Array.isArray(events))return [];return events.slice(-512).flatMap((entry,index)=>{const event=safeProgress(entry);return event&&typeof entry.at==='string'&&!Number.isNaN(Date.parse(entry.at))?[{...event,id:index+1,at:entry.at}]:[];});}catch{return [];}
}
export function appendProgress(db,id,input){
 const event=safeProgress(input);if(!event)return;
 const row=db.prepare('SELECT progress_json FROM nestdutio_tasks WHERE id=?').get(id);if(!row)return;
 const previous=readProgress(row.progress_json),at=new Date().toISOString();
 previous.push({...event,at});
 db.prepare('UPDATE nestdutio_tasks SET progress_json=? WHERE id=?').run(JSON.stringify(previous.slice(-512)),id);
}
