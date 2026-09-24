import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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
    removeAttribute(name) { delete this[name]; },
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
    fetch: fetchImpl, AbortController, FormData, Blob, URL, Image: FakeImage,
    location: { origin: 'https://ontimo.cn' }, matchMedia: () => ({ matches: true }),
    console, Date, Math, Number, String, Set, Map
  };
  context.globalThis = context;
  let source = readFileSync('image-generation.js', 'utf8');
  source = source.replace(/^import .*image-generation-history\.js.*\r?\n/, '');
  source = source.replace(
    'const imageHistory = createImageHistory();',
    'const imageHistory = globalThis.__history;'
  );
  source = source.replace(
    "document.addEventListener('DOMContentLoaded', initImageStudio);",
    'globalThis.__imageStudioTest = { imageStudioState, validateReferenceFile, loadImageModels, updateModelControls, buildGenerationRequest, submitImageGeneration, renderResults, normalizeImageError, saveGeneratedImages, renderImageHistory };'
  );
  context.__history = history;
  vm.runInNewContext(source, context, { filename: 'image-generation.js' });
  return { ...context.__imageStudioTest, createdLinks, document, selectors };
}

function studioElements() {
  const form = element('form');
  return {
    form, composer: form, prompt: element('textarea'), promptError: element('p'),
    model: element('select'), ratio: element('select'), style: element('select'), count: element('select'),
    referenceInput: element('input'), referenceTrigger: element('button'), referenceError: element('p'), referenceLabel: element('span'), submit: element('button'),
    status: element('div'), results: element('section')
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
  const image = card.children[0].children[0];
  const badge = card.children[0].children[1];
  assert.equal(image.src, '/api/v1/image-generations/g1/images/i1');
  assert.match(image.alt, /海报模型/);
  assert.equal(badge.textContent, '海报模型');
  assert.doesNotMatch(elements.results.textContent, /演示/);

  const downloadButton = card.children[1].children[1].children[0];
  downloadButton.click();
  assert.match(harness.createdLinks[0].download, /海报模型/);
  assert.match(harness.createdLinks[0].download, /\.png$/);
});

test('successful generation saves image Blobs and metadata without hiding results', async () => {
  const saved = [];
  let generated = false;
  const history = { async addMany(records) { saved.push(...records); }, async list() { return []; }, async remove() {}, async clear() {} };
  const harness = createHarness(async (path) => {
    if (path === '/api/v1/image-generations') {
      generated = true;
      return response({ generationId: 'g1', images: [{ id: 'i1', mimeType: 'image/png', url: '/api/v1/image-generations/g1/images/i1' }] });
    }
    assert.equal(generated, true);
    return { ok: true, headers: new Headers({ 'content-type': 'image/png' }), async blob() { return new Blob(['png'], { type: 'image/png' }); } };
  }, history);
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';
  await harness.submitImageGeneration(elements);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(elements.results.hidden, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].prompt, '一只猫');
  assert.equal(saved[0].modelName, '方图模型');
  assert.ok(saved[0].blob instanceof Blob);
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
  assert.equal(calls[0][1].headers, undefined);
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

test('aborted generation reports cancellation and restores controls in finally', async () => {
  const harness = createHarness(async (_path, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('aborted', 'AbortError');
  });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';

  await harness.submitImageGeneration(elements);

  assert.match(elements.status.textContent, /已取消/);
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

test('generation transport failures use a stable Chinese error', async () => {
  const harness = createHarness(async () => { throw new TypeError('Failed to fetch'); });
  const elements = studioElements();
  harness.imageStudioState.models = models;
  elements.model.value = 'm-first'; elements.ratio.value = '1:1'; elements.style.value = '自动'; elements.count.value = '1'; elements.prompt.value = '一只猫';

  await harness.submitImageGeneration(elements);

  assert.equal(elements.status.textContent, '生图服务暂时不可用，请稍后重试。');
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
