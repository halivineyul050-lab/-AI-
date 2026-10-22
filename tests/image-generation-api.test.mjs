import { createCreditStore } from '../backend/credits.mjs';
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Readable } from "node:stream";
import { randomUUID } from 'node:crypto';
import { buildApplication } from "../server.mjs";
import { createImageProviderStore } from "../backend/image-provider-store.mjs";
import { createSecretBox } from "../backend/image-provider-secrets.mjs";
import { registerUser } from "../backend/auth.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
test('async generation returns before the provider and polls once without replaying it', async (t) => {
  let release;
  let calls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = await setup(t, { imageFetch: async () => { calls++; await waiting; return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })); } });
  const submitted = await f.generate({}, { signal: AbortSignal.timeout(1000), headers: { Prefer: 'respond-async' } }).catch(error => { release?.(); throw error; });
  assert.equal(submitted.status, 202);
  const { jobId } = (await submitted.json()).data;
  const path = `${f.baseUrl}/api/v1/image-generation-jobs/${jobId}`;
  assert.equal((await fetch(path)).status, 401);
  const email = `${randomUUID()}@example.com`;
  const other = await registerUser(f.app.db, { displayName: '其他用户', email, normalizedEmail: email, password: 'correct-horse-battery', consentVersion: '2026-09' });
  assert.equal((await fetch(path, { headers: { Cookie: `nikai_auth=${other.token}` } })).status, 404);
  assert.equal((await fetch(path, { headers: { Cookie: f.cookie } })).status, 202);
  release();
  let result;
  for (let i = 0; i < 30; i++) {
    result = await fetch(path, { headers: { Cookie: f.cookie } });
    if (result.status !== 202) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(result.status, 200);
  assert.equal((await result.json()).data.images.length, 1);
  assert.equal(calls, 1);
});

test('async provider failures retain their safe status and title', async (t) => {
  const f = await setup(t, { imageFetch: async () => new Response('private', { status: 504 }) });
  const submitted = await f.generate({}, { headers: { Prefer: 'respond-async' } });
  assert.equal(submitted.status, 202);
  const { jobId } = (await submitted.json()).data;
  let result;
  for (let i = 0; i < 30; i++) {
    result = await fetch(`${f.baseUrl}/api/v1/image-generation-jobs/${jobId}`, { headers: { Cookie: f.cookie } });
    if (result.status !== 202) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(result.status, 504);
  assert.equal((await result.json()).code, 'image_provider_timeout');
});
async function setup(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "image-gen-api-"));
  const key = Buffer.alloc(32, 9);
  const upstreamRequests = [];
  const app = buildApplication({ dbPath: join(root, "test.db"), staticDir: root, autoSeed: false, environment: "test", logger: false, adminToken: "token", imageConfigKey: key, imageTempRoot: join(root, "images"), imageFetch: async (url, init) => { upstreamRequests.push({ url: String(url), headers: init.headers, body: init.body }); const count = typeof init.body === "string" ? JSON.parse(init.body).n : Number(init.body.toString().match(/name="n"\r\n\r\n(\d+)/)?.[1] || 1); return new Response(JSON.stringify({ data: Array.from({ length: count }, () => ({ b64_json: png.toString("base64") })) })); }, ...options });
  const store = createImageProviderStore(app.db);
  const provider = store.createProvider({ name: "Provider", baseUrl: "https://93.184.216.34", encryptedApiKey: createSecretBox(key).encrypt("sk-private-api-secret") });
  const model = store.createModel({ providerId: provider.id, modelId: "private-model", displayName: "Model", supportedRatios: ["1:1"], maxImages: options.modelMaxImages ?? 1 });
  const email = `${randomUUID()}@example.com`;
  const { token, user: creditUser } = await registerUser(app.db, { displayName: '测试用户', email, normalizedEmail: email, password: 'correct-horse-battery', consentVersion: '2026-09' });
  const billing = createCreditStore(app.db);
  const [creditCode] = billing.createCodes({credits:10000});
  billing.redeem(creditUser.id, creditCode.code);
  const cookie = `nikai_auth=${token}`;
  const address = await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const generate = (input = {}, options = {}) => fetch(`${baseUrl}/api/v1/image-generations`, { method: "POST", body: JSON.stringify({ modelRecordId: model.id, prompt: "A blue bird", ratio: "1:1", count: 1, style: "自动", ...input }), ...options, headers: { "Content-Type": "application/json", ...options.headers, Cookie: cookie } });
  const generateReference = async (file = png, mimeType = "image/png") => {
    const form = new FormData();
    form.set("modelRecordId", model.id); form.set("prompt", "A blue bird"); form.set("ratio", "1:1"); form.set("style", "自动"); form.set("count", "1");
    form.set("referenceImage", new Blob([file], { type: mimeType }), "reference.png");
    return fetch(`${baseUrl}/api/v1/image-generations`, { method: "POST", headers: { Cookie: cookie }, body: form });
  };
  return { app, store, provider, model, baseUrl, cookie, generate, generateReference, upstreamRequests };
}

test("generation saves account cloud images and serves only the owner", async (t) => {
  const { baseUrl, generate, cookie } = await setup(t);
  const response = await generate();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /localPath|93\.184|private-model|sk-private|b64_json/);
  assert.equal(body.data.images.length, 1);
  const image = body.data.images[0];
  assert.deepEqual(Object.keys(image).sort(), ["expiresAt", "id", "mimeType", "url"]);
  assert.equal(body.data.historySaved, true);
  assert.equal(image.expiresAt, null);
  assert.equal(image.url, `/api/v1/image-history/${image.id}/image`);
  const result = await fetch(`${baseUrl}${image.url}`, { headers: { Cookie: cookie } });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "image/png");
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), png);
  assert.equal((await fetch(`${baseUrl}${image.url}`)).status, 401);
  assert.equal((await fetch(`${baseUrl}${image.url.replace(image.id, "00000000-0000-0000-0000-000000000000")}`, { headers: { Cookie: cookie } })).status, 404);
});

test("saved images remain available after temporary files expire", async (t) => {
  const { baseUrl, generate, cookie } = await setup(t, { imageNow: () => Date.now() - 16 * 60_000 });
  const response = await generate();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal((await fetch(`${baseUrl}${result.data.images[0].url}`, { headers: { Cookie: cookie } })).status, 200);
});

test('cloud history is private, paginated and manually removable', async (t) => {
  const { app, baseUrl, cookie, generate } = await setup(t);
  const first = (await (await generate()).json()).data.images[0];
  const second = (await (await generate()).json()).data.images[0];
  const email = `${randomUUID()}@example.com`;
  const other = await registerUser(app.db, { displayName: '另一位', email, normalizedEmail: email, password: 'correct-horse-battery', consentVersion: '2026-09' });
  const otherCookie = `nikai_auth=${other.token}`;
  const list = async (path, session = cookie) => fetch(`${baseUrl}${path}`, { headers: { Cookie: session } });
  assert.equal((await (await list('/api/v1/image-history', otherCookie)).json()).data.total, 0);
  assert.equal((await list(first.url, otherCookie)).status, 404);
  const firstPage = (await (await list('/api/v1/image-history?limit=1')).json()).data;
  assert.equal(firstPage.total, 2);
  assert.ok(firstPage.nextCursor);
  const nextPage = (await (await list(`/api/v1/image-history?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`)).json()).data;
  assert.equal(nextPage.items.length, 1);
  assert.notEqual(firstPage.items[0].id, nextPage.items[0].id);
  assert.equal((await fetch(`${baseUrl}/api/v1/image-history/${first.id}`, { method: 'DELETE', headers: { Cookie: otherCookie } })).status, 200);
  assert.equal((await list(first.url)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/image-history/${first.id}`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await list(first.url)).status, 404);
  const cleared = await fetch(`${baseUrl}/api/v1/image-history`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal((await cleared.json()).data.cleared, 1);
  assert.equal((await list(second.url)).status, 404);
});

test("generation validates fields and bounds and safely forwards an uploaded reference image", async (t) => {
  const { baseUrl, cookie, generate, generateReference, upstreamRequests } = await setup(t);
  for (const input of [{ count: 0 }, { count: 2 }, { ratio: "16:9" }, { prompt: " " }, { prompt: "a".repeat(4001) }, { style: "a".repeat(101) }, { apiKey: "injected" }, { count: "1" }]) {
    const response = await generate(input);
    assert.equal(response.status, 422);
  }
  assert.equal((await generate({ prompt: "a".repeat(70_000) })).status, 413);
  const reference = await generate({ referenceImage: "data:image/png;base64,AA==" });
  assert.equal(reference.status, 422);
  assert.equal((await reference.json()).code, "image_reference_unsupported");
  const multipart = await generateReference();
  assert.equal(multipart.status, 200);
  assert.match(upstreamRequests[0].url, /\/v1\/images\/edits$/);
  assert.match(new Headers(upstreamRequests[0].headers).get("content-type"), /^multipart\/form-data; boundary=/);
  const bytes = Buffer.from(upstreamRequests[0].body);
  assert.ok(bytes.includes(png));
  assert.match(bytes.toString("latin1", 0, bytes.indexOf(png)), /name="model"[\s\S]*private-model[\s\S]*name="image"; filename="reference\.png"/);
  const invalidImage = await generateReference(Buffer.from("not an image"));
  assert.equal(invalidImage.status, 422);
  assert.equal((await invalidImage.json()).code, "invalid_reference_image");
  assert.equal((await fetch(`${baseUrl}/api/v1/image-generations`, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x", Cookie: cookie }, body: "a".repeat(70_000) })).status, 400);
  assert.equal((await generate({}, { headers: { "Content-Type": "text/plain" } })).status, 415);
});

test("generation rate limit charges by requested image count", async (t) => {
  const { generate, upstreamRequests } = await setup(t, { modelMaxImages: 4 });
  for (let index = 0; index < 5; index += 1) {
    const response = await generate({ count: 4 });
    assert.equal(response.status, 200);
  }
  const limited = await generate({ count: 1 });
  assert.equal(limited.status, 429);
  assert.equal(upstreamRequests.length, 5);
});

test("generation rechecks enabled models and fails closed without a master key", async (t) => {
  const { store, model, generate } = await setup(t);
  store.updateModel(model.id, { revision: 1, enabled: false });
  const unavailable = await (await generate()).json();
  assert.equal(unavailable.code, "image_model_unavailable");
  assert.equal(unavailable.title, "所选模型暂不可用，请选择其他模型。");
  const missing = await setup(t, { imageConfigKey: "" });
  const unconfigured = await (await missing.generate()).json();
  assert.equal(unconfigured.code, "image_service_unconfigured");
  assert.equal(unconfigured.title, "生图服务尚未配置，请联系管理员。");
});

test("generation errors expose actionable fixed titles without upstream details", async (t) => {
  for (const [status, code, title] of [
    [401, "image_provider_auth_failed", "生图平台鉴权失败，请联系管理员。"],
    [504, "image_provider_timeout", "生图请求超时，请稍后重试。"],
    [429, "image_provider_rate_limited", "生图平台请求过于频繁，请稍后重试。"],
    [400, "image_provider_incompatible", "生图平台或请求格式不兼容，请调整参数或更换模型。"],
    [500, "image_generation_failed", "图片生成失败，请稍后重试。"]
  ]) {
    const f = await setup(t, { imageFetch: async () => new Response('private-upstream sk-private-api-secret', { status }) });
    const body = await (await f.generate()).json();
    assert.equal(body.code, code);
    assert.equal(body.title, title);
    assert.doesNotMatch(JSON.stringify(body), /private-upstream|sk-private/);
  }
});

test("generation exposes a safe actionable title when the upstream account has no balance", async (t) => {
  const f = await setup(t, {
    imageFetch: async () => new Response(JSON.stringify({ code: "INSUFFICIENT_BALANCE", message: "private billing detail" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    })
  });
  const response = await f.generate();
  const body = await response.json();
  assert.equal(response.status, 402);
  assert.equal(body.code, "image_provider_balance_insufficient");
  assert.equal(body.title, "生图平台余额不足，请联系管理员充值或更换平台。");
  assert.doesNotMatch(JSON.stringify(body), /private billing detail/);
});

test("unknown server failures retain a generic title and hide raw details", async (t) => {
  const { app, baseUrl } = await setup(t);
  t.mock.method(app.db, "prepare", () => { throw new Error("private-database-password"); });
  const response = await fetch(`${baseUrl}/api/v1/image-models`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.title, "服务暂时不可用");
  assert.doesNotMatch(JSON.stringify(body), /private-database/);
});

test("chunked JSON and multipart uploads receive bounded errors without resetting the connection", async (t) => {
  const { baseUrl, cookie } = await setup(t);
  for (const [type, parts] of [["application/json", [Buffer.alloc(40_000, 97), Buffer.alloc(40_000, 97)]], ["multipart/form-data; boundary=x", [Buffer.alloc(6 * 1024 * 1024, 97), Buffer.alloc(5 * 1024 * 1024, 97)] ]]) {
    const response = await fetch(`${baseUrl}/api/v1/image-generations`, { method: "POST", headers: { "Content-Type": type, Cookie: cookie }, body: Readable.from(parts), duplex: "half" });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "payload_too_large");
  }
});
