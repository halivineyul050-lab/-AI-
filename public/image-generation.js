import { createImageHistory } from './image-generation-history.js';

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 1000;
const imageStudioState = { models: [], requestController: null };
const imageHistory = createImageHistory();
let historyObjectUrls = [];

function validateReferenceFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file?.type)) return { ok: false, message: '参考图仅支持 PNG、JPEG 或 WebP。' };
  if (file.size > MAX_REFERENCE_BYTES) return { ok: false, message: '参考图不能超过 10MB。' };
  return { ok: true, message: '' };
}

function ratioCss(ratio) {
  return ratio.replace(':', '/');
}

function setMessage(element, message, tone = '') {
  element.textContent = message;
  element.hidden = !message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function safeFilePart(value) {
  return String(value).replace(/[\\/:*?"<>|]+/g, '-').trim() || '图片';
}

function extensionForMimeType(mimeType) {
  return ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[mimeType] || 'png';
}

function downloadResult(result, modelName) {
  const link = document.createElement('a');
  link.href = result.src;
  link.download = `泥壳AI-${safeFilePart(modelName)}-${result.id}.${extensionForMimeType(result.mimeType)}`;
  document.body.append(link);
  link.click();
  link.remove();
}

function renderResults(container, results, settings, onRepeat) {
  container.replaceChildren();
  const heading = document.createElement('header');
  heading.className = 'results-heading';
  const summary = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = '创作结果';
  const description = document.createElement('p');
  description.textContent = `${settings.modelName} · ${settings.style} · ${settings.ratio}`;
  summary.append(title, description);
  const repeat = document.createElement('button');
  repeat.type = 'button';
  repeat.className = 'results-repeat';
  repeat.textContent = '再次生成';
  repeat.addEventListener('click', onRepeat);
  heading.append(summary, repeat);
  container.append(heading);

  results.forEach((result) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    const visual = document.createElement('div');
    visual.className = 'result-visual';
    visual.style.setProperty('--result-ratio', ratioCss(result.ratio));
    const image = new Image();
    image.src = result.src;
    image.alt = result.alt;
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = settings.modelName;
    visual.append(image, badge);
    const footer = document.createElement('footer');
    const caption = document.createElement('span');
    caption.textContent = settings.prompt;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = '下载';
    download.addEventListener('click', () => downloadResult(result, settings.modelName));
    actions.append(download);
    footer.append(caption, actions);
    card.append(visual, footer);
    container.append(card);
  });
  container.hidden = false;
  container.classList.add('has-results');
  container.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function releaseHistoryUrls() {
  historyObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  historyObjectUrls = [];
}

async function saveGeneratedImages(results, settings, statusElement) {
  try {
    const records = [];
    for (const [index, result] of results.entries()) {
      const response = await fetch(result.src, { headers: { Accept: 'image/*' } });
      const type = response.headers?.get?.('content-type') || result.mimeType;
      if (!response.ok || !String(type).startsWith('image/')) throw new Error('invalid image response');
      const blob = await response.blob();
      records.push({ id: `${Date.now()}-${result.id}-${index}`, blob, prompt: settings.prompt, modelName: settings.modelName, ratio: settings.ratio, style: settings.style, mimeType: result.mimeType || blob.type, createdAt: Date.now() + index });
    }
    await imageHistory.addMany(records);
  } catch {
    if (statusElement) setMessage(statusElement, '图片已生成，但历史保存失败，请及时下载。', 'error');
  }
}

async function renderImageHistory(elements) {
  releaseHistoryUrls();
  elements.grid.replaceChildren();
  setMessage(elements.status, '正在读取本地历史…');
  try {
    const items = await imageHistory.list();
    elements.empty.hidden = items.length > 0;
    elements.clear.disabled = items.length === 0;
    items.forEach((item) => {
      const url = URL.createObjectURL(item.blob);
      historyObjectUrls.push(url);
      const card = document.createElement('article'); card.className = 'history-card';
      const image = new Image(); image.src = url; image.alt = `${item.modelName}：${item.prompt.slice(0, 48)}`; image.style.setProperty('--history-ratio', ratioCss(item.ratio));
      const body = document.createElement('div'); body.className = 'history-card-body';
      const title = document.createElement('h3'); title.textContent = item.prompt || '未命名作品';
      const meta = document.createElement('p'); meta.className = 'history-card-meta'; meta.textContent = `${item.modelName} · ${item.style} · ${item.ratio} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`;
      const actions = document.createElement('div'); actions.className = 'history-card-actions';
      const download = document.createElement('button'); download.type = 'button'; download.textContent = '下载';
      download.addEventListener('click', () => downloadResult({ id: item.id, src: url, mimeType: item.mimeType }, item.modelName));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
      remove.addEventListener('click', async () => { await imageHistory.remove(item.id); await renderImageHistory(elements); setMessage(elements.status, '已删除这张历史图片。', 'success'); });
      actions.append(download, remove); body.append(title, meta, actions); card.append(image, body); elements.grid.append(card);
    });
    setMessage(elements.status, items.length ? `当前浏览器保存了 ${items.length} 张图片。` : '');
  } catch {
    elements.empty.hidden = false; elements.clear.disabled = true;
    setMessage(elements.status, '暂时无法读取本地生图历史。', 'error');
  }
}

async function normalizeImageError(response, fallback = '生图服务暂时不可用，请稍后重试。') {
  let problem = null;
  try {
    problem = await response.json();
  } catch {}
  const error = new Error(typeof problem?.title === 'string' && problem.title.trim() ? problem.title : fallback);
  error.code = typeof problem?.code === 'string' ? problem.code : 'image_request_failed';
  error.status = response.status;
  return error;
}

function imageStudioError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function option(value, label = value) {
  const item = document.createElement('option');
  item.value = String(value);
  item.textContent = label;
  return item;
}

function updateModelControls(elements) {
  const model = imageStudioState.models.find((item) => item.id === elements.model.value) || null;
  if (!model) {
    elements.ratio.replaceChildren();
    elements.count.replaceChildren();
    elements.ratio.disabled = true;
    elements.count.disabled = true;
    elements.submit.disabled = true;
    elements.referenceTrigger.disabled = true;
    elements.referenceInput.disabled = true;
    elements.referenceLabel.textContent = '选择模型后可添加';
    return;
  }
  const priorRatio = elements.ratio.value;
  const priorCount = Number(elements.count.value);
  elements.ratio.replaceChildren(...model.supportedRatios.map((ratio) => option(ratio)));
  elements.ratio.value = model.supportedRatios.includes(priorRatio) ? priorRatio : model.supportedRatios[0];
  const counts = Array.from({ length: model.maxImages }, (_, index) => index + 1);
  elements.count.replaceChildren(...counts.map((count) => option(count, `${count} 张`)));
  elements.count.value = String(counts.includes(priorCount) ? priorCount : 1);
  elements.ratio.disabled = false;
  elements.count.disabled = false;
  elements.submit.disabled = false;
  elements.submit.textContent = '生成图片 ↑';
  elements.referenceTrigger.disabled = !model.supportsReferenceImage;
  elements.referenceInput.disabled = !model.supportsReferenceImage;
  elements.referenceTrigger.title = model.supportsReferenceImage ? '' : '该平台未配置参考图编辑接口';
  elements.referenceLabel.textContent = model.supportsReferenceImage ? '添加参考图' : '此模型不支持参考图';
  if (!model.supportsReferenceImage && elements.referenceInput.files?.length) {
    setMessage(elements.referenceError, '当前模型暂不支持参考图，请切换到已配置编辑接口的平台模型。', 'error');
  }
}

async function loadImageModels(elements) {
  elements.model.disabled = true;
  elements.submit.disabled = true;
  elements.submit.textContent = '正在加载模型…';
  setMessage(elements.status, '正在加载可用模型…');
  try {
    const response = await fetch('/api/v1/image-models', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw await normalizeImageError(response, '暂时无法加载生图模型，请稍后重试。');
    const payload = await response.json();
    const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    imageStudioState.models = items;
    elements.model.replaceChildren();
    if (!items.length) {
      elements.model.append(option('', '暂无可用模型'));
      elements.model.value = '';
      elements.model.disabled = true;
      elements.submit.disabled = true;
      elements.submit.textContent = '管理员尚未配置生图服务';
      setMessage(elements.status, '管理员尚未配置生图服务。');
      updateModelControls(elements);
      return;
    }
    const groups = new Map();
    items.forEach((model) => {
      if (!groups.has(model.providerName)) groups.set(model.providerName, []);
      groups.get(model.providerName).push(model);
    });
    groups.forEach((providerModels, providerName) => {
      const group = document.createElement('optgroup');
      group.label = providerName;
      group.append(...providerModels.map((model) => option(model.id, model.displayName)));
      elements.model.append(group);
    });
    elements.model.value = items.some((model) => model.id === payload.data.defaultModelId) ? payload.data.defaultModelId : items[0].id;
    elements.model.disabled = false;
    setMessage(elements.status, '');
    updateModelControls(elements);
  } catch (error) {
    imageStudioState.models = [];
    elements.model.replaceChildren(option('', '模型不可用'));
    elements.model.value = '';
    elements.model.disabled = true;
    elements.submit.disabled = true;
    elements.submit.textContent = '生图服务暂时不可用';
    const message = error?.code ? error.message : '暂时无法加载生图模型，请稍后重试。';
    setMessage(elements.status, message, 'error');
    updateModelControls(elements);
  }
}

function buildGenerationRequest(elements, settings, signal) {
  const reference = elements.referenceInput.files?.[0];
  if (reference) {
    const body = new FormData();
    body.append('modelRecordId', settings.modelRecordId);
    body.append('prompt', settings.prompt);
    body.append('ratio', settings.ratio);
    body.append('style', settings.style);
    body.append('count', String(settings.count));
    body.append('referenceImage', reference, reference.name);
    return { method: 'POST', body, signal };
  }
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    signal
  };
}

function normalizeGenerationImages(images, settings) {
  if (!Array.isArray(images) || !images.length) throw imageStudioError('生图服务没有返回可用图片。', 'image_result_invalid');
  return images.map((image, index) => {
    const url = new URL(image.url, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/v1/image-generations/')) {
      throw imageStudioError('生图服务返回了无效的图片地址。', 'image_result_invalid');
    }
    return {
      id: image.id,
      src: `${url.pathname}${url.search}`,
      mimeType: image.mimeType,
      ratio: settings.ratio,
      alt: `${settings.modelName} 生成结果 ${index + 1}：${settings.prompt.slice(0, 48)}`
    };
  });
}

async function submitImageGeneration(elements) {
  const prompt = elements.prompt.value.trim();
  if (!prompt) {
    setMessage(elements.promptError, '请先描述你想创作的画面。', 'error');
    elements.prompt.focus();
    return false;
  }
  const model = imageStudioState.models.find((item) => item.id === elements.model.value);
  if (!model) {
    setMessage(elements.status, '所选模型当前不可用，请重新选择。', 'error');
    return false;
  }
  if (elements.referenceInput.files?.length && !model.supportsReferenceImage) {
    const message = '当前模型暂不支持参考图，请切换到已配置编辑接口的平台模型。';
    setMessage(elements.referenceError, message, 'error');
    setMessage(elements.status, message, 'error');
    return false;
  }
  setMessage(elements.promptError, '');
  setMessage(elements.referenceError, '');
  const settings = {
    modelRecordId: model.id,
    modelName: model.displayName,
    prompt,
    ratio: elements.ratio.value,
    style: elements.style.value,
    count: Number(elements.count.value)
  };
  const controller = new AbortController();
  imageStudioState.requestController = controller;
  elements.form.classList.add('is-busy');
  elements.submit.disabled = true;
  elements.model.disabled = true;
  elements.ratio.disabled = true;
  elements.style.disabled = true;
  elements.count.disabled = true;
  elements.results.hidden = true;
  elements.results.classList.remove('has-results');
  setMessage(elements.status, `正在使用 ${model.displayName} 生成图片…`);
  try {
    const requestSettings = {
      modelRecordId: settings.modelRecordId,
      prompt: settings.prompt,
      ratio: settings.ratio,
      style: settings.style,
      count: settings.count
    };
    const response = await fetch('/api/v1/image-generations', buildGenerationRequest(elements, requestSettings, controller.signal));
    if (!response.ok) throw await normalizeImageError(response);
    const payload = await response.json();
    const results = normalizeGenerationImages(payload?.data?.images, settings);
    setMessage(elements.status, '');
    renderResults(elements.results, results, settings, () => submitImageGeneration(elements));
    void saveGeneratedImages(results, settings, elements.status);
    return true;
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '已取消本次生成。'
      : error?.code ? error.message : '生图服务暂时不可用，请稍后重试。';
    if (elements.referenceInput.files?.length && ['image_reference_unsupported', 'image_provider_incompatible', 'invalid_reference_image'].includes(error?.code)) {
      setMessage(elements.referenceError, message, 'error');
      setMessage(elements.status, message, 'error');
    } else setMessage(elements.status, message, 'error');
    return false;
  } finally {
    if (imageStudioState.requestController === controller) imageStudioState.requestController = null;
    elements.form.classList.remove('is-busy');
    elements.model.disabled = false;
    elements.style.disabled = false;
    updateModelControls(elements);
  }
}

function initImageStudio() {
  const elements = {
    form: document.querySelector('#generation-form'),
    prompt: document.querySelector('#prompt-input'),
    promptCount: document.querySelector('#prompt-count'),
    promptError: document.querySelector('#prompt-error'),
    model: document.querySelector('#model-select'),
    ratio: document.querySelector('#ratio-select'),
    style: document.querySelector('#style-select'),
    count: document.querySelector('#count-select'),
    referenceInput: document.querySelector('#reference-input'),
    referenceTrigger: document.querySelector('#reference-trigger'),
    referencePreview: document.querySelector('#reference-preview'),
    referenceError: document.querySelector('#reference-error'),
    referenceLabel: document.querySelector('#reference-label'),
    submit: document.querySelector('#generate-submit'),
    status: document.querySelector('#generation-status'),
    results: document.querySelector('#generation-results'),
    composer: document.querySelector('.generation-composer')
  };
  if (!elements.form) return;
  let referenceUrl = '';

  const clearReference = (clearInput = true) => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    referenceUrl = '';
    if (clearInput) elements.referenceInput.value = '';
    elements.referencePreview.replaceChildren();
    elements.referencePreview.hidden = true;
    elements.composer.classList.remove('has-reference');
  };
  elements.referenceTrigger.addEventListener('click', () => elements.referenceInput.click());
  elements.referenceInput.addEventListener('change', () => {
    const file = elements.referenceInput.files?.[0];
    const validation = validateReferenceFile(file);
    if (!validation.ok) {
      clearReference();
      setMessage(elements.referenceError, validation.message, 'error');
      return;
    }
    clearReference(false);
    setMessage(elements.referenceError, '');
    referenceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = referenceUrl;
    image.alt = '参考图预览';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', '移除参考图');
    remove.textContent = '×';
    remove.addEventListener('click', clearReference);
    elements.referencePreview.append(image, remove);
    elements.referencePreview.hidden = false;
    elements.composer.classList.add('has-reference');
  });
  elements.prompt.addEventListener('input', () => {
    if (elements.prompt.value.length > MAX_PROMPT_LENGTH) elements.prompt.value = elements.prompt.value.slice(0, MAX_PROMPT_LENGTH);
    elements.promptCount.textContent = String(elements.prompt.value.length);
    if (elements.prompt.value.trim()) setMessage(elements.promptError, '');
  });
  document.querySelectorAll('.inspiration-chip').forEach((chip) => chip.addEventListener('click', () => {
    elements.prompt.value = chip.dataset.prompt.slice(0, MAX_PROMPT_LENGTH);
    elements.prompt.dispatchEvent(new Event('input'));
    elements.prompt.focus();
  }));
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!elements.submit.disabled) submitImageGeneration(elements);
  });
  elements.model.addEventListener('change', () => { setMessage(elements.referenceError, ''); updateModelControls(elements); });
  loadImageModels(elements);

  const historyElements = { status: document.querySelector('#history-status'), grid: document.querySelector('#history-grid'), empty: document.querySelector('#history-empty'), clear: document.querySelector('#history-clear') };
  historyElements.clear.addEventListener('click', async () => {
    if (!window.confirm('确定清空当前浏览器中的全部生图历史吗？')) return;
    await imageHistory.clear(); await renderImageHistory(historyElements); setMessage(historyElements.status, '本地生图历史已清空。', 'success');
  });
  const modeButtons = [...document.querySelectorAll('.studio-mode')];
  const panels = [document.querySelector('#generate-panel'), document.querySelector('#history-panel')];
  modeButtons.forEach((button, buttonIndex) => button.addEventListener('click', () => {
    modeButtons.forEach((item, index) => {
      const active = index === buttonIndex;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      panels[index].hidden = !active;
    });
    if (button.id === 'studio-mode-history') void renderImageHistory(historyElements);
    else releaseHistoryUrls();
  }));
  window.addEventListener('pagehide', () => {
    imageStudioState.requestController?.abort();
    clearReference();
    releaseHistoryUrls();
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', initImageStudio);
