import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const adminHtml = readFileSync('admin.html', 'utf8');
const adminJs = readFileSync('admin.js', 'utf8');

test('image model workspace exposes provider, model, key rotation, and test controls', () => {
  for (const id of [
    'image-models',
    'image-provider-list',
    'image-model-list',
    'image-provider-add',
    'image-model-add',
    'image-provider-dialog',
    'image-model-dialog',
    'image-workspace-lock',
    'image-token-form',
    'image-admin-token',
    'image-provider-key-hint',
    'image-provider-replace-key',
    'image-provider-test',
    'image-provider-test-status',
    'model-supported-ratios',
    'model-max-images'
  ]) {
    assert.match(adminHtml, new RegExp(`id=["']${id}["']`), id);
  }

  assert.match(adminHtml, /id="image-provider-test-status"[^>]*(?:role="status"|aria-live="polite")/);
  assert.match(adminHtml, /id="image-provider-replace-key"[^>]*type="checkbox"/);
  assert.doesNotMatch(adminHtml, /id="image-provider-api-key"[^>]*type="password"/);
});

test('image administration uses only same-origin admin endpoints and never stores provider keys', () => {
  assert.match(adminJs, /const IMAGE_PROVIDER_API = "\/api\/admin\/v1\/image-providers"/);
  assert.match(adminJs, /const IMAGE_MODEL_API = "\/api\/admin\/v1\/image-models"/);
  assert.doesNotMatch(adminJs, /fetchJson\(\s*["'`]https?:\/\//);
  assert.doesNotMatch(adminJs, /(?:local|session)Storage\.(?:getItem|setItem)\([^)]*(?:api[-_]?key|provider)/i);
});

test('provider and model records are rendered with DOM text rather than HTML interpolation', () => {
  const providerRenderer = adminJs.slice(
    adminJs.indexOf('function renderImageProviders'),
    adminJs.indexOf('function renderImageModels')
  );
  const modelRenderer = adminJs.slice(
    adminJs.indexOf('function renderImageModels'),
    adminJs.indexOf('function openImageProviderDialog')
  );

  assert.ok(providerRenderer.length > 100, 'provider renderer exists');
  assert.ok(modelRenderer.length > 100, 'model renderer exists');
  assert.match(adminJs, /function imageText[\s\S]*?textContent\s*=\s*text/);
  assert.match(providerRenderer, /imageText\(/);
  assert.match(modelRenderer, /imageText\(/);
  assert.doesNotMatch(providerRenderer, /innerHTML\s*=/);
  assert.doesNotMatch(modelRenderer, /innerHTML\s*=/);
});

test('image mutations have a shared in-flight guard and refresh their workspace', () => {
  assert.match(adminJs, /function setImageActionBusy/);
  assert.match(adminJs, /async function refreshImageWorkspace/);
  assert.match(adminJs, /await refreshImageWorkspace\(\)/);
});

test('image refreshes queue behind active reads and provider tests cannot retarget another dialog', () => {
  assert.match(adminJs, /imageRefreshQueued:\s*false/);
  assert.match(adminJs, /state\.imageRefreshQueued\s*=\s*true/);
  assert.match(adminJs, /imageProviderEditorSession:\s*null/);
  assert.match(adminJs, /function isCurrentProviderEditor/);
  assert.match(adminJs, /providerFormConfigFingerprint\(\)\s*===\s*submittedConfig/);
  const testHandler = adminJs.slice(adminJs.indexOf('async function testImageProvider'), adminJs.indexOf('async function patchImageProvider'));
  assert.match(testHandler, /const editorSession = state\.imageProviderEditorSession/);
  assert.match(testHandler, /const mayAdvanceRevision = sameEditorConfig && error\?\.status !== 409 && latest[\s\S]*?Number\(latest\.revision\) > submittedRevision[\s\S]*?providerRecordConfigFingerprint\(latest\) === submittedConfig/);
  assert.match(testHandler, /if \(mayAdvanceRevision\) \{[\s\S]*?imageProviderRevision\.value = latest\.revision/);
});

test('cookie-only admin sessions wait for a management token and dialog close cleans key state', () => {
  assert.match(adminJs, /imageAdminToken:\s*""/);
  assert.match(adminJs, /async function unlockImageWorkspace/);
  assert.match(adminJs, /Authorization:\s*`Bearer \$\{state\.imageAdminToken\}`/);
  assert.match(adminJs, /图片平台设置需要管理令牌/);
  assert.match(adminJs, /imageProviderDialog\.addEventListener\("close"/);
  assert.match(adminJs, /imageProviderKeyField\.replaceChildren\(\)/);
  assert.match(adminJs, /function cleanupImageProviderDialog[\s\S]*?imageProviderSave\.disabled\s*=\s*false[\s\S]*?imageProviderTest\.disabled\s*=\s*false/);
});
