(() => {
  'use strict';
  const root = document.querySelector('#news-sync-root');
  if (!root) return;
  const status = document.querySelector('#news-sync-status');
  const base = '/api/admin/v1/news-sync';
  let configDirty=false, modelDirty=false;
  let authenticated = false, loading = false, timer, revision, running = false, initialized = false, busy = false;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const message = text => { status.textContent = text; };
  const button = (text, fn) => { const node = el('button', text, 'secondary-button'); node.type = 'button'; node.addEventListener('click', fn); return node; };
  const reload = button('重新加载', () => { if(configDirty||modelDirty){message('有未保存的修改，请先保存设置再重新加载。');return;}initialized=false;void load(true); });
  const panel = el('div', null, 'news-sync-panel'); panel.hidden = true;
  root.append(reload, panel);
  function field(label, value, type = 'text') {
    const wrap = el('label', label), input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    if (type === 'checkbox') input.checked = Boolean(value); else input.value = value || '';
    if (type === 'checkbox') { wrap.textContent = ''; wrap.className = 'news-sync-check'; wrap.append(input, el('span', label)); } else wrap.append(input); return { wrap, input };
  }
  function select(label, values, value) {
    const wrap = el('label', label), input = el('select');
    for (const [key, title] of values) { const option = el('option', title); option.value = key; input.append(option); }
    input.value = value; wrap.append(input); return { wrap, input };
  }
  function link(url, title = '查看原文') {
    try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) return el('span', '原文链接不可用'); const node = el('a', title); node.href = parsed.href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node; } catch { return el('span', '原文链接不可用'); }
  }
  async function api(path = '', method = 'GET', body) {
    const token = window.nikaiStorage?.session.getItem('nike-admin-token');
    const response = await fetch(base + path, { method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token && token !== '__session_admin__' ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok) { const error = new Error(payload.title || '操作失败，请检查管理员认证'); error.status = response.status; throw error; }
    return payload.data ?? payload;
  }
  function lock() { authenticated = false; panel.hidden = true; clearTimeout(timer); }
  async function action(fn) {
    if (busy || !authenticated) return;
    busy = true; root.querySelectorAll('button').forEach(node => { node.disabled = true; });
    try { await fn(); } catch (error) { if (error.status === 401 || error.status === 403) lock(); message(error.message); }
    finally { busy = false; root.querySelectorAll('button').forEach(node => { node.disabled = false; }); paginationState(); }
  }
  const cards = el('div', null, 'news-sync-cards');
  const configForm = el('form', null, 'news-sync-box'); configForm.append(el('h3', '每日快讯设置'));
  const enabled = field('启用定时采集', false, 'checkbox');
  const interval = select('采集间隔', [[1440, '每天一次（推荐）'], [5, '每 5 分钟'], [15, '每 15 分钟'], [30, '每 30 分钟'], [60, '每 60 分钟']], '15');
  const limit = field('每轮最多发布（1–20条）',12,'number');limit.input.min='1';limit.input.max='20';limit.input.step='1';
  const sources = el('div', null, 'news-sync-sources');
  const add = button('添加来源', () => {configDirty=true;sourceRow({ id: crypto.randomUUID(), type: 'rss', enabled: true, policy: 'review' });});
  const save = el('button', '保存采集设置', 'primary-button'); save.type = 'submit';
  configForm.append(enabled.wrap, interval.wrap,limit.wrap, el('h4', '采集来源'), el('p', '每日搜索行业热点、产品、技术和投融资消息，默认每次最多发布12条最近72小时的中文快讯。可信原文核对、去重后自动发布；配图会尝试保存，无图也正常发布。'), sources, add, save);
  function sourceRow(source) {
    const box = el('fieldset', null, 'news-sync-source'); box.append(el('legend', source.name || '新来源'));
    const fields = { id: field('来源 ID', source.id), name: field('名称', source.name), type: select('格式', [['search', 'AI 主题联网搜索'], ['rss', 'RSS / Atom'], ['json', 'JSON'], ['aihot', 'AI HOT']], source.type || 'rss'), url: field('采集地址', source.url, 'url'), enabled: field('启用此来源', source.enabled, 'checkbox'), policy: select('发布策略', [['review', '采集后审核'], ['auto', '自动发布']], source.policy || 'review') };
    fields.id.wrap.hidden = true; fields.id.input.readOnly = true; fields.url.wrap.className = 'news-sync-full';
    const editor=el('details',null,'news-sync-source-editor');editor.open=!source.name;editor.append(el('summary','来源设置 · '+(source.type==='search'?'主题搜索':'订阅采集')+' · '+(source.policy==='auto'?'自动发布':'采集后审核')));
    const fieldsGrid = el('div', null, 'news-sync-fields'); Object.values(fields).forEach(item => fieldsGrid.append(item.wrap)); editor.append(fieldsGrid);box.append(editor);
    const collect = () => Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, item.input.type === 'checkbox' ? item.input.checked : item.input.value.trim()]));
    box.collect = collect; box.sourceId = source.id;
    const sourceStatus = el('p', null, 'news-sync-source-status'); box.sourceStatus = sourceStatus; box.append(sourceStatus);
    const preview = el('div', null, 'news-sync-preview'); preview.setAttribute('aria-live', 'polite');
    const sourceActions = el('div', null, 'news-sync-actions'); sourceActions.append(button('测试来源', () => void action(async () => { const result = await api('/test', 'POST', { source: collect() }); preview.replaceChildren(el('p', `测试发现 ${result.count ?? result.items?.length ?? 0} 条。预览不会发布；执行采集后，符合条件的消息自动发布。`)); for (const item of result.items || []) { const row = el('p', item.title || '无标题'); if (item.sourceUrl || item.url) row.append(' · ', link(item.sourceUrl || item.url)); preview.append(row); } message('来源测试完成'); })), button('移除来源', () => { configDirty=true;box.remove(); message('来源已移除，保存设置后生效'); })); box.append(sourceActions, preview);
    sources.append(box);
  }
  configForm.addEventListener('submit', event => { event.preventDefault(); void action(async () => { const result = await api('/config', 'PUT', { revision: revision, enabled: enabled.input.checked, intervalMinutes: Number(interval.input.value),briefing:{enabled:true,limit:Number(limit.input.value)}, sources: Array.from(sources.children).map(node => node.collect()) }); revision = result.revision ?? result.config?.revision ?? revision; configDirty=false;message('每日快讯设置已保存，将按当前间隔自动运行。'); }); });
  const modelForm = el('form', null, 'news-sync-box news-sync-model'); modelForm.append(el('h3', 'AI 摘要设置'), el('p', '可填写平台地址或 Chat Completions 完整接口地址（如 https://服务域名/v1/chat/completions）。模型仅依据来源做中文翻译与摘要，不补充事实。密钥只写入，页面不会读取或回显。'));
  const modelEnabled = field('启用 AI 摘要', false, 'checkbox'), endpoint = field('兼容 API 地址（支持平台地址或完整接口）', '', 'url'), model = field('模型名称', ''), key = field('新 API Key（留空保留现有密钥）', '', 'password'), clearKey = field('清除已保存密钥', false, 'checkbox');
  key.input.autocomplete = 'new-password'; const keyStatus = el('p');
  endpoint.wrap.className = 'news-sync-full'; key.wrap.className = 'news-sync-full';
  [modelEnabled, model, endpoint, key, clearKey].forEach(item => modelForm.append(item.wrap));
  const modelPicker=window.nikaiModelPicker({form:modelForm,scope:'news-sync',endpoint:endpoint.input,apiKey:key.input,clearKey:clearKey.input,model:model.input});model.input=modelPicker.select;
  const modelSave = el('button', '保存 AI 设置', 'primary-button'); modelSave.type = 'submit'; modelForm.append(keyStatus, modelSave);
  modelForm.addEventListener('submit', event => { event.preventDefault(); void action(async () => { const body = { enabled: modelEnabled.input.checked, endpoint: endpoint.input.value.trim(), model: model.input.value.trim() }; if (key.input.value) body.apiKey = key.input.value; if (clearKey.input.checked) body.clearKey = true; await api('/model', 'PUT', body); key.input.value = ''; clearKey.input.checked = false; modelDirty=false;message('AI 摘要设置已保存。'); await load(false, true); }); });
  const sync = button('立即采集', () => void action(async () => { await api('/sync', 'POST', {}); message('采集任务已进入队列'); await load(); }));
  const pending = el('div', null, 'news-sync-pending'), logs = el('div', null, 'news-sync-logs');
  configForm.addEventListener('input',()=>{configDirty=true;});modelForm.addEventListener('input',()=>{modelDirty=true;});
  panel.append(cards, sync, configForm, modelForm, el('h3', '待审核内容'), pending);
  const time = value => value ? new Date(value).toLocaleString('zh-CN') : '暂无';
  let queueSignature = '', pendingOffset = 0, pendingTotal = 0;
  const drafts = new Map();
  const pagination = el('nav', null, 'news-sync-pagination'); pagination.setAttribute('aria-label', '待审核内容分页');
  const pageInfo = el('span');
  function changePage(offset) {
    if (busy || loading || !authenticated) return;
    pendingOffset = Math.max(0, offset); queueSignature = ''; pending.replaceChildren();
    void load();
  }
  const previousPage = button('上一页', () => changePage(pendingOffset - 50));
  const nextPage = button('下一页', () => changePage(pendingOffset + 50));
  pagination.append(previousPage, pageInfo, nextPage); panel.append(pagination, el('h3', '采集记录（最近10条）'), logs);
  function paginationState() {
    previousPage.disabled = busy || loading || pendingOffset === 0;
    nextPage.disabled = busy || loading || pendingOffset + 50 >= pendingTotal;
    pageInfo.textContent = `第 ${Math.floor(pendingOffset / 50) + 1} / ${Math.max(1, Math.ceil(pendingTotal / 50))} 页 · 共 ${pendingTotal} 条待审核`;
  }
  const runLabels = { running: '采集中', success: '成功', partial: '部分完成', failed: '失败', stopped: '已停止' };
  const errorLabels = { NEWS_UNVERIFIED:'原文无法核对、来源未纳入可信名单或内容不够新，已跳过', NEWS_NETWORK_ERROR: '网络连接失败', NEWS_MODEL_AUTH:'摘要模型鉴权失败，自动来源先展示原文',NEWS_MODEL_ENDPOINT:'摘要接口地址不可用，自动来源先展示原文',NEWS_MODEL_TIMEOUT:'摘要模型响应超时，自动来源先展示原文',NEWS_MODEL_FAILED: '翻译或摘要失败', NEWS_SYNC_FAILED: '来源采集失败', NEWS_TIMEOUT: '请求超时', NEWS_HTTP_ERROR: '来源服务响应异常', NEWS_PARSE_ERROR: '来源内容解析失败', NEWS_UNSAFE_URL: '来源地址未通过安全检查', NEWS_TOO_LARGE: '来源内容超出大小限制' };
  function sourceStatusText(source) {
    return `最近成功：${time(source.lastSuccessAt)} · 连续失败：${Number(source.failures || 0)}${source.retryAt ? ` · 下次重试：${time(source.retryAt)}` : ''}`;
  }
  function render(data) {
    running = Boolean(data.status?.running);
    pendingTotal = Number(data.pendingTotal ?? data.pending?.length ?? 0); paginationState();
    cards.replaceChildren();
    for (const [label, value] of [['任务状态', running ? '采集中' : '待命'], ['最近成功', time(data.status?.lastSuccessAt)], ['下次采集', time(data.status?.nextRunAt)], ['本轮自动发布', data.runs?.[0]?.published ?? 0]]) { const card = el('div', null, 'news-sync-card'); card.append(el('span', label), el('strong', String(value))); cards.append(card); }
    const modelData = data.model || data.config.model || {};
    keyStatus.textContent = modelData.hasKey ? '已配置密钥' : '尚未配置密钥';
    if (!initialized) { revision = data.config.revision; enabled.input.checked = Boolean(data.config.enabled); interval.input.value = String(data.config.intervalMinutes);limit.input.value=String(data.config.briefing?.limit||12); sources.replaceChildren(); (data.config.sources || []).forEach(sourceRow); modelEnabled.input.checked = Boolean(modelData.enabled); endpoint.input.value = modelData.endpoint || ''; model.input.value = modelData.model || ''; initialized = true; }
    modelPicker.setConfig(modelData);
    for (const row of sources.children) { const source = (data.config.sources || []).find(item => item.id === row.sourceId); if (source) row.sourceStatus.textContent = sourceStatusText(source); else row.sourceStatus.textContent = '新来源尚未保存'; }
    const signature = JSON.stringify(data.pending || []);
    if (signature !== queueSignature && !pending.contains(document.activeElement) && !pending.querySelector('[data-dirty]')) { queueSignature = signature; pending.replaceChildren();
      if (!data.pending?.length) pending.append(el('p', '暂无待审核内容。'));
      for (const item of data.pending || []) {
        const box = el('form', null, 'news-sync-box'); const draft = drafts.get(item.id); const title = field('标题', draft?.title ?? item.title), summary = field('摘要', draft?.summary ?? item.summary, 'textarea'); if (draft) box.dataset.dirty = 'true'; title.input.maxLength = 200; summary.input.maxLength = 1000; summary.input.rows = 4;
        box.append(el('p', `${item.sourceName || '未知来源'} · ${time(item.publishedAt || item.discoveredAt)}`), link(item.sourceUrl), title.wrap, summary.wrap); if (item.reason) box.append(el('p', item.reason));
        const reviewActions = el('div', null, 'news-sync-actions'); reviewActions.append(button('确认发布', () => void action(async () => { await api('/items/' + encodeURIComponent(item.id), 'POST', { action: 'publish', title: title.input.value, summary: summary.input.value }); drafts.delete(item.id); box.remove(); queueSignature = ''; message('内容已发布'); await load(); })), button('拒绝', () => void action(async () => { await api('/items/' + encodeURIComponent(item.id), 'POST', { action: 'reject' }); drafts.delete(item.id); box.remove(); queueSignature = ''; message('内容已拒绝'); await load(); }))); box.append(reviewActions);
        box.addEventListener('input', () => { box.dataset.dirty = 'true'; drafts.set(item.id, { title: title.input.value, summary: summary.input.value }); }); box.addEventListener('submit', event => event.preventDefault()); pending.append(box);
      }
    }
    logs.replaceChildren(); if (!data.runs?.length) logs.append(el('p', '暂无采集记录。'));
    for (const run of (data.runs || []).slice(0, 10)) { const row = el('details', null, 'news-sync-run'); row.append(el('summary', `${time(run.startedAt)} · ${runLabels[run.status] || '未知状态'} · 新增 ${run.added ?? 0}`), el('p', `抓取 ${run.fetched ?? 0} · 时间过滤 ${run.filtered ?? 0} · 来源未变化 ${run.unchanged ?? 0} · 已发布 ${run.published ?? 0} · 重复 ${run.duplicates ?? 0} · 更新 ${run.updated ?? 0} · 原文核验 ${run.verified ?? 0} · 配图已保存 ${run.imagesSaved ?? 0} · 配图失败 ${run.imagesFailed ?? 0} · 超出本轮上限 ${run.limited ?? 0} · 失败 ${run.failed ?? 0} · 完成 ${time(run.finishedAt)}`)); for (const error of run.errors || []) row.append(el('p', `${error.sourceName || '来源'}：${errorLabels[error.code] || '采集失败'}${error.code ? `（${error.code}）` : ''}`)); for(const skip of run.skips||[])row.append(el('p',`${skip.sourceName}：${skip.reason}（已跳过）`)); logs.append(row); }
  }
  function schedule() { clearTimeout(timer); if (authenticated && !document.hidden) timer = setTimeout(() => void load(), running ? 3000 : 15000); }
  async function load(force = false, refreshRevision = false) {
    if (loading || (document.hidden && !force)) return;
    loading = true;
    try { let data = await api('?pendingOffset=' + pendingOffset); if (pendingOffset > 0 && pendingOffset >= Number(data.pendingTotal ?? 0)) { pendingOffset = Math.max(0, Math.floor((Number(data.pendingTotal) - 1) / 50) * 50); queueSignature = ''; pending.replaceChildren(); data = await api('?pendingOffset=' + pendingOffset); } if (force || refreshRevision) revision = data.config.revision; authenticated = true; panel.hidden = false; render(data); if (force) message(data.config.briefing?.enabled?'每日快讯已启用：可信消息自动发布，配图失败不影响发布。':'设置已加载。修改后请保存。'); }
    catch (error) { if (error.status === 401 || error.status === 403) lock(); message(error.message); }
    finally { loading = false; paginationState(); schedule(); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (authenticated) void load(); });
  for (const event of ['nikai:auth-changed', 'authchange', 'storage']) window.addEventListener(event, () => void load(true));
  for (const id of ['token-form', 'cms-token-form']) document.getElementById(id)?.addEventListener('submit', () => setTimeout(() => void load(true), 1000));
  void load(true);
})();







