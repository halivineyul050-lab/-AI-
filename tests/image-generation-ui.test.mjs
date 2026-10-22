import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fetchImageJob } from '../public/image-job-request.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    async json() { return status >= 200 && status < 300 ? { data } : data; },
    async blob() { return new Blob([data], { type: 'image/png' }); }
  };
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
    else this.values.delete(value);
  }
  contains(value) { return this.values.has(value); }
}

function element(tagName = 'div') {
  const listeners = new Map();
  const node = {
    tagName: tagName.toUpperCase(), children: [], dataset: {}, style: { setProperty(name, value) { this[name] = value; } },
    classList: new FakeClassList(), className: '', textContent: '', value: '', hidden: false, disabled: false,
    files: [], href: '', download: '', alt: '', src: '', type: '', label: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; }, showModal() { this.open = true; }, close() { this.open = false; listeners.get('close')?.({ target: this }); },
    remove() {}, focus() {}, scrollIntoView() {},
    click() { listeners.get('click')?.({ preventDefault() {} }); },
    dispatch(type, event = {}) { return listeners.get(type)?.({ target: this, preventDefault() {}, ...event }); },
    querySelector(selector) {
      if (selector === 'strong') return this.children.find((child) => child.tagName === 'STRONG') || null;
      return null;
    }
  };
  Object.defineProperty(node, 'options', {
    get() {
      return this.children.flatMap((child) => child.tagName === 'OPTGROUP' ? child.children : child.tagName === 'OPTION' ? [child] : []);
    }
  });
  return node;
}

function createHarness(fetchImpl, history = { async addMany() {}, async list() { return []; }, async remove() {}, async clear() {} }) {
  const createdLinks = [];
  const selectors = new Map();
  const document = {
    body: { append(node) { if (node.tagName === 'A') createdLinks.push(node); } },
    createElement(tagName) { return element(tagName); },
    querySelector(selector) { return selectors.get(selector) || null; }, querySelectorAll() { return []; }, addEventListener() {}
  };
  class FakeImage {
    constructor() { Object.assign(this, element('img')); }
    async decode() {}
  }
  const context = {
    document, window: { addEventListener() {}, setTimeout(callback) { callback(); return 1; } },
    fetch: fetchImpl, fetchImageJob: (url, options) => fetchImageJob(url, options, { fetchImpl }), AbortController, FormData, Blob, URL, Image: FakeImage,
    Event: class { constructor(type) { this.type = type; } },
    DataTransfer: class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } },
    location: { origin: 'https://ontimo.cn' }, matchMedia: () => ({ matches: true }),
    console, Date, Math, Number, String, Set, Map
  };
  context.globalThis = context;
  let source = readFileSync('public/image-generation.js', 'utf8').replace(/\r\n/g, '\n');
  source = source.replace(/^import .*image-generation-history\.js.*\r?\n/, '');
  source = source.replace(/^import .*image-job-request\.mjs.*\r?\n/m, '');
  source = source.replace(
    'let imageHistory = null;\ntry { imageHistory = createImageHistory(); } catch { /* Image generation remains available without IndexedDB. */ }',
    'const imageHistory = globalThis.__history;'
  );
  source = source.replace(
    "document.addEventListener('DOMContentLoaded', initImageStudio);",
    'globalThis.__imageStudioTest = { imageStudioState, validateReferenceFile, bindReferencePaste, renderReferencePreview, loadImageModels, updateModelControls, buildGenerationRequest, submitImageGeneration, renderResults, openImagePreview, configureImagePreview, normalizeImageError, renderImageHistory };'
  );
  context.__history = history;
  vm.runInNewContext(source, context, { filename: 'image-generation.js' });
  context.__imageStudioTest.imageStudioState.authStatus = 'authenticated';
  return { ...context.__imageStudioTest, createdLinks, document, selectors };
}

function studioElements() {
  const form = element('form');
  return {
    form, composer: form, prompt: element('textarea'), promptError: element('p'),
    model: element('select'), ratio: element('select'), style: element('select'), count: element('select'),
    referenceInput: element('input'), referenceTrigger: element('button'), referenceError: element('p'), referenceLabel: element('span'), submit: element('button'),
    status: element('div'), results: element('section'), previewDialog: element('dialog'), previewImage: element('img')
  };
}

const models = [
  { id: 'm-first', displayName: '方图模型', providerName: '平台甲', supportedRatios: ['1:1'], maxImages: 1, supportsReferenceImage: true },
  { id: 'm-default', displayName: '海报模型', providerName: '平台乙', supportedRatios: ['16:9', '9:16'], maxImages: 3, supportsReferenceImage: true }
];

test('model loading groups providers, selects the server default, and constrains ratio and count', async () => {
  const pending = deferred();
  const calls = [];
  const harness = createHarness((...args) => { calls.push(args); return pending.promise; });
  const elements = studioElements();
  const loading = harness.loadImageModels(elements);

  assert.equal(elements.model.disabled, true);
  assert.equal(elements.submit.disabled, true);
  assert.match(elements.submit.textContent, /加载/);

  pending.resolve(response({ items: models, defaultModelId: 'm-default' }));
  await loading;
  assert.equal(calls[0][0], '/api/v1/image-models');
  assert.equal(elements.model.children.length, 2);
  assert.deepEqual(elements.model.children.map((group) => group.label), ['平台甲', '平台乙']);
  assert.equal(elements.model.value, 'm-default');
  assert.deepEqual(elements.ratio.options.map((option) => option.value), ['16:9', '9:16']);
  assert.deepEqual(elements.count.options.map((option) => option.value), ['1', '2', '3']);
  assert.equal(elements.submit.disabled, false);

  elements.model.value = 'm-first';
  harness.updateModelControls(elements);
  assert.deepEqual(elements.ratio.options.map((option) => option.value), ['1:1']);
  assert.deepEqual(elements.count.options.map((option) => option.value), ['1']);
});

test('empty and failed model lists keep generation unavailable with a clear state', async () => {
  const emptyHarness = createHarness(async () => response({ items: [], defaultModelId: null }));
  const empty = studioElements();
  await emptyHarness.loadImageModels(empty);
  assert.equal(empty.submit.disabled, true);
  assert.equal(empty.submit.textContent, '管理员尚未配置生图服务');
  assert.match(empty.status.textContent, /管理员尚未配置/);

  const failedHarness = createHarness(async () => response({ code: 'image_models_unavailable', title: '模型服务暂时不可用' }, 503));
  const failed = studioElements();
  await failedHarness.loadImageModels(failed);
  assert.equal(failed.submit.disabled, true);
  assert.match(failed.status.textContent, /模型服务暂时不可用/);

  const offlineHarness = createHarness(async () => { throw new TypeError('Failed to fetch'); });
  const offline = studioElements();
  await offlineHarness.loadImageModels(offline);
  assert.equal(offline.status.textContent, '暂时无法加载生图模型，请稍后重试。');
});

test('normal generation posts JSON and renders server images with model-aware labels and downloads', async () => {
  const calls = [];
  const harness = createHarness(async (...args) => {
    calls.push(args);
    return response({ generationId: 'g1', images: [{ id: 'i1', mimeType: 'image/png', expiresAt: '2026-09-20T12:00:00.000Z', url: '/api/v1/image-generations/g1/images/i1' }] });
  });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-default'; elements.ratio.value = '16:9'; elements.style.value = '电影感'; elements.count.value = '2';
  elements.prompt.value = '紫色海边电影海报';

  await harness.submitImageGeneration(elements);

  assert.equal(calls[0][0], '/api/v1/image-generations');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    modelRecordId: 'm-default', prompt: '紫色海边电影海报', ratio: '16:9', style: '电影感', count: 2
  });
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(elements.results.hidden, false);
  const card = elements.results.children[1];
  const previewButton = card.children[0].children[0];
  const image = previewButton.children[0];
  const badge = card.children[0].children[1];
  assert.equal(previewButton.tagName, 'BUTTON');
  assert.match(previewButton['aria-label'], /点击预览/);
  assert.equal(image.src, '/api/v1/image-generations/g1/images/i1');
  assert.match(image.alt, /海报模型/);
  assert.equal(badge.textContent, '海报模型');
  assert.doesNotMatch(elements.results.textContent, /演示/);
  previewButton.click();
  assert.equal(elements.previewDialog.open, true);
  assert.equal(elements.previewImage.src, image.src);
  assert.equal(elements.previewImage.alt, image.alt);

  const downloadButton = card.children[1].children[1].children[0];
  downloadButton.click();
  assert.match(harness.createdLinks[0].download, /海报模型/);
  assert.match(harness.createdLinks[0].download, /\.png$/);
});

test('image preview dialog closes with its close action and clears the previous image', () => {
  const harness = createHarness(async () => response({}));
  const dialog = element('dialog');
  const image = element('img');
  const elements = { previewDialog: dialog, previewImage: image, previewClose: element('button') };
  harness.configureImagePreview(elements);
  harness.openImagePreview(elements, '/generated.png', '生成图片预览');
  assert.equal(dialog.open, true);
  assert.equal(image.src, '/generated.png');
  assert.equal(image.alt, '生成图片预览');
  dialog.close();
  assert.equal(image.src, undefined);
  assert.equal(image.alt, '');
});

test('successful generation displays images without saving new images to local history', async () => {
  let historyWrites = 0;
  let imageFetches = 0;
  let generated = false;
  const history = { async addMany() { historyWrites += 1; }, async list() { return []; }, async remove() {}, async clear() {} };
  const harness = createHarness(async (path) => {
    if (path === '/api/v1/image-generations') {
      generated = true;
      return response({ generationId: 'g1', images: [{ id: 'i1', mimeType: 'image/png', url: '/api/v1/image-generations/g1/images/i1' }] });
    }
    imageFetches += 1;
    assert.equal(generated, true);
    return { ok: true, headers: new Headers({ 'content-type': 'image/png' }), async blob() { return new Blob(['png'], { type: 'image/png' }); } };
  }, history);
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';
  await harness.submitImageGeneration(elements);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(elements.results.hidden, false);
  assert.equal(historyWrites, 0);
  assert.equal(imageFetches, 0);
});

test('image generation remains available when IndexedDB is unavailable', async () => {
  const harness = createHarness(async () => response({}), null);
  const elements = { status: element(), grid: element(), empty: element(), clear: element('button') };
  await harness.renderImageHistory(elements);
  assert.equal(elements.status.hidden, false);
  assert.match(elements.status.textContent, /生图与下载功能仍可使用/);
  assert.equal(elements.clear.disabled, true);
});

test('stale image history reads cannot replace a newer render', async () => {
  const firstRead = deferred();
  let reads = 0;
  const history = { async list() { reads += 1; return reads === 1 ? firstRead.promise : []; }, async addMany() {}, async remove() {}, async clear() {} };
  const harness = createHarness(async () => response({}), history);
  const elements = { status: element(), grid: element(), empty: element(), clear: element('button') };
  const oldRender = harness.renderImageHistory(elements);
  await harness.renderImageHistory(elements);
  firstRead.resolve([{ id: 'stale', blob: new Blob(['x'], { type: 'image/png' }), prompt: '旧图片', modelName: '旧模型', ratio: '1:1', style: '自动', createdAt: Date.now(), mimeType: 'image/png' }]);
  await oldRender;
  assert.equal(elements.grid.children.length, 0);
  assert.equal(elements.status.textContent, '');
});

test('failed image history reads clear stale cards whose object URLs may be revoked', async () => {
  const history = { async list() { throw new Error('IndexedDB unavailable'); }, async addMany() {}, async remove() {}, async clear() {} };
  const harness = createHarness(async () => response({}), history);
  const elements = { status: element(), grid: element(), empty: element(), clear: element('button') };
  elements.grid.append(element('article'));

  await harness.renderImageHistory(elements);

  assert.equal(elements.grid.children.length, 0);
  assert.equal(elements.empty.hidden, false);
  assert.equal(elements.clear.disabled, true);
  assert.match(elements.status.textContent, /暂时无法读取/);
});

test('selected reference files are sent as multipart and upstream errors are shown clearly', async () => {
  const calls = [];
  const harness = createHarness(async (...args) => {
    calls.push(args);
    return response({ status: 422, code: 'image_provider_incompatible', title: '参考图编辑失败，请检查所选平台是否支持图像编辑。', requestId: 'r1' }, 422);
  });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';
  const file = new Blob([new Uint8Array(50 * 1024)], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: 'reference.png' });
  elements.referenceInput.files = [file];

  await harness.submitImageGeneration(elements);

  assert.ok(calls[0][1].body instanceof FormData);
  assert.equal(calls[0][1].headers['Content-Type'], undefined);
  assert.equal(calls[0][1].headers.Prefer, 'respond-async');
  assert.equal(calls[0][1].body.get('modelRecordId'), 'm-first');
  assert.equal(calls[0][1].body.get('referenceImage').name, 'reference.png');
  assert.equal(elements.referenceError.textContent, '参考图编辑失败，请检查所选平台是否支持图像编辑。');
  assert.equal(elements.referenceError.dataset.tone, 'error');
  assert.equal(elements.referenceError.hidden, false);
  assert.equal(elements.status.textContent, '参考图编辑失败，请检查所选平台是否支持图像编辑。');
  assert.equal(elements.status.dataset.tone, 'error');
  assert.equal(elements.status.hidden, false);
  assert.equal(elements.submit.disabled, false);
  assert.equal(elements.composer.classList.contains('is-busy'), false);
});

test('reference validation accepts supported images up to 10MB and rejects unsupported formats or larger files', () => {
  const harness = createHarness(async () => response({}));
  assert.equal(harness.validateReferenceFile({ type: 'image/png', size: 10 * 1024 * 1024 }).ok, true);
  assert.equal(harness.validateReferenceFile({ type: 'image/gif', size: 100 }).ok, false);
  const oversized = harness.validateReferenceFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.message, '参考图不能超过 10MB。');
});

test('reference input is available only for models whose provider has an edit endpoint', async () => {
  const harness = createHarness(async () => response({}));
  const elements = studioElements();
  harness.imageStudioState.models = [{ ...models[0], supportsReferenceImage: false }];
  elements.model.value = 'm-first';
  harness.updateModelControls(elements);
  assert.equal(elements.referenceTrigger.disabled, true);
  assert.equal(elements.referenceInput.disabled, true);
  assert.equal(elements.referenceLabel.textContent, '此模型不支持参考图');
});

test('maximum reference and prompt serialize below the API multipart body limit', async () => {
  const harness = createHarness(async () => response({}));
  const elements = studioElements();
  const file = new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: '参考图.png' });
  elements.referenceInput.files = [file];
  const options = harness.buildGenerationRequest(elements, {
    modelRecordId: 'm-first', prompt: '图'.repeat(1000), ratio: '1:1', style: '自动', count: 1
  }, new AbortController().signal);
  const serialized = await new Request('https://ontimo.cn/api/v1/image-generations', options).arrayBuffer();
  assert.ok(serialized.byteLength <= 10 * 1024 * 1024 + 128 * 1024, `multipart body was ${serialized.byteLength} bytes`);
});

test('aborted waiting explains the task may continue and restores controls in finally', async () => {
  const harness = createHarness(async (_path, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('aborted', 'AbortError');
  });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';

  await harness.submitImageGeneration(elements);

  assert.match(elements.status.textContent, /已停止等待.*任务可能仍在生成/);
  assert.doesNotMatch(elements.status.textContent, /已取消本次生成/);
  assert.equal(elements.submit.disabled, false);
  assert.equal(elements.model.disabled, false);
  assert.equal(elements.composer.classList.contains('is-busy'), false);
  assert.equal(harness.imageStudioState.requestController, null);
});

test('generation refuses cross-origin result URLs instead of rendering them', async () => {
  const harness = createHarness(async () => response({
    generationId: 'g1', images: [{ id: 'i1', mimeType: 'image/png', expiresAt: '2026-09-20T12:00:00.000Z', url: 'https://evil.example/result.png' }]
  }));
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';

  await harness.submitImageGeneration(elements);

  assert.equal(elements.results.hidden, true);
  assert.match(elements.status.textContent, /返回了无效的图片地址/);
});

test('generation polls an accepted job without submitting the prompt again', async () => {
  const calls = [];
  const harness = createHarness(async (url, init) => {
    calls.push([url, init]);
    if (calls.length === 1) return response({ jobId: '12345678-1234-1234-1234-123456789abc', state: 'pending' }, 202);
    if (calls.length === 2) return response({ state: 'pending' }, 202);
    return response({ images: [{ id: 'i1', mimeType: 'image/png', url: '/api/v1/image-generations/g1/images/i1' }], historySaved: true });
  });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';
  assert.equal(await harness.submitImageGeneration(elements), true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1].headers.Prefer, 'respond-async');
  assert.equal(calls[1][0], '/api/v1/image-generation-jobs/12345678-1234-1234-1234-123456789abc');
  assert.equal(calls[1][1].method, undefined);
});

test('generation distinguishes an HTML gateway timeout', async () => {
  const harness = createHarness(async () => ({ ok: false, status: 504, async json() { throw new SyntaxError('HTML'); } }));
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';
  await harness.submitImageGeneration(elements);
  assert.match(elements.status.textContent, /等待超时/);
});

test('generation transport failures use a stable Chinese error', async () => {
  const harness = createHarness(async () => { throw new TypeError('Failed to fetch'); });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';

  await harness.submitImageGeneration(elements);

  assert.equal(elements.status.textContent, '网络连接中断，请先查看账号云历史，避免重复生成。');
});

test('generation renders actionable safe service failures and restores its controls', async () => {
  for (const [code, title, status] of [
    ['image_service_unconfigured', '生图服务尚未配置，请联系管理员。', 503],
    ['image_provider_auth_failed', '生图平台鉴权失败，请联系管理员。', 502],
    ['image_provider_timeout', '生图请求超时，请稍后重试。', 504],
    ['internal_error', '服务暂时不可用', 500]
  ]) {
    const harness = createHarness(async () => response({ code, title }, status));
    const elements = studioElements();
    harness.imageStudioState.models = models;
    elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';
    await harness.submitImageGeneration(elements);
    assert.equal(elements.status.textContent, title);
    assert.equal(elements.status.dataset.tone, 'error');
    assert.equal(elements.submit.disabled, false);
  }
});


test('pasted images become multipart references while ordinary text paste stays native', () => {
  const harness = createHarness(async () => response({}));
  const elements = { composer: element(), referenceInput: element('input'), referenceError: element('p') };
  harness.bindReferencePaste(elements);
  let prevented = false;
  const image = new Blob(['clipboard-image'], { type: 'image/png' });
  Object.defineProperty(image, 'name', { value: 'clipboard.png' });
  let changed = 0;
  elements.referenceInput.dispatchEvent = event => { if (event.type === 'change') changed++; };
  elements.composer.dispatch('paste', { clipboardData: { items: [{ type: 'image/png', getAsFile: () => image }] }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(changed, 1);
  assert.equal(elements.referenceInput.files[0], image);
  const request = harness.buildGenerationRequest(elements, { modelRecordId: 'model', prompt: 'test', ratio: '1:1', style: 'auto', count: 1 });
  assert.equal(request.body.get('referenceImage').name, 'clipboard.png');
  prevented = false;
  elements.composer.dispatch('paste', { clipboardData: { items: [{ type: 'text/plain', getAsFile: () => null }] }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(changed, 1);
});

test('paste respects size, format, model support and active generation without replacing an existing reference', () => {
  const harness = createHarness(async () => response({}));
  const original = new Blob(['original'], { type: 'image/png' });
  const elements = { composer: element(), referenceInput: element('input'), referenceError: element('p') };
  elements.referenceInput.files = [original];
  harness.bindReferencePaste(elements);
  const paste = file => elements.composer.dispatch('paste', { clipboardData: { items: [], files: [file] } });
  paste(new Blob(['bad-format'], { type: 'image/gif' }));
  assert.equal(elements.referenceError.dataset.tone, 'error');
  assert.equal(elements.referenceInput.files[0], original);
  paste(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }));
  assert.equal(elements.referenceInput.files[0], original);
  elements.referenceInput.disabled = true;
  paste(new Blob(['valid'], { type: 'image/png' }));
  assert.equal(elements.referenceInput.files[0], original);
  elements.referenceInput.disabled = false;
  harness.imageStudioState.requestController = new AbortController();
  paste(new Blob(['valid'], { type: 'image/png' }));
  assert.equal(elements.referenceInput.files[0], original);
});


test('reference thumbnail opens the original image in the preview dialog and keeps removal separate', () => {
  const harness = createHarness(async () => response({}));
  const elements = { referencePreview: element(), composer: element(), previewDialog: element('dialog'), previewImage: element('img') };
  let removed = false;
  harness.renderReferencePreview(elements, 'blob:original-reference', () => { removed = true; });
  const [preview, remove] = elements.referencePreview.children;
  assert.equal(preview.type, 'button');
  assert.equal(preview['aria-label'], '查看完整参考图');
  assert.equal(preview.children[0].src, 'blob:original-reference');
  preview.click();
  assert.equal(elements.previewDialog.open, true);
  assert.equal(elements.previewImage.src, 'blob:original-reference');
  assert.equal(removed, false);
  remove.click();
  assert.equal(removed, true);
  assert.equal(remove['aria-label'], '移除参考图');
});
