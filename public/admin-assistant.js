(() => {
  const form = document.querySelector('#assistant-provider-form');
  if (!form) return;
  const status = document.querySelector('#assistant-admin-status');
  const feedback = document.querySelector('#assistant-save-status');
  const reload = document.querySelector('#assistant-admin-load');
  const button = form.querySelector('[type=submit]');
  let busy = false;
  function report(message, state = 'info') { feedback.textContent = message; feedback.dataset.state = state; }
  function setBusy(value, saving = false) { busy = value; button.disabled = value; reload.disabled = value; button.textContent = saving ? '保存中…' : '保存小助手配置'; }
  function errorText(error) {
    if (['TimeoutError','AbortError'].includes(error.name)) return '请求超时，请检查接口地址或网络后重试。';
    if (error instanceof TypeError) return '连接失败，请检查网络后重试。';
    return error.message || '操作失败，请稍后重试。';
  }
  async function api(options = {}) {
    const token = window.nikaiStorage?.session.getItem('nike-admin-token');
    const response = await fetch('/api/admin/v1/assistant/provider', {credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(20000), ...options, headers:{Accept:'application/json', ...(options.body?{'Content-Type':'application/json'}:{}), ...(token && token !== '__session_admin__'?{Authorization:`Bearer ${token}`}:{})}});
    let body; try { body = await response.json(); } catch { throw Error('服务器返回异常，请稍后重试。'); }
    if (!response.ok) throw Error(body.title || '请先完成管理员认证');
    if (!body.data || typeof body.data.enabled !== 'boolean') throw Error('配置响应不完整，请重新加载。');
    return body.data;
  }
  let modelPicker;
  function render(data) {
    for (const key of ['endpoint','model','welcome','dailyLimit']) form.elements[key].value = data[key];
    form.elements.enabled.checked = data.enabled;
    form.elements.clearKey.checked = false;
    form.elements.apiKey.value = '';
    document.querySelector('#assistant-key-hint').textContent = data.hasKey ? '已保存密钥；留空保留，密钥不会返回浏览器。' : '尚未保存密钥';
    form.hidden = false;
    modelPicker ||= window.nikaiModelPicker({form,scope:"assistant",endpoint:form.elements.endpoint,apiKey:form.elements.apiKey,clearKey:form.elements.clearKey,model:form.elements.model});
    modelPicker.setConfig(data);
    status.textContent = data.ready ? '小助手已启用，可以在前台登录后聊天。' : '配置未开启或不完整，前台会显示尚未开放。';
  }
  async function load() {
    if (busy) return;
    setBusy(true); report('正在加载配置…');
    try {render(await api()); report('配置已加载，可以编辑并保存。');} catch(error) {const message = errorText(error); status.textContent = message; report(message,'error');} finally {setBusy(false);}
  }
  reload.addEventListener('click', load);
  form.addEventListener('invalid', event => {
    const names = {welcome:'欢迎语',endpoint:'接口地址',dailyLimit:'每日次数'};
    report(`请检查${names[event.target.name] || '输入内容'}：${event.target.validationMessage}`, 'error');
  }, true);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true, true); report('正在保存配置，请稍候…');
    try {
      const data = Object.fromEntries(['endpoint','model','welcome','apiKey'].map(key => [key, form.elements[key].value]));
      data.dailyLimit = Number(form.elements.dailyLimit.value); data.enabled = form.elements.enabled.checked; data.clearKey = form.elements.clearKey.checked;
      const result = await api({method:'PUT',body:JSON.stringify(window.nikaiModelProfiles?.withProfile(form,data)||data)});
      render(result);
      report(result.ready ? '配置已保存，小助手已启用。' : result.enabled ? '配置已保存；服务暂未就绪。' : '配置已保存；聊天尚未启用。', 'success');
    } catch(error) {const message = errorText(error); status.textContent = message; report(message, 'error');} finally {setBusy(false);}
  });
  void load();
})();
