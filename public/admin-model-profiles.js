(() => {
  'use strict';
  const states = new WeakMap();
  const supported = new Set(['assistant','explainer','nestdutio','image']);
  function profileId(form) { return states.get(form)?.id; }
  function clear(form) { const state=states.get(form); if(state)state.id=undefined; }
  function withProfile(form,payload) {
    if(Object.prototype.hasOwnProperty.call(payload,'profileId')){payload={...payload};delete payload.profileId;}
    const state=states.get(form);
    if(state && (state.options.endpoint.value!==state.endpoint || (state.options.apiKey||form.querySelector('[name=apiKey]'))?.value.trim() || state.options.clearKey?.checked))clear(form);
    return profileId(form)?{...payload,profileId:profileId(form)}:payload;
  }
  function attach(options) {
    const {form,endpoint,apiKey,clearKey,model,scope}=options;
    if(!supported.has(scope))return;
    if(states.has(form))return states.get(form).api;
    const state={options,id:undefined,items:[]};states.set(form,state);
    const box=document.createElement('div');box.className='model-profile-library';
    const title=document.createElement('strong');title.textContent=scope==='image'?'图片模型配置库':'对话模型配置库';
    const nameLabel=document.createElement('label');nameLabel.textContent='方案名称';
    const name=document.createElement('input');name.type='text';name.maxLength=80;name.placeholder='例如：日常快速模型';nameLabel.append(name);
    const selectLabel=document.createElement('label');selectLabel.textContent='已保存方案';
    const select=document.createElement('select');select.setAttribute('aria-label','已保存方案');selectLabel.append(select);
    const actions=document.createElement('div');actions.className='model-profile-actions';
    function button(text){const b=document.createElement('button');b.type='button';b.className='secondary-button';b.textContent=text;actions.append(b);return b;}
    const save=button('保存当前为方案'),use=button('选用方案'),remove=button('删除方案'),refresh=button('刷新方案');
    const status=document.createElement('span');status.className='assistant-field-note';status.setAttribute('role','status');
    box.append(title,nameLabel,selectLabel,actions,status);
    (model?.closest('label')||endpoint.closest('label')).after(box);
    let busy=false,deleteId='';
    const kind=scope==='image'?'image':'chat';
    async function request(path='',input,method='GET') {
      const token=options.token?.()||window.nikaiStorage?.session.getItem('nike-admin-token');
      const response=await fetch('/api/admin/v1/model-profiles'+path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',...(input?{'Content-Type':'application/json'}:{}),...(token&&token!=='__session_admin__'?{Authorization:'Bearer '+token}:{})},body:input?JSON.stringify(input):undefined});
      const body=await response.json();if(!response.ok)throw Error(body.title||'配置库操作失败');return body.data;
    }
    function render(selected='') {
      select.replaceChildren(new Option('请选择已保存方案',''));
      for(const item of state.items)select.add(new Option(item.name+' · '+(item.model||'未指定模型'),item.id));
      select.value=selected;
    }
    async function load(selected=''){const data=await request('?kind='+kind);state.items=(data.items||[]).filter(item=>item.kind===kind);render(selected);}
    async function run(action){if(busy)return;busy=true;for(const b of [save,use,remove,refresh])b.disabled=true;try{await action();}catch(error){status.textContent=error.message||'配置库暂不可用，原配置仍可保存。';}finally{busy=false;for(const b of [save,use,remove,refresh])b.disabled=false;}}
    save.addEventListener('click',()=>void run(async()=>{
      if(!name.value.trim())throw Error('请填写方案名称。');
      if(clearKey?.checked)throw Error('请取消清除密钥后再保存方案。');
      const providerId=typeof options.providerId==='function'?options.providerId():options.providerId;
      const item=await request('',withProfile(form,{name:name.value.trim(),kind,endpoint:endpoint.value.trim(),model:model?.value||'',apiKey:(apiKey||form.querySelector('[name=apiKey]'))?.value||'',...(profileId(form)?{profileId:profileId(form)}:{}),source:{scope,...(providerId?{providerId}:{})}}),'POST');
      await load(item.id);status.textContent='方案已保存，可在同类模块选用。';
    }));
    use.addEventListener('click',()=>{
      const item=state.items.find(item=>item.id===select.value);if(!item){status.textContent='请先选择方案。';return;}
      endpoint.value=item.endpoint;if(apiKey)apiKey.value='';if(clearKey)clearKey.checked=false;
      if(model){if(model.tagName==='SELECT'&&!Array.from(model.options).some(option=>option.value===item.model))model.add(new Option(item.model,item.model));model.value=item.model||'';}
      state.id=item.id;state.endpoint=endpoint.value;
      if(apiKey)apiKey.required=false;
      status.textContent='已选用「'+item.name+'」，点击本模块原保存按钮后生效。';options.onSelect?.(item);
    });
    remove.addEventListener('click',()=>void run(async()=>{
      if(!select.value)throw Error('请先选择方案。');
      if(deleteId!==select.value){deleteId=select.value;status.textContent='再次点击删除方案确认；活动配置不会改变。';return;}
      const id=select.value;await request('/'+encodeURIComponent(id),undefined,'DELETE');if(state.id===id)clear(form);deleteId='';await load();status.textContent='方案已删除；已保存的活动配置保持不变。';
    }));
    refresh.addEventListener('click',()=>void run(async()=>{await load();status.textContent='方案列表已刷新。';}));
    select.addEventListener('change',()=>{deleteId='';});
    form.addEventListener('input',event=>{if(event.target.name==='apiKey')clear(form);});
    endpoint.addEventListener('input',()=>clear(form));apiKey?.addEventListener('input',()=>clear(form));clearKey?.addEventListener('change',()=>clear(form));
    form.elements?.inherit?.addEventListener('change',()=>clear(form));form.addEventListener('reset',()=>clear(form));
    state.api={clear:()=>clear(form),load:()=>run(()=>load())};void run(()=>load());return state.api;
  }
  window.nikaiModelProfiles={attach,withProfile,profileId,clear};
})();
