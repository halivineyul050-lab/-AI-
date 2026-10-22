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

function response(data = {}, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return status >= 200 && status < 300 ? { data } : data; } };
}

function element() {
  const listeners = new Map();
  const node = {
    value: '', type: 'text', hidden: false, disabled: false, checked: false, open: false,
    className: '', textContent: '', children: [], options: [], dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, handler) { listeners.set(type, handler); },
    click() { return listeners.get('click')?.({ currentTarget: this }); },
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; },
    append(...items) {
      this.children.push(...items);
      this.options = this.children;
      if (!this.value && items[0]?.value) this.value = items[0].value;
    },
    replaceChildren(...items) {
      this.children = [...items];
      this.options = this.children;
      this.value = items[0]?.value || '';
    },
    querySelector(selector) {
      if (selector === '#image-provider-api-key') {
        const labels = this.children.flatMap((child) => child.children || []);
        return labels.find((child) => child.id === 'image-provider-api-key') || null;
      }
      return null;
    },
    querySelectorAll() { return this._querySelectorAll || []; },
    reset() {}, focus() {}, remove() {},
    showModal() { this.open = true; },
    close() { this.open = false; listeners.get('close')?.({ target: this }); }
  };
  return node;
}

function createHarness(fetchImpl = async () => response()) {
  const elements = new Map();
  const documentListeners = new Map();
  const intervals = new Map();
  const clearedIntervals = [];
  let nextIntervalId = 0;
  const document = {
    readyState: 'loading', hidden: false,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return element(); },
    createTextNode(text) { return { textContent: text }; },
    addEventListener(type, handler) { documentListeners.set(type, handler); }
  };
  const window = {
    nikaiModelPicker:({model})=>({select:model,setConfig(){},changed(){}}),
    addEventListener() {}, clearTimeout() {}, setTimeout() { return 1; },
    clearInterval(id) { clearedIntervals.push(id); intervals.delete(id); },
    setInterval(handler, delay) { const id = ++nextIntervalId; intervals.set(id, { id, handler, delay }); return id; },
    confirm() { return true; }
  };
  const memorySession = { getItem() { return ''; }, setItem() {}, removeItem() {} };
  window.nikaiStorage = { session: memorySession, local: memorySession };
  const context = {
    document, window, fetch: (...args) => fetchImpl(...args), navigator: { onLine: true },
    location: { replace() {} }, console, FormData: class { get() { return ''; } },
    AbortController, URL, URLSearchParams, Intl, Date, Math, Number, String, Set, Map,
    encodeURIComponent, decodeURIComponent
  };
  context.globalThis = context;
  let source = readFileSync('public/admin.js', 'utf8');
  const marker = '\n})();';
  const index = source.lastIndexOf(marker);
  source = `${source.slice(0, index)}\n  globalThis.__imageAdminTest = { state, dom, lockReviews, refreshImageWorkspace, unlockImageWorkspace, bindEvents, openImageProviderDialog, closeImageProviderDialog, saveImageProvider, testImageProvider, discoverImageProviderModels, importDiscoveredImageModels, openImageModelDialog, closeImageModelDialog, saveImageModel, renderImageProviders };${source.slice(index)}`;
  vm.runInNewContext(source, context, { filename: 'admin.js' });
  const hooks = context.__imageAdminTest;
  hooks.dom.imageModelRatios._querySelectorAll = ['1:1', '16:9'].map((value) => ({ value, checked: value === '1:1' }));
  return { ...hooks, context, document, documentListeners, intervals, clearedIntervals };
}

test('locking admin clears image auth and invalidates a pending image unlock', async () => {
  const pending = deferred();
  const harness = createHarness(() => pending.promise);
  const { state, dom, unlockImageWorkspace, lockReviews } = harness;
  state.token = 'review-token';
  state.imageAdminToken = 'old-image-token';
  dom.imageAdminToken.value = 'next-image-token';

  const unlocking = unlockImageWorkspace({ preventDefault() {} });
  lockReviews(false);
  pending.resolve(response([]));
  await unlocking;

  assert.equal(state.token, '');
  assert.equal(state.imageAdminToken, '');
  assert.equal(dom.imageWorkspaceLock.hidden, false);
  assert.equal(dom.imageProviderAdd.disabled, true);
  assert.equal(dom.imageModelAdd.disabled, true);
});

test('locking admin prevents an older workspace refresh from restoring provider data or controls', async () => {
  const providers = deferred();
  const models = deferred();
  const harness = createHarness((path) => path.includes('image-providers') ? providers.promise : models.promise);
  const { state, dom, refreshImageWorkspace, lockReviews } = harness;
  state.token = 'review-token';
  state.imageAdminToken = 'image-token';

  const refreshing = refreshImageWorkspace();
  lockReviews(false);
  providers.resolve(response({ items: [{ id: 'provider-after-lock', name: 'stale' }] }));
  models.resolve(response({ items: [{ id: 'model-after-lock', providerId: 'provider-after-lock' }] }));
  await refreshing;

  assert.equal(state.imageProviders.length, 0);
  assert.equal(state.imageModels.length, 0);
  assert.equal(dom.imageWorkspaceLock.hidden, false);
  assert.equal(dom.imageProviderAdd.disabled, true);
  assert.equal(dom.imageModelAdd.disabled, true);
});

test('provider test preserves the submitted revision after a conflict', async () => {
  const testRequest = deferred();
  const harness = createHarness((path, options = {}) => {
    if (options.method === 'POST') return testRequest.promise;
    if (path.includes('image-providers')) return Promise.resolve(response({ items: [{ id: 'p1', hasApiKey:true, name: 'Provider', revision: 8 }] }));
    return Promise.resolve(response({ items: [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model', supportedRatios: ['1:1'], maxImages: 1 }] }));
  });
  const { state, dom, openImageProviderDialog, testImageProvider } = harness;
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 7 };
  state.imageProviders = [provider];
  state.imageModels = [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model' }];
  state.imageAdminToken = 'token';
  openImageProviderDialog(provider);

  const testing = testImageProvider();
  testRequest.resolve(response({ title: 'revision conflict' }, 409));
  await testing;

  assert.equal(dom.imageProviderRevision.value, 7);
  assert.strictEqual(state.imageEditingProvider, provider);
  assert.equal(dom.imageProviderTestStatus.className, 'is-error');
});

test('provider connection test explains that a model must be added instead of silently disabling the button', async () => {
  let requests = 0;
  const harness = createHarness(async () => { requests += 1; return response(); });
  const { state, dom, openImageProviderDialog, testImageProvider } = harness;
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 1 };
  state.imageProviders = [provider];
  state.imageModels = [];
  state.imageAdminToken = 'token';

  openImageProviderDialog(provider);
  assert.equal(dom.imageProviderTest.disabled, false);
  assert.match(dom.imageProviderTestStatus.textContent, /请先添加模型/);

  await testImageProvider();
  assert.equal(requests, 0);
  assert.equal(dom.imageProviderTestStatus.className, 'is-error');
  assert.match(dom.imageProviderTestStatus.textContent, /请先添加模型/);
});

test('provider discovery exposes real upstream models without fabricating fallbacks', async () => {
  const harness = createHarness(async (path, options = {}) => {
    if (path.includes('model-discovery')) return response({ items: [{ id: 'flux-image' }] });
    return response({ items: [] });
  });
  const { state, dom, openImageProviderDialog, discoverImageProviderModels } = harness;
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images/generations', timeoutMs: 60000, revision: 1 };
  state.imageProviders = [provider];
  state.imageAdminToken = 'token';
  openImageProviderDialog(provider);
  await discoverImageProviderModels();
  assert.equal(state.imageDiscoveredModels.length, 1);
  assert.equal(state.imageDiscoveredModels[0].modelId, 'flux-image');
  assert.equal(dom.imageProviderDiscoveryList.hidden, false);
  assert.match(dom.imageProviderDiscoveryStatus.textContent, /读取到 1 个模型/);
});

test('provider discovery keeps an empty upstream list empty', async () => {
  const harness = createHarness(async () => response({ items: [] }));
  const { state, dom, openImageProviderDialog, discoverImageProviderModels } = harness;
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images/generations', timeoutMs: 60000, revision: 1 };
  state.imageProviders = [provider]; state.imageAdminToken = 'token';
  openImageProviderDialog(provider);
  await discoverImageProviderModels();
  assert.equal(state.imageDiscoveredModels.length, 0);
  assert.match(dom.imageProviderDiscoveryStatus.textContent, /空模型列表/);
});

test('provider discovery queues changed address while a previous request is pending', async () => {
  const first=deferred();const requests=[];
  const harness=createHarness(async (path,options={})=>{
    requests.push(JSON.parse(options.body));
    if(requests.length===1)return first.promise;
    return response({items:[{id:'new-image-model'}]});
  });
  const {state,dom,openImageProviderDialog,discoverImageProviderModels}=harness;
  state.imageAdminToken='token';
  openImageProviderDialog({id:'p1',name:'Platform',baseUrl:'https://one.example',hasApiKey:true});
  const old=discoverImageProviderModels();
  dom.imageProviderBaseUrl.value='https://two.example';
  await discoverImageProviderModels();
  first.resolve(response({items:[{id:'old-image-model'}]}));await old;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,2);assert.equal(requests[1].endpoint,'https://two.example');
  assert.equal(state.imageDiscoveredModels[0].modelId,'new-image-model');
});

test('provider cards query configured live balance and show an explicit unconfigured state', async () => {
  const requests = [];
  const harness = createHarness(async (path, options = {}) => {
    requests.push({ path, options });
    return response({ balance: 5.5, currency: 'USD', checkedAt: '2026-09-28T01:02:03.000Z' });
  });
  const { state, dom, renderImageProviders } = harness;
  state.imageAdminToken = 'token';
  state.imageProviders = [
    { id: 'configured', name: 'Configured', baseUrl: 'https://one.example', balancePath: '/account/balance' },
    { id: 'unconfigured', name: 'No balance endpoint', baseUrl: 'https://two.example', balancePath: '' }
  ];

  renderImageProviders();
  const textIn = (node) => [node?.textContent || '', ...(node?.children || []).map(textIn)].join(' ');
  const configuredCard = dom.imageProviderList.children.find((card) => textIn(card).includes('Configured'));
  const unconfiguredCard = dom.imageProviderList.children.find((card) => textIn(card).includes('No balance endpoint'));
  assert.match(textIn(unconfiguredCard), /未配置余额接口/);
  const balanceButton = configuredCard.children.flatMap((child) => child.children || []).find((button) => textIn(button).includes('查询余额'));
  assert.ok(balanceButton);
  await balanceButton.click();
  assert.equal(requests[0].path, '/api/admin/v1/image-providers/configured/balance');
  assert.equal(requests[0].options.method, 'POST');
  assert.match(textIn(dom.imageProviderList), /5.5/);
  assert.match(textIn(dom.imageProviderList), /USD/);
  assert.match(textIn(dom.imageProviderList), /09\/28/);
});

test('configured provider balances refresh automatically every minute while the admin page is visible', async () => {
  let balance = 4.25;
  const requests = [];
  const harness = createHarness(async (path, options = {}) => {
    requests.push({ path, options });
    if (path === '/api/admin/v1/image-providers') {
      return response({ items: [{ id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', balancePath: '/account/balance' }] });
    }
    if (path === '/api/admin/v1/image-models') return response({ items: [] });
    if (path.endsWith('/balance')) return response({ balance, currency: 'USD', checkedAt: '2026-09-28T01:02:03.000Z' });
    return response({ items: [] });
  });
  const { state, dom, document, documentListeners, bindEvents, refreshImageWorkspace, intervals, clearedIntervals, lockReviews } = harness;
  state.imageAdminToken = 'token';
  await refreshImageWorkspace({ quiet: true });
  await new Promise((resolve) => setImmediate(resolve));

  const balanceRequests = () => requests.filter(({ path }) => path.endsWith('/balance'));
  assert.equal(balanceRequests().length, 1, 'loading providers queries configured balances once');
  const timer = [...intervals.values()].find(({ delay }) => delay === 60_000);
  assert.ok(timer, 'unlocked image settings schedule a one-minute balance refresh');
  bindEvents();

  balance = 9.75;
  await timer.handler();
  assert.equal(balanceRequests().length, 2);
  const textIn = (node) => [node?.textContent || '', ...(node?.children || []).map(textIn)].join(' ');
  assert.match(textIn(dom.imageProviderList), /9\.75/);

  document.hidden = true;
  await timer.handler();
  assert.equal(balanceRequests().length, 2, 'hidden pages do not poll providers');
  document.hidden = false;
  await documentListeners.get('visibilitychange')();
  assert.equal(balanceRequests().length, 3, 'returning to the visible page refreshes immediately');

  lockReviews(false);
  assert.ok(clearedIntervals.includes(timer.id), 'locking the admin clears the balance polling timer');
  assert.equal(Object.keys(state.imageBalances).length, 0, 'locking the admin clears the in-memory balance values');
});

test('provider balance controls block duplicate upstream lookups while one is pending', async () => {
  const balanceRequest = deferred();
  let requests = 0;
  const harness = createHarness(async (_path, options = {}) => {
    if (options.method === 'POST') { requests += 1; return balanceRequest.promise; }
    return response({ items: [] });
  });
  const { state, dom, renderImageProviders } = harness;
  state.imageAdminToken = 'token';
  state.imageProviders = [{ id: 'p1', hasApiKey:true, name: 'Provider', balancePath: '/account/balance' }];
  renderImageProviders();
  const textIn = (node) => [node?.textContent || '', ...(node?.children || []).map(textIn)].join(' ');
  const getButton = () => dom.imageProviderList.children[0].children.flatMap((child) => child.children || []).find((button) => textIn(button).includes('查询余额'));

  const firstQuery = getButton().click();
  const pendingButton = getButton();
  assert.equal(pendingButton.disabled, true);
  await pendingButton.click();
  assert.equal(requests, 1);
  balanceRequest.resolve(response({ balance: 1, currency: 'USD', checkedAt: '2026-09-28T01:02:03.000Z' }));
  await firstQuery;
});

test('saving provider configuration sends optional balance endpoint and JSON field selectors', async () => {
  let submitted;
  const harness = createHarness(async (path, options = {}) => {
    if (options.method === 'PATCH') submitted = JSON.parse(options.body);
    return path.endsWith('image-models') ? response({ items: [] }) : response({ items: [] });
  });
  const { state, dom, openImageProviderDialog, saveImageProvider } = harness;
  state.imageAdminToken = 'token';
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', revision: 2 };
  openImageProviderDialog(provider);
  dom.imageProviderBalancePath.value = '/account/credits';
  dom.imageProviderBalanceValueField.value = 'data.credits.remaining';
  dom.imageProviderBalanceCurrencyField.value = 'data.credits.unit';
  await saveImageProvider({ preventDefault() {} });

  assert.equal(submitted.balancePath, '/account/credits');
  assert.equal(submitted.balanceValueField, 'data.credits.remaining');
  assert.equal(submitted.balanceCurrencyField, 'data.credits.unit');
});

test('admin connection tests display safe configuration, authentication and timeout explanations', async () => {
  for (const [code, title, status] of [
    ['image_service_unconfigured', '生图服务尚未配置，请联系管理员。', 503],
    ['image_provider_auth_failed', '生图平台鉴权失败，请联系管理员。', 502],
    ['image_provider_timeout', '生图请求超时，请稍后重试。', 504],
    ['internal_error', '服务暂时不可用', 500]
  ]) {
    const harness = createHarness(async (_path, options = {}) => options.method === 'POST'
      ? response({ code, title }, status) : response({ items: [] }));
    const { state, dom, openImageProviderDialog, testImageProvider } = harness;
    const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 1 };
    state.imageProviders = [provider];
    state.imageModels = [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model' }];
    state.imageAdminToken = 'token';
    openImageProviderDialog(provider);
    await testImageProvider();
    assert.equal(dom.imageProviderTestStatus.textContent, title);
    assert.equal(dom.imageProviderTestStatus.className, 'is-error');
    assert.equal(dom.imageProviderTest.disabled, false);
  }
});

test('recorded upstream failure adopts its newer revision when editor config is unchanged', async () => {
  const testRequest = deferred();
  const harness = createHarness((path, options = {}) => {
    if (options.method === 'POST') return testRequest.promise;
    if (path.includes('image-providers')) return Promise.resolve(response({ items: [{
      id: 'p1', name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images',
      timeoutMs: 60000, enabled: true, revision: 8, lastTestStatus: 'failed'
    }] }));
    return Promise.resolve(response({ items: [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model', supportedRatios: ['1:1'], maxImages: 1 }] }));
  });
  const { state, dom, openImageProviderDialog, testImageProvider } = harness;
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, enabled: true, revision: 7 };
  state.imageProviders = [provider];
  state.imageModels = [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model' }];
  state.imageAdminToken = 'token';
  openImageProviderDialog(provider);

  const testing = testImageProvider();
  testRequest.resolve(response({ title: 'upstream unavailable' }, 502));
  await testing;

  assert.equal(dom.imageProviderRevision.value, 8);
  assert.equal(state.imageEditingProvider.revision, 8);
  assert.equal(dom.imageProviderTestStatus.className, 'is-error');
});

test('provider test advances revision only when the same editor session and config remain active', async () => {
  const firstTest = deferred();
  let request = firstTest;
  const harness = createHarness((path, options = {}) => {
    if (options.method === 'POST') return request.promise;
    if (path.includes('image-providers')) return Promise.resolve(response({ items: [{ id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 8 }] }));
    return Promise.resolve(response({ items: [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model', supportedRatios: ['1:1'], maxImages: 1 }] }));
  });
  const { state, dom, openImageProviderDialog, testImageProvider } = harness;
  const provider = { id: 'p1', hasApiKey:true, name: 'Provider', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 7 };
  state.imageProviders = [provider];
  state.imageModels = [{ id: 'm1', providerId: 'p1', modelId: 'upstream', displayName: 'Model' }];
  state.imageAdminToken = 'token';
  openImageProviderDialog(provider);
  const changed = testImageProvider();
  dom.imageProviderBaseUrl.value = 'https://edited.example';
  firstTest.resolve(response({ ok: true }));
  await changed;
  assert.equal(dom.imageProviderRevision.value, 7, 'editing config during the request keeps the stale revision');
  assert.equal(dom.imageProviderTest.disabled, false, 'the active editor is usable after a stale test result');
  assert.equal(dom.imageProviderSave.disabled, false, 'the active editor can still save its changed form');

  const secondTest = deferred();
  request = secondTest;
  openImageProviderDialog(provider);
  const stable = testImageProvider();
  secondTest.resolve(response({ ok: true }));
  await stable;
  assert.equal(dom.imageProviderRevision.value, 8, 'unchanged editor may adopt the successful test revision');
});

test('provider save completion and error cannot close or mutate a replacement editor', async () => {
  const saveRequest = deferred();
  const harness = createHarness((path, options = {}) => options.method ? saveRequest.promise : Promise.resolve(response([])));
  const { state, dom, openImageProviderDialog, closeImageProviderDialog, saveImageProvider } = harness;
  state.imageAdminToken = 'token';
  const first = { id: 'p1', hasApiKey:true, name: 'First', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 1 };
  const replacement = { id: 'p2', name: 'Second', baseUrl: 'https://two.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 1 };
  openImageProviderDialog(first);
  const saving = saveImageProvider({ preventDefault() {} });
  closeImageProviderDialog();
  openImageProviderDialog(replacement);
  dom.imageProviderSave.disabled = true;
  saveRequest.resolve(response({ title: 'failed' }, 500));
  await saving;

  assert.equal(dom.imageProviderDialog.open, true);
  assert.strictEqual(state.imageEditingProvider, replacement);
  assert.equal(dom.imageProviderFormError.hidden, true);
  assert.equal(dom.imageProviderSave.disabled, true);
});

test('successful provider save cannot close or re-enable a replacement editor', async () => {
  const saveRequest = deferred();
  const harness = createHarness((path, options = {}) => options.method
    ? saveRequest.promise
    : Promise.resolve(response({ items: [] })));
  const { state, dom, openImageProviderDialog, closeImageProviderDialog, saveImageProvider } = harness;
  state.imageAdminToken = 'token';
  const first = { id: 'p1', hasApiKey:true, name: 'First', baseUrl: 'https://one.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 1 };
  const replacement = { id: 'p2', name: 'Second', baseUrl: 'https://two.example', generationPath: '/v1/images', timeoutMs: 60000, revision: 1 };
  openImageProviderDialog(first);
  const saving = saveImageProvider({ preventDefault() {} });
  closeImageProviderDialog();
  openImageProviderDialog(replacement);
  dom.imageProviderSave.disabled = true;
  saveRequest.resolve(response({ id: 'p1' }));
  await saving;

  assert.equal(dom.imageProviderDialog.open, true);
  assert.strictEqual(state.imageEditingProvider, replacement);
  assert.equal(dom.imageProviderSave.disabled, true);
});

test('model save completion and error cannot close or mutate a replacement editor', async () => {
  const saveRequest = deferred();
  const harness = createHarness((path, options = {}) => options.method ? saveRequest.promise : Promise.resolve(response([])));
  const { state, dom, openImageModelDialog, closeImageModelDialog, saveImageModel } = harness;
  state.imageAdminToken = 'token';
  state.imageProviders = [{ id: 'p1', hasApiKey:true, name: 'Provider' }];
  const first = { id: 'm1', providerId: 'p1', modelId: 'one', displayName: 'First', supportedRatios: ['1:1'], maxImages: 1, revision: 1 };
  const replacement = { id: 'm2', providerId: 'p1', modelId: 'two', displayName: 'Second', supportedRatios: ['1:1'], maxImages: 1, revision: 1 };
  openImageModelDialog(first);
  const saving = saveImageModel({ preventDefault() {} });
  closeImageModelDialog();
  openImageModelDialog(replacement);
  dom.imageModelSave.disabled = true;
  saveRequest.resolve(response({ title: 'failed' }, 500));
  await saving;

  assert.equal(dom.imageModelDialog.open, true);
  assert.strictEqual(state.imageEditingModel, replacement);
  assert.equal(dom.imageModelFormError.hidden, true);
  assert.equal(dom.imageModelSave.disabled, true);
});

test('successful model save cannot close or re-enable a replacement editor', async () => {
  const saveRequest = deferred();
  const harness = createHarness((path, options = {}) => options.method
    ? saveRequest.promise
    : Promise.resolve(response({ items: [] })));
  const { state, dom, openImageModelDialog, closeImageModelDialog, saveImageModel } = harness;
  state.imageAdminToken = 'token';
  state.imageProviders = [{ id: 'p1', hasApiKey:true, name: 'Provider' }];
  const first = { id: 'm1', providerId: 'p1', modelId: 'one', displayName: 'First', supportedRatios: ['1:1'], maxImages: 1, revision: 1 };
  const replacement = { id: 'm2', providerId: 'p1', modelId: 'two', displayName: 'Second', supportedRatios: ['1:1'], maxImages: 1, revision: 1 };
  openImageModelDialog(first);
  const saving = saveImageModel({ preventDefault() {} });
  closeImageModelDialog();
  openImageModelDialog(replacement);
  dom.imageModelSave.disabled = true;
  saveRequest.resolve(response({ id: 'm1' }));
  await saving;

  assert.equal(dom.imageModelDialog.open, true);
  assert.strictEqual(state.imageEditingModel, replacement);
  assert.equal(dom.imageModelSave.disabled, true);
});
