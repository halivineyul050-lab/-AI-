import { CREATION_CASES, chooseCaseModel, creationCost, settlementText, timingText, pendingKey } from './first-creation-core.mjs?v=20261014-first-1';
import { fetchImageJob } from './image-job-request.mjs?v=20261019-1';

export function createFirstCreation(elements, state, hooks) {
  const panel = document.querySelector('#first-creation');
  const grid = document.querySelector('#creation-case-grid');
  const selected = document.querySelector('#creation-selected');
  const timing = document.querySelector('#creation-timing');
  const costNote = document.querySelector('#creation-cost-note');
  const actions = document.querySelector('#creation-job-actions');
  const resume = document.querySelector('#creation-resume');
  const elapsed = document.querySelector('#creation-elapsed');
  const outcome = document.querySelector('#creation-outcome');
  let audience = 'content', item = null, config = null, wallet = null;
  let context = null, activeJob = null, contextRequest = 0, timer = null, startedAt = 0;
  let terminal = false, recovering = false, uncertain = false;
  let lastAccount = null;
  const viewed = new Set();

  function track(eventName, properties = {}) {
    try {
      const getId = (storage, key) => { let value = storage.getItem(key); if (!value) { value = crypto.randomUUID(); storage.setItem(key, value); } return value; };
      const body = JSON.stringify({ visitorId: getId(localStorage, 'nike-visitor'), sessionId: getId(sessionStorage, 'nike-session'), events: [{ eventId: crypto.randomUUID(), eventName, clientTime: new Date().toISOString(), pageType: 'image_generation', path: '/image-generation', properties }] });
      void fetch('/api/v1/events/batch', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* Optional analytics cannot block creation. */ }
  }
  function renderCards() {
    grid.replaceChildren();
    for (const c of CREATION_CASES.filter(c => c.audience === audience)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'creation-case'; button.dataset.caseId = c.id;
      button.setAttribute('aria-pressed', String(item?.id === c.id));
      const image = document.createElement('img'); image.src = c.image; image.alt = c.name + '的AI生成示例'; image.width = 960; image.height = 600; image.decoding = 'async';
      const copy = document.createElement('span'); copy.className = 'creation-case-copy';
      const badge = document.createElement('small'); badge.textContent = c.requiresReference ? '需要商品参考图' : '无需上传图片';
      const title = document.createElement('strong'); title.textContent = c.name;
      const desc = document.createElement('span'); desc.textContent = c.subtitle;
      const go = document.createElement('span'); go.className = 'creation-case-go'; go.textContent = '使用这个案例 ↗';
      copy.append(badge, title, desc, go); button.append(image, copy);
      button.addEventListener('click', () => selectCase(c)); grid.append(button);
    }
  }
  function selectCase(c) {
    if (state.requestController || activeJob) { show('请先确认当前任务结果，再选择新的案例。'); return; }
    if (elements.prompt.value.trim() && elements.prompt.value.trim() !== c.prompt && !window.confirm('使用这个案例会替换当前描述。是否继续？')) return;
    if (!c.requiresReference && elements.referenceInput.files?.length) { show('请先移除参考图，再使用无需图片的案例。'); return; }
    item = c; elements.prompt.value = c.prompt; elements.style.value = c.style;
    const model = chooseCaseModel(c, state.models, elements.model.value);
    if (model) {
      elements.model.value = model.id; hooks.updateModelControls(elements);
      elements.ratio.value = model.supportedRatios.includes(c.ratio) ? c.ratio : model.supportedRatios[0];
      elements.count.value = '1';
    }
    elements.prompt.dispatchEvent(new Event('input'));
    selected.hidden = false; selected.querySelector('strong').textContent = `已选择：${c.name}`;
    selected.querySelector('span').textContent = !model ? '暂无适配模型，可保留描述稍后尝试。' : c.requiresReference ? '请上传商品照片，描述和画面设置已填好。' : `描述和画面设置已填好，可直接生成或继续编辑。${elements.ratio.value !== c.ratio ? '画幅已调整为模型支持的比例。' : ''}`;
    document.querySelector('#creation-case-tip').textContent = c.tip;
    renderCards(); updateCost(config, wallet); hooks.saveDraft(elements);
    track('image_case_select', { case_id: c.id, audience: c.audience });
    elements.form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    if (c.requiresReference && model && !elements.referenceInput.files?.length) elements.referenceTrigger.focus(); else elements.prompt.focus();
  }
  function show(text, tone = 'error') { elements.status.textContent = text; elements.status.dataset.tone = tone; elements.status.hidden = false; }
  function updateCost(nextConfig, nextWallet) {
    config = nextConfig; wallet = nextWallet;
    const cost = creationCost(config, elements.model.value, Number(elements.count.value) || 1, wallet);
    timing.textContent = timingText(context?.timings?.find(t => t.modelRecordId === elements.model.value));
    costNote.textContent = !cost.ready ? '积分价格暂不可用，请重试读取后再生成。' : state.authStatus !== 'authenticated' ? '先选择案例，登录后可生成。积分先预留，完成后按成功张数结算。' : cost.available === null ? '正在确认可用积分，读取完成后可生成。' : !cost.sufficient ? `还差 ${cost.total - cost.available} 积分，可充值后继续。` : '积分先预留，完成后按成功张数结算；任务结果未知时，请先查询原任务。';
    if (!state.models.some(m => m.id === elements.model.value)) return;
    const requiresReference = Boolean(item?.requiresReference && !elements.referenceInput.files?.length);
    const incompatible = Boolean(item?.requiresReference && !state.models.find(m => m.id === elements.model.value)?.supportsReferenceImage);
    elements.submit.disabled = Boolean(state.requestController || activeJob || uncertain || !cost.ready || state.authStatus === 'checking' || state.authStatus === 'error' || (state.authStatus === 'authenticated' && !cost.sufficient) || requiresReference || incompatible);
    elements.submit.textContent = state.requestController ? '正在生成…' : activeJob || uncertain ? '请先查询当前任务' : !cost.ready ? '积分价格暂不可用' : requiresReference || incompatible ? '请先上传参考图并选择适配模型' : state.authStatus !== 'authenticated' ? '登录后生成图片' : !cost.sufficient ? cost.available === null ? '正在确认积分…' : '积分不足，充值后继续' : `生成图片 · ${cost.total} 积分`;
    panel.querySelectorAll('.creation-case').forEach(button => { button.disabled = Boolean(state.requestController || activeJob); });
  }
  function beforeSubmit() {
    if (activeJob || uncertain || state.requestController) { show('已有任务待确认，请查询原任务，避免重复扣费。'); return false; }
    const cost = creationCost(config, elements.model.value, Number(elements.count.value) || 1, wallet);
    if (!cost.ready || !cost.sufficient) { updateCost(config, wallet); return false; }
    if (item?.requiresReference && !elements.referenceInput.files?.length) { show('此案例需要商品参考图，请先上传。'); return false; }
    return true;
  }
  function started() {
    ++contextRequest;
    terminal = false; outcome.hidden = true; startedAt = Date.now(); elapsed.hidden = false;
    actions.hidden = false; resume.hidden = true; document.querySelector('#creation-retry').hidden = true; document.querySelector('#creation-stop').hidden = false;
    window.clearInterval(timer); timer = window.setInterval(() => { elapsed.textContent = `已等待 ${Math.floor((Date.now() - startedAt) / 1000)} 秒 · ${timing.textContent}`; }, 1000);
    track('image_generation_submit', { case_id: item?.id || 'custom', model_id: elements.model.value, count: Number(elements.count.value), first_creation: context ? !context.everSucceeded : null });
    updateCost(config, wallet);
  }
  function rememberJob(jobId, reservedCredits) {
    ++contextRequest; uncertain = false;
    try { sessionStorage.removeItem('nikai-image-uncertain:' + state.user.id); } catch {}
    activeJob = { id: jobId, userId: state.user?.id, startedAt, settings: { modelRecordId: elements.model.value, modelName: state.models.find(m => m.id === elements.model.value)?.displayName, prompt: elements.prompt.value, ratio: elements.ratio.value, style: elements.style.value, count: Number(elements.count.value) }, caseId: item?.id || null };
    try { sessionStorage.setItem(pendingKey(activeJob.userId), JSON.stringify(activeJob)); } catch {}
    if (Number.isSafeInteger(reservedCredits)) costNote.textContent = `本次已预留 ${reservedCredits} 积分，完成后按成功张数结算。`;
  }
  function clearJob() { if (activeJob?.userId) { try { sessionStorage.removeItem(pendingKey(activeJob.userId)); } catch {} } activeJob = null; }
  function success(data) {
    ++contextRequest; uncertain = false;
    try { sessionStorage.removeItem('nikai-image-uncertain:' + state.user.id); } catch {}
    const caseId = item?.id || activeJob?.caseId || 'custom';
    const wasFirst = context ? !context.everSucceeded : null;
    terminal = true; clearJob(); window.clearInterval(timer); elapsed.hidden = true; actions.hidden = true;
    const credits = data?.credits;
    const text = Number.isFinite(credits?.charged) ? `实际使用 ${credits.charged} 积分${credits.refunded ? `，预留释放 ${credits.refunded} 积分` : ''}` : '实际积分请查看积分账户';
    outcome.hidden = false; outcome.querySelector('h2').textContent = wasFirst ? '你的第一张图，完成了。' : '图片已生成，看看你的作品。';
    outcome.querySelector('p').textContent = `${text} · ${data.historySaved ? '已保存到账号云历史' : '请先下载，云历史保存尚未成功'}。${CREATION_CASES.find(c => c.id === caseId)?.tip || ''}`;
    panel.open = false; if (context) context.everSucceeded = true;
    track('image_generation_success', { case_id: caseId, generation_id: data.generationId, count: data.images?.length || 0, first_creation: wasFirst, history_saved: Boolean(data.historySaved) });
  }
  function failure(error) {
    window.clearInterval(timer); elapsed.hidden = true;
    terminal = Boolean(error.settlement);
    if (terminal) { clearJob(); show(`${error.message} ${settlementText(error.settlement)}`); }
    actions.hidden = false;
    uncertain = Boolean(error.requiresConfirmation) || (!activeJob && !error.code && !error.status);
    if (uncertain) { try { sessionStorage.setItem('nikai-image-uncertain:' + state.user.id, 'true'); } catch {} }
    resume.hidden = !activeJob && !uncertain;
    document.querySelector('#creation-stop').hidden = true;
    document.querySelector('#creation-confirm-checked').hidden = !uncertain;
    document.querySelector('#creation-retry').hidden = Boolean(activeJob);
    track('image_generation_failure', { case_id: item?.id || 'custom', error_code: error.code || 'network_unknown', confirmed: terminal });
  }
  function finished() { window.clearInterval(timer); elapsed.hidden = true; updateCost(config, wallet); }
  async function recoverJob() {
    if (!activeJob || recovering || state.requestController) return;
    recovering = true;
    const job = activeJob, version = state.accountVersion;
    const controller = new AbortController(); state.requestController = controller;
    const settings = job.settings;
    startedAt = job.startedAt || Date.now();
    show('正在查询原任务，没有重新提交生成。', 'info');
    document.querySelector('#creation-stop').hidden = false;
    elapsed.hidden = false;
    timer = window.setInterval(() => { elapsed.textContent = `已等待 ${Math.floor((Date.now() - startedAt) / 1000)} 秒 · 正在查询原任务`; }, 1000);
    updateCost(config, wallet);
    try {
      const deadline = Date.now() + 810000;
      let response;
      do {
        response = await fetchImageJob(`/api/v1/image-generation-jobs/${job.id}`, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (version !== state.accountVersion) return;
        if (response.status === 202) {
          if (Date.now() > deadline) throw new Error('等待时间较长，请稍后查询原任务或查看云历史。');
          await new Promise(resolve => window.setTimeout(resolve, 2000));
        }
      } while (response.status === 202);
      if (!response.ok) {
        const error = await hooks.normalizeError(response);
        if (version !== state.accountVersion) return;
        if (response.status === 404) { clearJob(); error.requiresConfirmation = true; error.message = '任务查询已过期，请先检查云历史与积分账户。确认结果前不要重新生成。'; }
        throw error;
      }
      const payload = await response.json();
      if (version !== state.accountVersion) return;
      hooks.renderRecovered(payload.data, settings || { modelName: '原任务', prompt: '恢复的生成任务', ratio: '1:1', style: '自动' });
      success(payload.data);
    } catch (error) {
      if (version !== state.accountVersion) return;
      show(error.code ? error.message : '暂时无法查询结果，请稍后查询原任务或查看云历史，避免重复生成。'); failure(error);
    } finally {
      if (state.requestController === controller) state.requestController = null;
      recovering = false;
      if (version === state.accountVersion) { finished(); hooks.refreshCredits(elements); }
    }
  }
  async function onAccountChanged() {
    const version = ++contextRequest;
    const userId = state.user?.id || null;
    if (lastAccount !== userId) { activeJob = null; context = null; uncertain = false; actions.hidden = true; outcome.hidden = true; elapsed.hidden = true; window.clearInterval(timer); lastAccount = userId; }
    panel.open = true;
    if (!userId || state.authStatus !== 'authenticated') { updateCost(config, wallet); return; }
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(pendingKey(userId)) || 'null'); } catch {}
    if (saved?.userId === userId && /^[0-9a-f-]{36}$/.test(saved.id)) activeJob = saved;
    try { uncertain = !activeJob && sessionStorage.getItem('nikai-image-uncertain:' + userId) === 'true'; } catch {}
    if (activeJob || uncertain) {
      actions.hidden = false; resume.hidden = false;
      document.querySelector('#creation-stop').hidden = true;
      document.querySelector('#creation-retry').hidden = true;
      document.querySelector('#creation-confirm-checked').hidden = !uncertain;
      show('发现尚未确认的任务，请先查询结果或核对云历史与积分。', 'info');
    }
    updateCost(config, wallet);
    try {
      const response = await fetch('/api/v1/image-creation-context', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      if (version !== contextRequest || state.user?.id !== userId) return;
      context = payload.data; panel.open = !context.everSucceeded;
      try { saved = JSON.parse(sessionStorage.getItem(pendingKey(userId)) || 'null'); } catch {}
      const pending = context.pendingJobs?.[0];
      activeJob = saved?.userId === userId && /^[0-9a-f-]{36}$/.test(saved.id) ? saved : pending ? { id: pending.id, userId, startedAt: Date.parse(pending.createdAt) } : null;
      try { uncertain = !activeJob && sessionStorage.getItem('nikai-image-uncertain:' + userId) === 'true'; } catch {}
      if (activeJob) { actions.hidden = false; resume.hidden = false; document.querySelector('#creation-retry').hidden = true; show('发现待确认的创作任务，可查询原任务结果。', 'info'); }
      else if (uncertain) { actions.hidden = false; resume.hidden = false; document.querySelector('#creation-confirm-checked').hidden = false; show('提交结果尚未确认。请先查看云历史和积分记录，核对后再继续创作。'); }
      if (!viewed.has(userId) && !context.everSucceeded) { viewed.add(userId); track('image_creation_view', { first_creation: true, audience }); }
      updateCost(config, wallet);
    } catch { /* Core generation remains usable if context is temporarily unavailable. */ }
  }
  panel.querySelectorAll('[data-audience]').forEach(button => button.addEventListener('click', () => {
    audience = button.dataset.audience;
    panel.querySelectorAll('[data-audience]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderCards();
  }));
  document.querySelector('#creation-custom').addEventListener('click', () => { panel.open = false; elements.prompt.focus(); });
  document.querySelector('#creation-change').addEventListener('click', () => { panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.querySelector('#creation-reset').addEventListener('click', () => { item = null; selected.hidden = true; document.querySelector('#creation-case-tip').textContent = ''; renderCards(); updateCost(config, wallet); });
  resume.addEventListener('click', async () => { if (!activeJob) await onAccountChanged(); if (activeJob) void recoverJob(); });
  document.querySelector('#creation-open-history').addEventListener('click', () => document.querySelector('#studio-mode-history').click());
  document.querySelector('#creation-confirm-checked').addEventListener('click', () => { uncertain = false; try { sessionStorage.removeItem('nikai-image-uncertain:' + state.user.id); } catch {} actions.hidden = true; updateCost(config, wallet); show('请确认描述和费用，再开始新的创作。', 'info'); });
  document.querySelector('#creation-retry').addEventListener('click', () => { if (!activeJob && !state.requestController) { elements.prompt.focus(); show('描述已保留，请确认设置和积分后点击生成。', 'info'); } });
  document.querySelector('#creation-stop').addEventListener('click', () => { if (state.requestController) state.requestController.abort(); });
  elements.referenceInput.addEventListener('change', () => updateCost(config, wallet));
  elements.composer.addEventListener('click', () => window.setTimeout(() => updateCost(config, wallet), 0));
  elements.ratio.addEventListener('change', () => updateCost(config, wallet));
  renderCards();
  track('image_creation_view', { first_creation: null, audience });
  return { updateCost, beforeSubmit, started, rememberJob, success, failure, finished, onAccountChanged, track,
    get selectedCaseId() { return item?.id || null; }, restoreCase(id) { item = CREATION_CASES.find(c => c.id === id) || null; },
    download(data) { track('image_result_download', { generation_id: data.id || '', case_id: item?.id || 'custom' }); }
  };
}
