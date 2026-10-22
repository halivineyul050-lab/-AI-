(() => {
  'use strict';
  const instances = new WeakMap();
  window.nikaiModelPicker = function attach(options) {
    const {form, endpoint, apiKey, clearKey, scope, providerId} = options;
    const original = options.model;
    if (instances.has(original)) return instances.get(original);
    const select = document.createElement('select');
    select.name = original.name; select.id = original.id; select.required = original.required;
    select.setAttribute('aria-label', '选择模型');
    original.replaceWith(select);
    if(apiKey)apiKey.closest('label').after(select.closest('label'));
    const controls = document.createElement('div'); controls.className = 'model-picker-controls';
    const refresh = document.createElement('button');refresh.type='button';refresh.className='secondary-button';refresh.textContent='刷新模型';
    const status = document.createElement('span');status.className='assistant-field-note';status.setAttribute('role','status');
    status.textContent='填写接口地址和 API Key 后自动获取模型；已保存的密钥可留空。';
    controls.append(refresh,status);select.closest('label').after(controls);
    let sequence=0,timer,controller,savedEndpoint='',hasKey=false,last='',current='';
    function populate(ids,value){
      select.replaceChildren(new Option('请选择模型',''));
      if(value&&!ids.includes(value))select.add(new Option(value+'（当前配置）',value));
      for(const id of ids)select.add(new Option(id,id));
      select.value=value||'';
    }
    populate([],original.value);
    const snapshot=()=>JSON.stringify([endpoint.value.trim(),apiKey?.value||'',!!clearKey?.checked,providerId?.()||'',window.nikaiModelProfiles?.profileId(form)||'']);
    function invalidate(){sequence++;controller?.abort();clearTimeout(timer);last='';refresh.disabled=false;}
    function changed(){invalidate();populate([], '');status.textContent='填写接口地址和密钥后自动获取模型。';timer=setTimeout(()=>void load(),600);}
    async function load(force=false){
      const signature=snapshot();
      if(!endpoint.value.trim()||(!apiKey?.value.trim()&&(clearKey?.checked||!hasKey&&!window.nikaiModelProfiles?.profileId(form))))return;
      if(!force&&signature===last)return;
      invalidate();last=signature;const version=sequence;controller=new AbortController();
      const activeController=controller;
      const timeout=setTimeout(()=>activeController.abort(),20000);
      refresh.disabled=true;status.textContent='正在获取模型…';
      try{
        const token=options.token?.()||window.nikaiStorage?.session.getItem('nike-admin-token');
        const response=await fetch('/api/admin/v1/model-discovery',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json',...(token&&token!=='__session_admin__'?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({...{scope,endpoint:endpoint.value.trim(),apiKey:apiKey?.value||'',clearKey:!!clearKey?.checked,...(providerId?{providerId:providerId()}: {})},...(window.nikaiModelProfiles?.profileId(form)?{profileId:window.nikaiModelProfiles.profileId(form)}:{})})});
        const body=await response.json();
        if(version!==sequence||signature!==snapshot())return;
        if(!response.ok)throw Error(body.title||'获取模型失败，请刷新重试。');
        const ids=(body.data?.items||[]).map(x=>x.id).filter(x=>typeof x==='string'&&(scope==='image'||x.length<=120));
        populate(ids,select.value);
        status.textContent=ids.length?`已获取 ${ids.length} 个模型，请选择后保存。`:'服务商返回的模型列表为空。';
      }catch(error){if(version===sequence){last='';status.textContent=error.name==='AbortError'?'获取模型超时，请刷新重试。':error.message||'连接失败，请刷新重试。';}}
      finally{clearTimeout(timeout);if(version===sequence)refresh.disabled=false;}
    }
    endpoint.addEventListener('input',changed);apiKey?.addEventListener('input',changed);clearKey?.addEventListener('change',changed);
    refresh.addEventListener('click',()=>void load(true));
    const picker={select,load,changed,setConfig(config,forceReset=false){
      window.nikaiModelProfiles?.clear(form);
      const nextEndpoint=config.endpoint||endpoint.value;
      const reset=forceReset||nextEndpoint!==savedEndpoint||config.model!==current;
      hasKey=!!config.hasKey;savedEndpoint=nextEndpoint;current=config.model||'';
      if(reset){invalidate();populate([],current);}
      if(!form.hidden&&!select.disabled&&!select.closest('fieldset')?.disabled)void load();
    }};
    if(scope!=='image'||apiKey)window.nikaiModelProfiles?.attach({...options,model:select,onSelect(item){hasKey=!!item.hasKey;invalidate();void load();}});
    instances.set(original,picker);instances.set(select,picker);return picker;
  };
})();
