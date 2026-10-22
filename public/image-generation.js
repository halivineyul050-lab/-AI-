import { createImageHistory } from './image-generation-history.js';
import { fetchImageJob } from './image-job-request.mjs?v=20261019-1';

let creditsConfig = null;
let studioWallet = null;
let walletRequest = 0;
function updateCreditsEstimate(elements) {
  const target = document.querySelector('#studio-credit-estimate');
  if (!target) return;
  const count = Number(elements.count.value) || 1;
  const unit = creditsConfig?.modelPrices?.[elements.model.value] ?? creditsConfig?.defaultImageCredits;
  target.textContent = unit == null ? '暂时无法读取积分价格，请刷新重试。' : `本次 ${count} 张，预计消耗 ${count * unit} 积分`;
  const balance = document.querySelector('#studio-credit-balance');
  if (balance) balance.textContent = imageStudioState.authStatus !== 'authenticated' ? '登录后可生成图片' : studioWallet ? `可用 ${Math.max(0, studioWallet.balance - (studioWallet.frozen || 0))} 积分 · 冻结 ${studioWallet.frozen || 0} 积分` : '积分余额读取中';
  if (!elements.firstCreation && elements.submit) elements.submit.disabled = true;
  elements.firstCreation?.updateCost(creditsConfig, studioWallet);
}
async function refreshStudioCredits(elements) {
  if (!document.querySelector("#studio-credit-estimate")) return;
  const request = ++walletRequest;
  studioWallet = null;
  updateCreditsEstimate(elements);
  if (imageStudioState.authStatus !== 'authenticated') return;
  try {
    const response = await fetch('/api/v1/account/credits', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('credits');
    const payload = await response.json();
    if (request === walletRequest && imageStudioState.authStatus === 'authenticated') studioWallet = payload.data;
  } catch { /* The server validates balance when submitting. */ }
  if (request === walletRequest) updateCreditsEstimate(elements);
}

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 1000;
const imageStudioState = { models: [], requestController: null, authStatus: 'checking', user: null, accountVersion: 0, authRequest: 0, draft: null };
const cloudHistoryState = { items: [], total: 0, nextCursor: null, requestToken: 0, busy: false, mutating: false };
const DRAFT_KEY = 'nikai-image-studio-draft';
let imageHistory = null;
try { imageHistory = createImageHistory(); } catch { /* Image generation remains available without IndexedDB. */ }
let historyObjectUrls = [];
let historyRenderToken = 0;

function validateReferenceFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file?.type)) return { ok: false, message: '参考图仅支持 PNG、JPEG 或 WebP。' };
  if (file.size > MAX_REFERENCE_BYTES) return { ok: false, message: '参考图不能超过 10MB。' };
  return { ok: true, message: '' };
}

function bindReferencePaste(elements) {
  elements.composer.addEventListener('paste', (event) => {
    const clipboard = event.clipboardData;
    const imageItem = Array.from(clipboard?.items || []).find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile() || Array.from(clipboard?.files || []).find((item) => item.type.startsWith('image/'));
    if (!file) return; // Text still uses the browser's normal paste behavior.
    event.preventDefault();
    if (imageStudioState.requestController) {
      setMessage(elements.referenceError, '正在生成图片，请完成后再更换参考图。', 'error');
      return;
    }
    if (elements.referenceInput.disabled) {
      setMessage(elements.referenceError, '请先选择支持参考图的模型，再粘贴图片。', 'error');
      return;
    }
    const validation = validateReferenceFile(file);
    if (!validation.ok) {
      setMessage(elements.referenceError, validation.message, 'error');
      return;
    }
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      elements.referenceInput.files = transfer.files;
      elements.referenceInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      setMessage(elements.referenceError, '无法添加剪贴板图片，请使用选择文件添加参考图。', 'error');
    }
  });
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

function openImagePreview(elements, src, alt) {
  elements.previewImage.src = src;
  elements.previewImage.alt = alt || '生成图片预览';
  if (!elements.previewDialog.open) elements.previewDialog.showModal();
}

function renderReferencePreview(elements, src, onRemove) {
  const image = new Image();
  image.src = src;
  image.alt = '参考图预览';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'reference-preview-open';
  preview.setAttribute('aria-label', '查看完整参考图');
  preview.title = '点击查看完整参考图';
  preview.append(image);
  preview.addEventListener('click', () => openImagePreview(elements, src, '参考图预览'));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'reference-remove';
  remove.setAttribute('aria-label', '移除参考图');
  remove.textContent = '×';
  remove.addEventListener('click', onRemove);
  elements.referencePreview.replaceChildren(preview, remove);
  elements.referencePreview.hidden = false;
  elements.composer.classList.add('has-reference');
}

function configureImagePreview(elements) {
  elements.previewClose.addEventListener('click', () => elements.previewDialog.close());
  elements.previewDialog.addEventListener('close', () => {
    elements.previewImage.removeAttribute('src');
    elements.previewImage.alt = '';
  });
  elements.previewDialog.addEventListener('click', (event) => {
    if (event.target === elements.previewDialog) elements.previewDialog.close();
  });
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
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'result-preview-button';
    preview.setAttribute('aria-label', `点击预览：${result.alt}`);
    const image = new Image();
    image.src = result.src;
    image.alt = result.alt;
    preview.append(image);
    preview.addEventListener('click', () => openImagePreview(container.previewElements, result.src, result.alt));
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = settings.modelName;
    visual.append(preview, badge);
    const footer = document.createElement('footer');
    const caption = document.createElement('span');
    caption.textContent = settings.prompt;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = '下载';
    download.addEventListener('click', () => { container.previewElements?.firstCreation?.download(result); downloadResult(result, settings.modelName); });
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

async function renderImageHistory(elements) {
  const renderToken = ++historyRenderToken;
  releaseHistoryUrls();
  elements.grid.replaceChildren();
  elements.empty.hidden = true;
  elements.clear.disabled = true;
  setMessage(elements.status, '正在读取已有历史…');
  if (!imageHistory) {
    elements.empty.hidden = false;
    setMessage(elements.status, '无法读取之前保存的历史；生图与下载功能仍可使用。', 'error');
    return;
  }
  try {
    const items = await imageHistory.list();
    if (renderToken !== historyRenderToken) return;
    releaseHistoryUrls();
    const cards = [];
    elements.empty.hidden = items.length > 0;
    elements.clear.disabled = items.length === 0;
    items.forEach((item) => {
      const url = URL.createObjectURL(item.blob);
      historyObjectUrls.push(url);
      const card = document.createElement('article'); card.className = 'history-card';
      const image = new Image(); image.src = url; image.alt = `${item.modelName}：${item.prompt.slice(0, 48)}`; image.style.setProperty('--history-ratio', ratioCss(item.ratio));
      const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'history-preview-button'; preview.setAttribute('aria-label', `点击预览：${image.alt}`);
      const promptOverlay = document.createElement('span'); promptOverlay.className = 'history-prompt-overlay'; promptOverlay.textContent = item.prompt || '未填写提示词';
      preview.append(image, promptOverlay);
      preview.addEventListener('click', () => openImagePreview(elements.previewElements, url, image.alt));
      const body = document.createElement('div'); body.className = 'history-card-body';
      const title = document.createElement('h3'); title.textContent = item.prompt || '未命名作品';
      const meta = document.createElement('p'); meta.className = 'history-card-meta'; meta.textContent = `${item.modelName} · ${item.style} · ${item.ratio} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`;
      const actions = document.createElement('div'); actions.className = 'history-card-actions';
      const download = document.createElement('button'); download.type = 'button'; download.textContent = '下载';
      download.addEventListener('click', () => downloadResult({ id: item.id, src: url, mimeType: item.mimeType }, item.modelName));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
      remove.addEventListener('click', async () => {
        try { await imageHistory.remove(item.id); await renderImageHistory(elements); setMessage(elements.status, '已删除这张历史图片。', 'success'); }
        catch { setMessage(elements.status, '删除历史图片失败，请稍后重试。', 'error'); }
      });
      actions.append(download, remove); body.append(title, meta, actions); card.append(preview, body); cards.push(card);
    });
    elements.grid.replaceChildren(...cards);
    setMessage(elements.status, items.length ? `旧本机记录：${items.length} 张图片。仅此浏览器可见，未上传云端。` : '');
  } catch {
    if (renderToken !== historyRenderToken) return;
    releaseHistoryUrls();
    elements.grid.replaceChildren();
    elements.empty.hidden = false; elements.clear.disabled = true;
    setMessage(elements.status, '暂时无法读取之前保存的生图历史。', 'error');
  }
}

function updateAccountNotice(elements) {
  const signedIn = imageStudioState.authStatus === 'authenticated';
  elements.accountLogin.hidden = signedIn || imageStudioState.authStatus === 'checking';
  elements.accountRetry.hidden = imageStudioState.authStatus !== 'error';
  elements.accountText.textContent = signedIn
    ? '新生成的图片会自动保存到当前账号，跨设备可查看，保留至你手动删除。'
    : imageStudioState.authStatus === 'checking' ? '正在确认登录状态…'
      : imageStudioState.authStatus === 'error' ? '暂时无法确认登录状态，请重试。已填写的创作内容会保留。'
        : '登录后即可生成图片并自动保存到账号云历史，跨设备查看。已填写的创作内容会保留。';
}

function clearAccountImages(elements) {
  ++cloudHistoryState.requestToken;
  cloudHistoryState.items = [];
  cloudHistoryState.total = 0;
  cloudHistoryState.nextCursor = null;
  cloudHistoryState.busy = false;
  cloudHistoryState.mutating = false;
  elements.results.replaceChildren();
  elements.results.hidden = true;
  elements.results.classList.remove('has-results');
  elements.previewDialog.close();
  elements.previewImage.removeAttribute('src');
  if (elements.cloud) drawCloudHistory(elements.cloud);
}

function setStudioAccount(elements, user, status = user ? 'authenticated' : 'anonymous') {
  if (String(imageStudioState.user?.id || '') !== String(user?.id || '') || status !== 'authenticated') {
    ++imageStudioState.accountVersion;
    imageStudioState.requestController?.abort();
    clearAccountImages(elements);
  }
  imageStudioState.user = user;
  imageStudioState.authStatus = status;
  void elements.firstCreation?.onAccountChanged();
  void refreshStudioCredits(elements);
  updateAccountNotice(elements);
  updateModelControls(elements);
  if (elements.cloud) drawCloudHistory(elements.cloud);
}

async function loadStudioAccount(elements) {
  const request = ++imageStudioState.authRequest;
  imageStudioState.authStatus = 'checking';
  updateAccountNotice(elements);
  updateModelControls(elements);
  try {
    const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (request !== imageStudioState.authRequest) return false;
    if (response.status === 401) { setStudioAccount(elements, null); return false; }
    if (!response.ok) throw await normalizeImageError(response);
    const payload = await response.json();
    if (request !== imageStudioState.authRequest) return false;
    if (!payload?.data?.user?.id) throw new Error('Invalid account');
    setStudioAccount(elements, payload.data.user);
    return true;
  } catch {
    if (request === imageStudioState.authRequest) setStudioAccount(elements, null, 'error');
    return false;
  }
}

function saveStudioDraft(elements) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ prompt: elements.prompt.value, model: elements.model.value, ratio: elements.ratio.value, style: elements.style.value, count: elements.count.value, caseId: elements.firstCreation?.selectedCaseId || null, hadReference: Boolean(elements.referenceInput.files?.length) }));
  } catch { /* The current form remains available if session storage is unavailable. */ }
}

function restoreStudioDraft(elements) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    sessionStorage.removeItem(DRAFT_KEY);
    if (!draft || typeof draft.prompt !== 'string') return;
    imageStudioState.draft = draft;
    elements.prompt.value = draft.prompt.slice(0, MAX_PROMPT_LENGTH);
    elements.promptCount.textContent = String(elements.prompt.value.length);
    if (['自动', '电影感', '插画', '3D', '写实', '国风'].includes(draft.style)) elements.style.value = draft.style;
    if (draft.hadReference) setMessage(elements.referenceError, '创作描述已恢复，请重新选择参考图。');
  } catch { /* An unavailable or invalid draft does not prevent creation. */ }
}

function cloudImageUrl(value) {
  const url = new URL(value, location.origin);
  if (url.origin !== location.origin || !/^\/api\/v1\/image-history\/[^/]+\/image$/.test(url.pathname)) throw imageStudioError('云历史返回了无效的图片地址。', 'image_result_invalid');
  return `${url.pathname}${url.search}`;
}

function drawCloudHistory(elements) {
  const signedIn = imageStudioState.authStatus === 'authenticated';
  elements.grid.replaceChildren();
  elements.login.hidden = signedIn || imageStudioState.authStatus === 'checking';
  elements.empty.hidden = !signedIn || cloudHistoryState.busy || cloudHistoryState.items.length > 0;
  elements.clear.disabled = !signedIn || cloudHistoryState.busy || cloudHistoryState.mutating || !cloudHistoryState.total;
  elements.more.hidden = !signedIn || !cloudHistoryState.nextCursor;
  elements.more.disabled = cloudHistoryState.busy || cloudHistoryState.mutating;
  elements.total.textContent = signedIn ? `共 ${cloudHistoryState.total} 张` : '';
  if (!signedIn) {
    setMessage(elements.status, imageStudioState.authStatus === 'checking' ? '正在确认登录状态…' : imageStudioState.authStatus === 'error' ? '无法读取云历史，请重试登录状态检查。' : '登录后查看当前账号的云历史。');
    return;
  }
  const version = imageStudioState.accountVersion;
  cloudHistoryState.items.forEach((item) => {
    const card = document.createElement('article'); card.className = 'history-card';
    const image = new Image(); image.src = item.url; image.alt = `${item.modelName}：${item.prompt.slice(0, 48)}`; image.loading = 'lazy'; image.style.setProperty('--history-ratio', ratioCss(item.ratio));
    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'history-preview-button'; preview.setAttribute('aria-label', `点击预览：${image.alt}`);
    const promptOverlay = document.createElement('span'); promptOverlay.className = 'history-prompt-overlay'; promptOverlay.textContent = item.prompt || '未填写提示词';
    preview.append(image, promptOverlay);
    preview.addEventListener('click', () => { if (version === imageStudioState.accountVersion) openImagePreview(elements.studio, item.url, image.alt); });
    const body = document.createElement('div'); body.className = 'history-card-body';
    const title = document.createElement('h3'); title.textContent = item.prompt || '未命名作品';
    const meta = document.createElement('p'); meta.className = 'history-card-meta'; meta.textContent = `${item.modelName} · ${item.style} · ${item.ratio} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`;
    const actions = document.createElement('div'); actions.className = 'history-card-actions';
    const download = document.createElement('button'); download.type = 'button'; download.textContent = '下载';
    download.addEventListener('click', () => { if (version === imageStudioState.accountVersion) downloadResult({ id: item.id, src: item.url, mimeType: item.mimeType }, item.modelName); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除'; remove.disabled = cloudHistoryState.mutating;
    remove.addEventListener('click', () => { if (version === imageStudioState.accountVersion) return deleteCloudHistory(elements, item.id); });
    actions.append(download, remove); body.append(title, meta, actions); card.append(preview, body); elements.grid.append(card);
  });
}

async function renderCloudHistory(elements, append = false) {
  if (imageStudioState.authStatus !== 'authenticated') { drawCloudHistory(elements); return; }
  if (cloudHistoryState.mutating || (append && (cloudHistoryState.busy || !cloudHistoryState.nextCursor))) return;
  const version = imageStudioState.accountVersion;
  const token = ++cloudHistoryState.requestToken;
  const cursor = append ? cloudHistoryState.nextCursor : null;
  if (!append) { cloudHistoryState.items = []; cloudHistoryState.total = 0; cloudHistoryState.nextCursor = null; }
  cloudHistoryState.busy = true;
  drawCloudHistory(elements);
  setMessage(elements.status, append ? '正在加载更多…' : '正在读取账号云历史…');
  try {
    const response = await fetch(`/api/v1/image-history?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (token !== cloudHistoryState.requestToken || version !== imageStudioState.accountVersion) return;
    if (response.status === 401) { setStudioAccount(elements.studio, null); return; }
    if (!response.ok) throw await normalizeImageError(response, '暂时无法读取云历史，请重试。');
    const payload = await response.json();
    if (token !== cloudHistoryState.requestToken || version !== imageStudioState.accountVersion) return;
    if (!Array.isArray(payload?.data?.items)) throw new Error('Invalid history');
    const items = payload.data.items.map((item) => ({ ...item, url: cloudImageUrl(item.url) }));
    const known = new Set(cloudHistoryState.items.map((item) => item.id));
    cloudHistoryState.items.push(...items.filter((item) => !known.has(item.id)));
    cloudHistoryState.total = Number(payload.data.total) || 0;
    cloudHistoryState.nextCursor = payload.data.nextCursor || null;
    setMessage(elements.status, cloudHistoryState.total ? `已显示 ${cloudHistoryState.items.length} / ${cloudHistoryState.total} 张，保留至你手动删除。` : '');
  } catch (error) {
    if (token !== cloudHistoryState.requestToken || version !== imageStudioState.accountVersion) return;
    setMessage(elements.status, error?.code ? error.message : '暂时无法读取云历史，请重试。', 'error');
  } finally {
    if (token === cloudHistoryState.requestToken && version === imageStudioState.accountVersion) { cloudHistoryState.busy = false; drawCloudHistory(elements); }
  }
}

async function deleteCloudHistory(elements, id = null) {
  if (cloudHistoryState.mutating || imageStudioState.authStatus !== 'authenticated') return;
  if (!window.confirm(id ? '确定删除这张账号云历史图片吗？' : '确定清空当前账号的全部云历史吗？删除后所有设备都将无法查看。')) return;
  const version = imageStudioState.accountVersion;
  cloudHistoryState.mutating = true;
  ++cloudHistoryState.requestToken;
  cloudHistoryState.busy = false;
  drawCloudHistory(elements);
  try {
    if (!await loadStudioAccount(elements.studio) || version !== imageStudioState.accountVersion) return;
    const response = await fetch(`/api/v1/image-history${id ? `/${encodeURIComponent(id)}` : ''}`, { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (version !== imageStudioState.accountVersion) return;
    if (response.status === 401) { setStudioAccount(elements.studio, null); return; }
    if (!response.ok) throw await normalizeImageError(response, '删除云历史失败，请重试。');
    cloudHistoryState.mutating = false;
    await renderCloudHistory(elements);
    if (version === imageStudioState.accountVersion) setMessage(elements.status, id ? '已删除这张云历史图片。' : '当前账号的云历史已清空。', 'success');
  } catch (error) {
    if (version === imageStudioState.accountVersion) setMessage(elements.status, error?.code ? error.message : '删除云历史失败，请重试。', 'error');
  } finally {
    if (version === imageStudioState.accountVersion) { cloudHistoryState.mutating = false; drawCloudHistory(elements); }
  }
}

async function normalizeImageError(response, fallback = '生图服务暂时不可用，请稍后重试。') {
  let problem = null;
  try {
    problem = await response.json();
  } catch {}
  const timeoutMessage = '生成等待超时，请先查看账号云历史，避免重复生成。';
  const error = new Error(typeof problem?.title === 'string' && problem.title.trim() ? problem.title : response.status === 504 ? timeoutMessage : fallback);
  error.code = typeof problem?.code === 'string' ? problem.code : 'image_request_failed';
  error.status = response.status;
  error.settlement = problem?.details?.settlement || null;
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
  updateCreditsEstimate(elements);
  elements.referenceTrigger.disabled = !model.supportsReferenceImage;
  elements.referenceInput.disabled = !model.supportsReferenceImage;
  elements.referenceTrigger.title = model.supportsReferenceImage ? '选择文件，或在描述框中按 Ctrl+V 粘贴图片' : '该平台未配置参考图编辑接口';
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
    const preferred = imageStudioState.draft?.model || payload.data.defaultModelId;
    elements.model.value = items.some((model) => model.id === preferred) ? preferred : items[0].id;
    elements.model.disabled = false;
    setMessage(elements.status, '');
    updateModelControls(elements);
    if (imageStudioState.draft) {
      const draft = imageStudioState.draft;
      const model = items.find(m => m.id === elements.model.value);
      if (model.supportedRatios.includes(draft.ratio)) elements.ratio.value = draft.ratio;
      if (Number(draft.count) >= 1 && Number(draft.count) <= model.maxImages) elements.count.value = String(draft.count);
      updateCreditsEstimate(elements);
    }
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
    if (url.origin !== location.origin || !(/^\/api\/v1\/image-generations\//.test(url.pathname) || /^\/api\/v1\/image-history\/[0-9a-f-]{36}\/image$/.test(url.pathname))) {
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
  if (imageStudioState.requestController) return false;
  if (imageStudioState.authStatus !== 'authenticated') {
    saveStudioDraft(elements);
    setMessage(elements.status, '请先登录，图片会自动保存到你的账号云历史。', 'error');
    elements.accountLogin.focus();
    return false;
  }
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
  if (elements.firstCreation && !elements.firstCreation.beforeSubmit()) return false;
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
  elements.firstCreation?.started();
  const accountVersion = imageStudioState.accountVersion;
  try {
    const requestSettings = {
      modelRecordId: settings.modelRecordId,
      prompt: settings.prompt,
      ratio: settings.ratio,
      style: settings.style,
      count: settings.count
    };
    const version = imageStudioState.accountVersion;
    const request = buildGenerationRequest(elements, requestSettings, controller.signal);
    let response = await fetchImageJob('/api/v1/image-generations', { ...request, headers: { ...request.headers, Prefer: 'respond-async', ...(globalThis.crypto?.randomUUID ? { 'Idempotency-Key': globalThis.crypto.randomUUID() } : {}) }, credentials: 'same-origin' });
    if (version !== imageStudioState.accountVersion) return false;
    if (response.status === 202) {
      const accepted = await response.json();
      if (version !== imageStudioState.accountVersion) return false;
      const jobId = accepted?.data?.jobId;
      if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/.test(jobId)) throw imageStudioError('生成任务返回无效，请先查看账号云历史。', 'image_result_invalid');
      elements.firstCreation?.rememberJob(jobId, accepted.data.reservedCredits);
      const deadline = Date.now() + 810000;
      do {
        await new Promise((resolve, reject) => {
          const abort = () => { window.clearTimeout(timer); reject(imageStudioError('已停止等待，任务可能仍在生成，请查询原任务或查看云历史。', 'image_wait_cancelled')); };
          if (controller.signal.aborted) { reject(imageStudioError('已停止等待，任务可能仍在生成，请查询原任务或查看云历史。', 'image_wait_cancelled')); return; }
          const timer = window.setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 2000);
          controller.signal.addEventListener('abort', abort, { once: true });
        });
        response = await fetchImageJob(`/api/v1/image-generation-jobs/${jobId}`, { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (Date.now() >= deadline && response.status === 202) throw imageStudioError('生成等待超时，请先查看账号云历史，避免重复生成。', 'image_wait_timeout');
      } while (response.status === 202);
    }
    if (response.status === 401) { saveStudioDraft(elements); setStudioAccount(elements, null); throw await normalizeImageError(response, '请先登录后生成图片。'); }
    if (!response.ok) throw await normalizeImageError(response);
    const payload = await response.json();
    if (version !== imageStudioState.accountVersion) return false;
    const results = normalizeGenerationImages(payload?.data?.images, settings);
    setMessage(elements.status, payload?.data?.historySaved ? '图片已保存到账号云历史，可在历史页查看。' : (payload?.data?.warning || '图片保存失败，请现在下载。'), payload?.data?.historySaved ? 'success' : 'error');
    elements.results.previewElements = elements;
    renderResults(elements.results, results, settings, () => submitImageGeneration(elements));
    elements.firstCreation?.success(payload.data);
    if (payload?.data?.historySaved && elements.cloud) void renderCloudHistory(elements.cloud);
    return true;
  } catch (error) {
    if (accountVersion !== imageStudioState.accountVersion) return false;
    const message = error?.name === 'AbortError'
      ? '已停止等待，任务可能仍在生成，请查询原任务或查看云历史。'
      : error?.code ? error.message : '网络连接中断，请先查看账号云历史，避免重复生成。';
    if (elements.referenceInput.files?.length && ['image_reference_unsupported', 'image_provider_incompatible', 'invalid_reference_image'].includes(error?.code)) {
      setMessage(elements.referenceError, message, 'error');
      setMessage(elements.status, message, 'error');
    } else setMessage(elements.status, error?.code === 'credit_insufficient' ? '积分不足，请前往积分账户兑换或充值后再生成。' : message, 'error');
    elements.firstCreation?.failure(error);
    return false;
  } finally {
    if (imageStudioState.requestController === controller) imageStudioState.requestController = null;
    void refreshStudioCredits(elements);
    elements.form.classList.remove('is-busy');
    elements.model.disabled = false;
    elements.style.disabled = false;
    updateModelControls(elements);
    if (accountVersion === imageStudioState.accountVersion) elements.firstCreation?.finished();
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
    previewDialog: document.querySelector('#image-preview-dialog'),
    previewImage: document.querySelector('#image-preview-image'),
    previewClose: document.querySelector('.image-preview-close'),
    composer: document.querySelector('.generation-composer')
  };
  if (!elements.form) return;
  elements.accountText = document.querySelector('#studio-account-text');
  elements.accountLogin = document.querySelector('#studio-account-login');
  elements.accountRetry = document.querySelector('#studio-account-retry');
  elements.accountLogin.addEventListener('click', () => { saveStudioDraft(elements); });
  elements.accountRetry.addEventListener('click', () => { void loadStudioAccount(elements); });
  restoreStudioDraft(elements);
  elements.results.previewElements = elements;
  let referenceUrl = '';

  const clearReference = (clearInput = true) => {
    if (referenceUrl && elements.previewDialog.open && elements.previewImage.getAttribute('src') === referenceUrl) elements.previewDialog.close();
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    referenceUrl = '';
    if (clearInput) elements.referenceInput.value = '';
    elements.referencePreview.replaceChildren();
    elements.referencePreview.hidden = true;
    elements.composer.classList.remove('has-reference');
  };
  bindReferencePaste(elements);
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
    renderReferencePreview(elements, referenceUrl, clearReference);
  });
  elements.prompt.addEventListener('input', () => {
    if (elements.prompt.value.length > MAX_PROMPT_LENGTH) elements.prompt.value = elements.prompt.value.slice(0, MAX_PROMPT_LENGTH);
    elements.promptCount.textContent = String(elements.prompt.value.length);
    if (elements.prompt.value.trim()) setMessage(elements.promptError, '');
  });
  document.querySelectorAll('.inspiration-chip').forEach((chip) => chip.addEventListener('click', () => {
    if (imageStudioState.requestController) return;
    if (elements.prompt.value.trim() && !window.confirm('使用快捷提示词会替换当前描述，是否继续？')) return;
    elements.firstCreation?.restoreCase(null);
    elements.prompt.value = chip.dataset.prompt.slice(0, MAX_PROMPT_LENGTH);
    elements.prompt.dispatchEvent(new Event('input'));
    elements.prompt.focus();
  }));
  elements.count.addEventListener('change', () => updateCreditsEstimate(elements));
  fetch('/api/v1/credits/config', { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } }).then(response => { if (!response.ok) throw new Error('credits'); return response.json(); }).then(payload => { creditsConfig = payload.data; updateCreditsEstimate(elements); }).catch(() => updateCreditsEstimate(elements));
  document.querySelector('#creation-price-retry')?.addEventListener('click', async () => {
    try { const response = await fetch('/api/v1/credits/config', { signal: AbortSignal.timeout(20000), cache: 'no-store' }); if (!response.ok) throw new Error('credits'); creditsConfig = (await response.json()).data; } catch { creditsConfig = null; }
    await refreshStudioCredits(elements);
  });
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!elements.submit.disabled) submitImageGeneration(elements);
  });
  elements.model.addEventListener('change', () => { setMessage(elements.referenceError, ''); updateModelControls(elements); });
  void loadImageModels(elements).then(() => updateCreditsEstimate(elements));

  const historyElements = { status: document.querySelector('#history-status'), grid: document.querySelector('#history-grid'), empty: document.querySelector('#history-empty'), clear: document.querySelector('#history-clear') };
  const cloudElements = { studio: elements, status: document.querySelector('#cloud-history-status'), grid: document.querySelector('#cloud-history-grid'), empty: document.querySelector('#cloud-history-empty'), clear: document.querySelector('#cloud-history-clear'), more: document.querySelector('#cloud-history-more'), total: document.querySelector('#cloud-history-total'), login: document.querySelector('#cloud-history-login') };
  elements.cloud = cloudElements;
  cloudElements.clear.addEventListener('click', () => { void deleteCloudHistory(cloudElements); });
  cloudElements.more.addEventListener('click', () => { void renderCloudHistory(cloudElements, true); });
  void loadStudioAccount(elements);
  historyElements.previewElements = elements;
  configureImagePreview(elements);
  historyElements.clear.addEventListener('click', async () => {
    if (!window.confirm('确定清空当前浏览器中的全部生图历史吗？')) return;
    if (!imageHistory) return;
    try { await imageHistory.clear(); await renderImageHistory(historyElements); setMessage(historyElements.status, '之前保存的本地历史已清空。', 'success'); }
    catch { setMessage(historyElements.status, '清空历史失败，请稍后重试。', 'error'); }
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
    if (button.id === 'studio-mode-history') { void renderCloudHistory(cloudElements); void renderImageHistory(historyElements); }
    else releaseHistoryUrls();
  }));
  window.addEventListener('pagehide', () => {
    imageStudioState.requestController?.abort();
    clearReference();
    releaseHistoryUrls();
  }, { once: true });
  void import('./first-creation.js?v=20261019-1').then(({ createFirstCreation }) => {
    elements.firstCreation = createFirstCreation(elements, imageStudioState, {
      updateModelControls, saveDraft: saveStudioDraft, refreshCredits: refreshStudioCredits, normalizeError: normalizeImageError,
      renderRecovered(data, settings) {
        const results = normalizeGenerationImages(data.images, settings);
        renderResults(elements.results, results, settings, () => submitImageGeneration(elements));
        setMessage(elements.status, data.historySaved ? '图片已保存到账号云历史，可在历史页查看。' : (data.warning || '请现在下载图片。'), data.historySaved ? 'success' : 'error');
        if (data.historySaved && elements.cloud) void renderCloudHistory(elements.cloud);
      }
    });
    if (imageStudioState.draft?.caseId) elements.firstCreation.restoreCase(imageStudioState.draft.caseId);
    updateCreditsEstimate(elements);
    void elements.firstCreation.onAccountChanged();
  }).catch(() => { setMessage(elements.status, '案例引导暂时无法加载，请刷新页面后再试。', 'error'); elements.submit.disabled = true; });
}

document.addEventListener('DOMContentLoaded', initImageStudio);
