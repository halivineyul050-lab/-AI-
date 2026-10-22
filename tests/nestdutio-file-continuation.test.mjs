import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerator } from '../backend/nestdutio/generator.mjs';

test('a length-truncated raw file continues from its exact prefix and records every call', async () => {
  const plan = { name: 'A', capabilities: [], acceptance: [{ kind: 'visible', target: 'h1' }], manifest: { entry: 'index.html', files: [{ path: 'index.html', purpose: 'page', dependencies: [] }] } };
  const prefix = '<<<FILE>>>index.html\n<!doctype html><h1>Fully ', tail = 'working</h1>\n<<<END_FILE>>>';
  let calls = 0; const observed = [], payloads = [];
  const generator = createGenerator({ config: () => ({ ready: true, model: 'fixture', endpoint: 'https://example.com/v1/chat/completions' }), key: () => 'key-fixture' }, { check: async () => ({ ok: true }) }, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], fetchImpl: async (_url, init) => {
      payloads.push(JSON.parse(init.body)); calls++;
      return new Response(JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 20 }, choices: [{ finish_reason: calls === 2 ? 'length' : 'stop', message: { content: calls === 1 ? JSON.stringify(plan) : calls === 2 ? prefix : tail } }] }));
    }
  });
  const result = await generator.run({ prompt: '展示网站' }, { onRequest: e => observed.push(e) });
  assert.equal(result.files[0].content, '<!doctype html><h1>Fully working</h1>');
  assert.equal(observed.length, 3);
  assert.ok(payloads[2].messages.some(message => message.role === 'assistant' && message.content === prefix));
});

test('large valid existing projects use scoped context and retain unrelated resources', async () => {
  const acceptance = [{ kind: 'visible', target: 'h1' }];
  const base = { schemaVersion: 1, name: 'A', capabilities: [], acceptance, entry: 'index.html', files: [{ path: 'index.html', content: '<h1>Old</h1>' }, { path: 'unused.css', content: '/*' + 'x'.repeat(120000) + '*/' }] };
  const plan = { name: 'A', capabilities: [], acceptance, manifest: { entry: 'index.html', files: [{ path: 'index.html', purpose: 'page', dependencies: [] }] } };
  const payloads = []; let calls = 0;
  const generator = createGenerator({ config: () => ({ ready: true, model: 'fixture', endpoint: 'https://example.com/v1/chat/completions' }), key: () => 'key-fixture' }, { check: async () => ({ ok: true }) }, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], fetchImpl: async (_url, init) => {
      payloads.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: ++calls === 1 ? JSON.stringify(plan) : '<<<FILE>>>index.html\n<h1>New</h1>\n<<<END_FILE>>>' } }] }));
    }
  });
  const result = await generator.run({ prompt: '只改标题', base });
  assert.equal(result.files.find(file => file.path === 'unused.css').content, base.files[1].content);
  assert.ok(JSON.stringify(payloads[1]).length < 10000, 'unrelated 120KB file was copied into model context');
});
