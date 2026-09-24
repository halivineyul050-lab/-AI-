import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildApplication } from "../server.mjs";
import { createImageProviderStore } from "../backend/image-provider-store.mjs";
import { createSecretBox } from "../backend/image-provider-secrets.mjs";

const token = "image-admin-test";
const secret = "sk-provider-secret-1234";
async function setup(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "image-api-"));
  const app = buildApplication({ dbPath: join(root, "test.db"), staticDir: root, autoSeed: false, environment: "test", logger: false, adminToken: token, imageConfigKey: Buffer.alloc(32, 7), imageTempRoot: join(root, "images"), ...options });
  const address = await app.listen(0, "127.0.0.1");
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const request = async (path, method = "GET", body, authenticated = true) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  return { app, request };
}
const providerInput = { name: "平台 A", baseUrl: "https://93.184.216.34", apiKey: secret };
const modelInput = (providerId, overrides = {}) => ({ providerId, modelId: "image-v1", displayName: "模型 A", supportedRatios: ["1:1", "16:9"], maxImages: 2, ...overrides });
const providers = "/api/admin/v1/image-providers";
const models = "/api/admin/v1/image-models";

test("image admin routes require bearer authentication before reading bodies", async (t) => {
  const { request } = await setup(t);
  for (const [path, method] of [[providers, "GET"], [providers, "POST"], [`${providers}/id/test`, "POST"], [models, "GET"], [`${models}/id`, "DELETE"]]) {
    assert.equal((await request(path, method, undefined, false)).status, 401);
  }
});

test("provider discovery requires a saved provider and returns normalized models", async (t) => {
  const upstream = { data: [{ id: "gpt-image-live" }, { id: "gpt-5.5" }] };
  const { request } = await setup(t, { imageFetch: async () => new Response(JSON.stringify(upstream)) });
  assert.equal((await request(`${providers}/missing/discover-models`, "POST", {}, false)).status, 401);
  assert.equal((await request(`${providers}/missing/discover-models`, "POST", {})).status, 404);
  const provider = (await request(providers, "POST", providerInput)).body.data;
  const discovered = await request(`${providers}/${provider.id}/discover-models`, "POST", {});
  assert.equal(discovered.status, 200);
  assert.deepEqual(discovered.body.data.items, [
    { modelId: "gpt-image-live", displayName: "gpt-image-live", imageLikely: true },
    { modelId: "gpt-5.5", displayName: "gpt-5.5", imageLikely: false }
  ]);
  assert.doesNotMatch(JSON.stringify(discovered.body), /sk-provider-secret|encrypted/);
});

test("provider/model CRUD masks secrets, audits writes, enforces revisions and filters public models", async (t) => {
  const { app, request } = await setup(t);
  const created = await request(providers, "POST", providerInput);
  assert.equal(created.status, 201);
  let provider = created.body.data;
  assert.equal(provider.hasApiKey, true);
  assert.equal(provider.apiKeyHint, "****1234");
  assert.deepEqual(Object.keys(provider).sort(), ["apiKeyHint", "baseUrl", "createdAt", "editPath", "enabled", "generationPath", "hasApiKey", "id", "lastTestMessage", "lastTestStatus", "lastTestedAt", "name", "revision", "timeoutMs", "updatedAt"]);
  assert.doesNotMatch(JSON.stringify(created.body), /encrypted|sk-provider-secret/);
  assert.equal((await request(providers)).body.data.items.length, 1);
  const encryptedBefore = app.db.prepare("SELECT encrypted_api_key FROM image_providers WHERE id = ?").get(provider.id).encrypted_api_key;
  assert.ok(!encryptedBefore.includes(secret));
  const updated = await request(`${providers}/${provider.id}`, "PATCH", { revision: provider.revision, name: "平台 B", apiKey: "", editPath: "" });
  assert.equal(updated.status, 200);
  provider = updated.body.data;
  assert.equal(provider.editPath, "");
  assert.equal(app.db.prepare("SELECT encrypted_api_key FROM image_providers WHERE id = ?").get(provider.id).encrypted_api_key, encryptedBefore);
  assert.equal((await request(`${providers}/${provider.id}`, "PATCH", { revision: 1, name: "stale" })).status, 409);
  const first = await request(models, "POST", modelInput(provider.id, { isDefault: true }));
  assert.equal(first.status, 201);
  const second = await request(models, "POST", modelInput(provider.id, { modelId: "image-v2", displayName: "模型 B", isDefault: true, sortOrder: 2 }));
  assert.equal(second.status, 201);
  let all = (await request(models)).body.data.items;
  assert.equal(all.filter((m) => m.isDefault).length, 1);
  assert.equal(all.find((m) => m.id === first.body.data.id).revision, 2);
  const publicModels = await request("/api/v1/image-models", "GET", undefined, false);
  assert.deepEqual(Object.keys(publicModels.body.data.items[0]).sort(), ["displayName", "id", "maxImages", "providerName", "supportedRatios", "supportsReferenceImage"]);
  assert.equal(publicModels.body.data.items[0].supportsReferenceImage, false);
  assert.equal(publicModels.body.data.defaultModelId, second.body.data.id);
  assert.doesNotMatch(JSON.stringify(publicModels.body), /apiKey|encrypted|baseUrl|image-v/);
  const disabled = await request(`${models}/${second.body.data.id}`, "PATCH", { revision: 1, enabled: false });
  assert.equal(disabled.status, 200);
  const filtered = (await request("/api/v1/image-models", "GET", undefined, false)).body.data;
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.defaultModelId, first.body.data.id);
  assert.equal((await request(`${providers}/${provider.id}`, "DELETE", { revision: provider.revision })).status, 409);
  const disabledProvider = await request(`${providers}/${provider.id}`, "PATCH", { revision: provider.revision, enabled: false });
  provider = disabledProvider.body.data;
  assert.deepEqual((await request("/api/v1/image-models", "GET", undefined, false)).body.data, { items: [], defaultModelId: null });
  all = (await request(models)).body.data.items;
  for (const model of all) assert.equal((await request(`${models}/${model.id}`, "DELETE", { revision: model.revision })).status, 200);
  assert.equal((await request(`${providers}/${provider.id}`, "DELETE", { revision: provider.revision })).status, 200);
  assert.equal((await request(`${providers}/${provider.id}`, "PATCH", { revision: 1, name: "gone" })).status, 404);
  const audits = app.db.prepare("SELECT * FROM audit_logs WHERE entity_type IN ('image_provider', 'image_model')").all();
  assert.equal(audits.length, 10);
  assert.doesNotMatch(JSON.stringify(audits), /sk-provider-secret|encrypted_api_key|encryptedApiKey|v1\.[A-Za-z0-9_-]+\./);
});

test("admin validation rejects unknown fields, unsafe URLs, invalid model ranges and missing revisions", async (t) => {
  const { request } = await setup(t);
  for (const input of [{ ...providerInput, encryptedApiKey: "injected" }, { ...providerInput, baseUrl: "http://example.com" }, { ...providerInput, baseUrl: "https://127.0.0.1" }, { ...providerInput, generationPath: "//evil.example/path" }, { ...providerInput, editPath: "https://evil.example" }, { ...providerInput, timeoutMs: 9999 }, { ...providerInput, enabled: "true" }]) {
    assert.equal((await request(providers, "POST", input)).status, 422);
  }
  const provider = (await request(providers, "POST", providerInput)).body.data;
  assert.equal((await request(`${providers}/${provider.id}`, "PATCH", { name: "new" })).status, 422);
  assert.equal((await request(`${providers}/${provider.id}`, "DELETE", {})).status, 422);
  for (const input of [modelInput(provider.id, { maxImages: 5 }), modelInput(provider.id, { supportedRatios: ["8:8"] }), modelInput(provider.id, { providerId: "missing" }), modelInput(provider.id, { isDefault: 1 })]) {
    assert.equal((await request(models, "POST", input)).status, 422);
  }
});

test("missing master key permits redacted reads but fails key writes, connection tests and generation closed", async (t) => {
  const { app, request } = await setup(t, { imageConfigKey: "" });
  assert.equal((await request(providers)).status, 200);
  assert.equal((await request(providers, "POST", providerInput)).body.code, "image_service_unconfigured");
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM image_providers").get().count, 0);
  const store = createImageProviderStore(app.db);
  const provider = store.createProvider({ name: "Saved provider", baseUrl: providerInput.baseUrl, encryptedApiKey: createSecretBox(Buffer.alloc(32, 7)).encrypt(secret) });
  const model = store.createModel(modelInput(provider.id));
  const listed = (await request(providers)).body.data.items[0];
  assert.equal(listed.hasApiKey, true);
  assert.equal(listed.apiKeyHint, "****");
  assert.doesNotMatch(JSON.stringify(listed), /encrypted|sk-provider-secret/);
  assert.equal((await request(`${providers}/${provider.id}`, "PATCH", { revision: 1, name: "Metadata edit", apiKey: "" })).status, 200);
  const tested = await request(`${providers}/${provider.id}/test`, "POST", { revision: 2, modelRecordId: model.id });
  assert.equal(tested.status, 503);
  assert.equal(tested.body.code, "image_service_unconfigured");
});

test("connection tests record only normalized results and honor provider revisions", async (t) => {
  const { app, request } = await setup(t, { imageFetch: async () => new Response(JSON.stringify({ error: secret }), { status: 401 }) });
  const provider = (await request(providers, "POST", providerInput)).body.data;
  const model = (await request(models, "POST", modelInput(provider.id))).body.data;
  const result = await request(`${providers}/${provider.id}/test`, "POST", { revision: 1, modelRecordId: model.id });
  assert.equal(result.status, 502);
  assert.equal(result.body.code, "image_provider_auth_failed");
  assert.equal(result.body.title, "生图平台鉴权失败，请联系管理员。");
  assert.doesNotMatch(JSON.stringify(result.body), /sk-provider-secret/);
  const tested = (await request(providers)).body.data.items[0];
  assert.equal(tested.revision, 2);
  assert.equal(tested.lastTestStatus, "failed");
  assert.ok(tested.lastTestedAt);
  assert.equal((await request(`${providers}/${provider.id}/test`, "POST", { revision: 1, modelRecordId: model.id })).status, 409);
  assert.doesNotMatch(JSON.stringify(app.db.prepare("SELECT * FROM audit_logs").all()), /sk-provider-secret/);
});

test("explicit key replacement changes encrypted storage and successful tests persist a safe summary", async (t) => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const { app, request } = await setup(t, { imageFetch: async () => new Response(JSON.stringify({ data: [{ b64_json: png }] })) });
  const provider = (await request(providers, "POST", providerInput)).body.data;
  const replaced = await request(`${providers}/${provider.id}`, "PATCH", { revision: 1, apiKey: "sk-rotated-key-5678" });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.data.apiKeyHint, "****5678");
  const encrypted = app.db.prepare("SELECT encrypted_api_key FROM image_providers WHERE id = ?").get(provider.id).encrypted_api_key;
  assert.equal(createSecretBox(Buffer.alloc(32, 7)).decrypt(encrypted), "sk-rotated-key-5678");
  const model = (await request(models, "POST", modelInput(provider.id))).body.data;
  const tested = await request(`${providers}/${provider.id}/test`, "POST", { revision: 2, modelRecordId: model.id });
  assert.equal(tested.status, 200);
  assert.equal(tested.body.data.lastTestStatus, "success");
  assert.equal(tested.body.data.revision, 3);
  assert.doesNotMatch(JSON.stringify(tested.body), /b64_json|encrypted|sk-rotated/);
});

test("request logs redact secret-shaped path values", async (t) => {
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(String(value));
  t.after(() => { console.log = original; });
  const { request } = await setup(t, { logger: true });
  await request(`${providers}/${secret}`);
  assert.ok(logs.length);
  assert.doesNotMatch(logs.join("\n"), /sk-provider-secret-1234/);
});
