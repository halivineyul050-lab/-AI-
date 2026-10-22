const statusNames={ready:'已完成',failed:'生成失败',queued:'等待生成',planning:'正在构思',building:'正在搭建',checking:'正在检查',repairing:'正在修正'};
export function mountProjectLibrary({onOpen,canOpen=()=>true}){
 const $=id=>document.getElementById(id),dialog=$('projects-dialog');let sequence=0,opening=0,next=null,loading=false,searchTimer;
 async function request(url){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)}),body=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(response.status===401?'请先登录，查看账号下的历史项目。':body.title||'历史项目加载失败，请重试。'),{status:response.status});return body.data;}
 function message(text){$('projects-status').textContent=text;}
 function failure(error,retry){message(error.message||'网络连接失败，请重试。');if(error.status===401){const link=document.createElement('a');link.href='/auth?next='+encodeURIComponent(location.pathname+location.search);link.textContent='登录后查看 →';$('projects-status').append(document.createElement('br'),link);}else{const button=document.createElement('button');button.type='button';button.textContent='重试';button.onclick=retry;$('projects-status').append(' ',button);}}
 async function load(append=false){
  const ticket=++sequence,offset=append?next:0;if(append&&offset===null)return;loading=true;$('projects-more').disabled=true;message('正在加载历史项目…');
  if(!append)$('projects-list').replaceChildren();
  try{
   const data=await request('/api/v1/explain/projects?'+new URLSearchParams({q:$('projects-search').value.trim(),state:$('projects-filter').value,offset:String(offset)}));if(ticket!==sequence||!dialog.open)return;
   const known=new Set([...$('projects-list').children].map(c=>c.dataset.project));
   for(const item of data.items){if(known.has(item.id))continue;const card=document.createElement('article');card.className='explain-project-card';card.dataset.project=item.id;
    const heading=document.createElement('strong');heading.textContent=item.title;
    const badge=document.createElement('span');badge.className='project-state '+(item.state==='ready'?'ready':item.state==='failed'?'failed':'running');badge.textContent=statusNames[item.state]||'正在生成';
    const question=document.createElement('p');question.textContent=item.question;
    const time=document.createElement('time');time.dateTime=item.createdAt;time.textContent='创建于 '+new Date(item.createdAt).toLocaleString('zh-CN');
    const button=document.createElement('button');button.type='button';button.className='project-open';button.textContent=item.state==='ready'?'打开讲解 →':item.state==='failed'?'查看失败并编辑':'查看生成进度';
    button.onclick=async()=>{if(!canOpen()){message('当前讲解生成完成后，可以打开其他项目。');return;}button.disabled=true;const openTicket=++opening;try{const task=await request('/api/v1/explain/tasks/'+encodeURIComponent(item.id));if(openTicket!==opening||!card.isConnected||!dialog.open)return;dialog.close();onOpen(task);}catch(error){if(openTicket===opening&&card.isConnected&&dialog.open)failure(error,()=>button.click());}finally{button.disabled=false;}};
    card.append(heading,badge,question,time,button);$('projects-list').append(card);
   }
   next=data.nextOffset;$('projects-more').hidden=next===null;message(data.items.length?'已保存到当前账号，点击项目可继续查看。':'没有匹配的项目。成功生成的讲解会自动保存在这里。');
  }catch(error){if(ticket===sequence&&dialog.open)failure(error,()=>load(append));}
  finally{if(ticket===sequence){loading=false;$('projects-more').disabled=false;}}
 }
 document.querySelectorAll('[data-projects]').forEach(button=>button.onclick=()=>{clearTimeout(searchTimer);dialog.showModal();$('projects-more').hidden=true;void load();});
 $('projects-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{sequence++;opening++;clearTimeout(searchTimer);loading=false;});
 $('projects-search').addEventListener('input',()=>{sequence++;clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(),250);});
 $('projects-filter').onchange=()=>{clearTimeout(searchTimer);void load();};$('projects-refresh').onclick=()=>{clearTimeout(searchTimer);void load();};$('projects-more').onclick=()=>{if(!loading)void load(true);};
 return {refresh:()=>{if(dialog.open)void load();}};
}
