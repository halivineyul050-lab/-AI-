import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { resolveAuthNextPath } from '../public/auth-redirect.mjs';

const html = readFileSync(new URL('../public/auth.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/auth.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, '');
const settle = () => new Promise(resolve => setImmediate(resolve));
const uploaded = '/api/v1/account/avatar?v=11111111-1111-4111-8111-111111111111';
async function account(avatarUrl = null) {
  function element(tag = 'div') {
    return { tag, textContent: '', children: [], hidden: false, disabled: false, value: '', files: [], listeners: {},
      remove() {}, append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(name, handler) { this.listeners[name] = handler; }, querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, toggle() {} } };
  }
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], element()]));
  const listeners = {}, requests = [], revoked = [];
  const user = { id: 'member', role: 'member', displayName: '头像测试', email: 'member@example.test', avatarUrl };
  let avatarResponse = () => ({ user: { ...user, avatarUrl: uploaded } });
  vm.runInNewContext(source, {
    AbortSignal,
    resolveAuthNextPath, URLSearchParams, URL: { createObjectURL: () => 'blob:preview', revokeObjectURL: url => revoked.push(url) },
    location: { search: '', hash: '', origin: 'https://ontimo.cn' }, history: { replaceState() {} },
    window: { nikaiStorage: { session: {} }, addEventListener(name, handler) { listeners[name] = handler; } },
    document: { querySelectorAll: () => [], getElementById: id => nodes.get(id), createElement: element, body: element() },
    fetch: async (path, options) => {
      requests.push({ path, options });
      const data = path === '/api/v1/auth/me' ? { user } : path === '/api/v1/account/avatar' ? await avatarResponse(options) : {};
      return { ok: true, json: async () => ({ data }) };
    }
  });
  await listeners.DOMContentLoaded(); await settle();
  return { nodes, requests, revoked,
    select(file) { nodes.get('avatar-file').files = [file]; nodes.get('avatar-file').listeners.change(); },
    save() { nodes.get('avatar-form').listeners.submit({ preventDefault() {} }); },
    respondWith(next) { avatarResponse = next; }
  };
}
test('avatar preview remains unsaved until explicit save and cancellation releases the preview', async () => {
  const state = await account();
  state.select({ type: 'image/png', size: 100 });
  assert.equal(state.nodes.get('account-avatar').children[0].src, 'blob:preview');
  assert.equal(state.nodes.get('avatar-save').hidden, false);
  assert.equal(state.requests.filter(item => item.path.endsWith('/avatar')).length, 0);
  state.nodes.get('avatar-cancel').listeners.click();
  assert.deepEqual(state.revoked, ['blob:preview']);
  assert.equal(state.nodes.get('account-avatar').textContent, '头');
  assert.equal(state.nodes.get('avatar-save').hidden, true);
});
test('avatar save uploads the file with its actual type and displays the saved URL', async () => {
  const state = await account(), file = { type: 'image/png', size: 100 };
  state.select(file); state.save(); await settle();
  const request = state.requests.find(item => item.path.endsWith('/avatar'));
  assert.equal(request.options.method, 'PUT'); assert.equal(request.options.body, file);
  assert.equal(request.options.headers['Content-Type'], 'image/png');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(state.nodes.get('account-avatar').children[0].src, uploaded);
  assert.match(state.nodes.get('avatar-message').textContent, /头像已保存/);
});
test('unsupported or oversized selections produce no upload', async () => {
  const state = await account();
  for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'image/png', size: 2 * 1024 * 1024 + 1 }]) {
    state.select(file); state.save(); await settle();
    assert.equal(state.nodes.get('avatar-save').hidden, true);
    assert.equal(state.requests.filter(item => item.path.endsWith('/avatar')).length, 0);
    assert.equal(state.nodes.get('avatar-message').hidden, false);
  }
});
test('restoring the default removes the persisted avatar and shows the initial', async () => {
  const state = await account(uploaded);
  state.respondWith(() => ({ user: { id: 'member', displayName: '头像测试', avatarUrl: null } }));
  state.nodes.get('avatar-reset').listeners.click(); await settle();
  assert.equal(state.requests.find(item => item.path.endsWith('/avatar')).options.method, 'DELETE');
  assert.equal(state.nodes.get('account-avatar').textContent, '头');
  assert.equal(state.nodes.get('avatar-reset').hidden, true);
});
test('logout discards a pending avatar response and prevents private state from reappearing', async () => {
  let complete;
  const state = await account();
  state.respondWith(() => new Promise(resolve => { complete = resolve; }));
  state.select({ type: 'image/png', size: 100 }); state.save();
  await state.nodes.get('logout-button').listeners.click();
  complete({ user: { id: 'member', avatarUrl: uploaded } }); await settle();
  assert.equal(state.nodes.get('account-panel').hidden, true);
  assert.equal(state.nodes.get('account-avatar').children.length, 0);
  assert.equal(state.nodes.get('avatar-message').hidden, true);
});
