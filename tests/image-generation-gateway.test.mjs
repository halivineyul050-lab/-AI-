import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { getEventListeners } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { openDatabase } from "../backend/database.mjs";
import { createImageProviderStore } from "../backend/image-provider-store.mjs";
import { createSecretBox } from "../backend/image-provider-secrets.mjs";
import { createImageGenerationGateway } from "../backend/image-generation-gateway.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
// Real 2x2 encoder outputs exercise lossy WebP and multi-scan progressive JPEG.
const lossyWebp = Buffer.from("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=", "base64");
const progressiveJpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAAFBv/aAAwDAQACEAMQAAABigy4/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64");
const json = (response, body, status = 200) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};
const success = (request, response) => json(response, { data: [{ b64_json: png.toString("base64") }] });

async function setup(t, handler = success, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "nikai-gateway-test-"));
  const tempRoot = join(root, "results");
  const db = openDatabase(join(root, "test.db"));
  const store = createImageProviderStore(db);
  const secretBox = createSecretBox(Buffer.alloc(32, 9));
  const provider = store.createProvider({ name: "Local fixture", baseUrl: "https://93.184.216.34", encryptedApiKey: secretBox.encrypt("sk-private-fixture"), timeoutMs: 10000 });
  const model = store.createModel({ providerId: provider.id, modelId: "image-a", displayName: "A", supportedRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"], maxImages: 4 });
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(part);
    const body = Buffer.concat(parts);
    requests.push({ path: request.url, headers: request.headers, body: request.headers["content-type"]?.startsWith("application/json") ? JSON.parse(body.toString()) : body });
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let timestamp = Date.parse("2026-09-20T00:00:00Z");
  const gateway = createImageGenerationGateway({ store, secretBox, tempRoot, now: () => timestamp,
    fetchImpl: (url, init) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}${new URL(url).search}`, init), ...options });
  t.after(async () => {
    gateway.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    await rm(root, { recursive: true, force: true });
  });
  return { gateway, store, secretBox, provider, model, tempRoot, requests, advance: (ms) => { timestamp += ms; },
    generate: (input = {}) => gateway.generate({ modelRecordId: model.id, prompt: "a cat", ratio: "1:1", style: "自动", count: 1, ...input }) };
}

function hasCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    assert.doesNotMatch(JSON.stringify({ ...error, message: error.message, stack: error.stack }), /sk-private-fixture|private-upstream|b64_json|Authorization|Bearer/);
    return true;
  };
}

test("gateway sends the exact OpenAI body and authorization and saves randomized private PNG files", async (t) => {
  const f = await setup(t);
  const result = await f.generate();
  assert.deepEqual(f.requests[0].body, { model: "image-a", prompt: "a cat", size: "1024x1024", n: 1, response_format: "b64_json" });
  assert.equal(f.requests[0].path, "/v1/images/generations");
  assert.equal(f.requests[0].headers.authorization, "Bearer sk-private-fixture");
  assert.equal(result.images.length, 1);
  const image = result.images[0];
  assert.match(result.generationId, /^[0-9a-f-]{36}$/);
  assert.match(image.id, /^[0-9a-f-]{36}$/);
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.expiresAt, "2026-09-20T00:15:00.000Z");
  assert.ok(isAbsolute(image.localPath));
  assert.ok(!relative(f.tempRoot, image.localPath).startsWith(".."));
  assert.deepEqual(await readFile(image.localPath), png);
  assert.doesNotMatch(JSON.stringify(result), /sk-private-fixture|93\.184|b64_json/);
});

test("gateway maps all approved ratios and adds style without mutating caller input", async (t) => {
  const f = await setup(t);
  for (const [ratio, size] of [["1:1", "1024x1024"], ["16:9", "1792x1024"], ["9:16", "1024x1792"], ["4:3", "1536x1024"], ["3:4", "1024x1536"]]) {
    const input = Object.freeze({ modelRecordId: f.model.id, prompt: "a cat", ratio, style: "水彩", count: 1 });
    await f.gateway.generate(input);
    assert.equal(f.requests.at(-1).body.size, size);
    assert.equal(f.requests.at(-1).body.prompt, "a cat\n\n风格要求：水彩");
    assert.equal(input.prompt, "a cat");
  }
});

test("gateway sends validated reference images as multipart to the configured edit endpoint", async (t) => {
  const f = await setup(t);
  f.store.updateProvider(f.provider.id, { revision: 1, editPath: "/v1/images/edits" });
  const result = await f.generate({ referenceImage: { bytes: png, mimeType: "image/png", fileName: "ref.png" } });
  const request = f.requests[0];
  assert.equal(request.path, "/v1/images/edits");
  assert.equal(request.headers.authorization, "Bearer sk-private-fixture");
  assert.match(request.headers["content-type"], /^multipart\/form-data; boundary=/);
  assert.ok(request.body.includes(png));
  assert.match(request.body.toString("latin1"), /name="model"[\s\S]*image-a[\s\S]*name="image"; filename="reference\.png"[\s\S]*Content-Type: image\/png/);
  assert.equal(result.images.length, 1);
});

test("gateway rejects forged image MIME types and disabled reference edit paths before upstream calls", async (t) => {
  const forged = await setup(t);
  await assert.rejects(forged.generate({ referenceImage: { bytes: png, mimeType: "image/jpeg" } }), hasCode("invalid_reference_image"));
  assert.equal(forged.requests.length, 0);
  const disabled = await setup(t);
  disabled.store.updateProvider(disabled.provider.id, { revision: 1, editPath: "" });
  await assert.rejects(disabled.generate({ referenceImage: { bytes: png, mimeType: "image/png" } }), hasCode("image_reference_unsupported"));
  assert.equal(disabled.requests.length, 0);
});

test("gateway downloads URL images without forwarding provider credentials or signed URLs", async (t) => {
  const f = await setup(t, (request, response) => {
    if (request.url.startsWith("/file")) { response.writeHead(200, { "content-type": "text/plain" }); response.end(png); }
    else json(response, { data: [{ url: "https://93.184.216.34/file?secret=private-upstream" }] });
  });
  const result = await f.generate();
  assert.equal(f.requests[1].headers.authorization, undefined);
  assert.equal(result.images[0].mimeType, "image/png");
  assert.doesNotMatch(JSON.stringify(result), /secret=|private-upstream/);
});

test("gateway retries transient generation transport failures but does not retry HTTP responses", async (t) => {
  let attempts = 0;
  const f = await setup(t, success, { retryDelay: async () => {}, fetchImpl: async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("temporary reset");
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  await f.generate();
  assert.equal(attempts, 3);

  attempts = 0;
  const rejected = await setup(t, success, { retryDelay: async () => {}, fetchImpl: async () => {
    attempts += 1;
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(rejected.generate(), hasCode("image_provider_incompatible"));
  assert.equal(attempts, 1);
});

test("gateway rejects private image URLs and redirects before issuing a download", async (t) => {
  for (const redirect of [false, true]) {
    const f = await setup(t, (request, response) => {
      if (redirect) { response.writeHead(307, { location: "https://127.0.0.1/internal" }); response.end(); }
      else json(response, { data: [{ url: "http://127.0.0.1/internal" }] });
    });
    await assert.rejects(f.generate(), hasCode("image_generation_failed"));
    assert.equal(f.requests.length, 1);
  }
});

test("gateway maps upstream statuses to stable sanitized error codes", async (t) => {
  for (const [status, code] of [[401, "image_provider_auth_failed"], [403, "image_provider_auth_failed"], [429, "image_provider_rate_limited"], [404, "image_model_unavailable"], [400, "image_provider_incompatible"], [408, "image_provider_timeout"], [504, "image_provider_timeout"], [500, "image_generation_failed"]]) {
    const f = await setup(t, (request, response) => json(response, { error: "private-upstream sk-private-fixture" }, status));
    await assert.rejects(f.generate(), hasCode(code));
  }
});

test("gateway reports an explicit upstream insufficient-balance response as a payment error", async (t) => {
  const f = await setup(t, (request, response) => json(response, {
    code: "INSUFFICIENT_BALANCE",
    message: "private upstream account detail"
  }, 403));
  await assert.rejects(f.generate(), (error) => {
    assert.equal(error.status, 402);
    assert.equal(error.code, "image_provider_balance_insufficient");
    assert.equal(error.message, "生图平台余额不足，请联系管理员充值或更换平台。");
    assert.doesNotMatch(JSON.stringify(error), /private upstream account detail/);
    return true;
  });
});

test("gateway enforces deadline while waiting for headers and while reading body", async (t) => {
  for (const bodyStarted of [false, true]) {
    const f = await setup(t, (request, response) => { if (bodyStarted) { response.writeHead(200); response.write('{"data":'); } });
    const getProvider = f.store.getProvider.bind(f.store);
    t.mock.method(f.store, "getProvider", (id) => ({ ...getProvider(id), timeoutMs: 40 }));
    await assert.rejects(f.generate(), hasCode("image_provider_timeout"));
  }
});

test("gateway rejects malformed JSON, data shapes, base64 and image signatures", async (t) => {
  const fixtures = ["invalid private-upstream", {}, { data: [] }, { data: [{ b64_json: "???" }] }, { data: [{ b64_json: Buffer.from("<svg>private-upstream</svg>").toString("base64") }] }, { data: [{ b64_json: "iVBORw0KGgo=" }] }, { data: [{ url: 12 }] }];
  for (const fixture of fixtures) {
    const f = await setup(t, (request, response) => { if (typeof fixture === "string") response.end(fixture); else json(response, fixture); });
    await assert.rejects(f.generate(), hasCode("image_provider_incompatible"));
  }
});

test("gateway caps JSON and image response bytes even without content-length", async (t) => {
  for (const kind of ["json", "download", "base64"]) {
    const f = await setup(t, (request, response) => {
      if (kind === "json") response.end(" ".repeat(60 * 1024 * 1024 + 1));
      else if (request.url === "/file") response.end(Buffer.alloc(10 * 1024 * 1024 + 1));
      else json(response, { data: [kind === "download" ? { url: "https://93.184.216.34/file" } : { b64_json: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64") }] });
    });
    await assert.rejects(f.generate(), hasCode("image_provider_incompatible"));
  }
});

test("gateway validates enabled state, key configuration, ratios and count before upstream", async (t) => {
  const f = await setup(t);
  for (const input of [{ count: 0 }, { count: 5 }, { count: 1.5 }, { prompt: "" }, { prompt: "a".repeat(4001) }, { ratio: "2:1" }]) await assert.rejects(f.generate(input), hasCode("image_provider_incompatible"));
  f.store.updateModel(f.model.id, { revision: 1, enabled: false });
  await assert.rejects(f.generate(), hasCode("image_model_unavailable"));
  f.store.updateModel(f.model.id, { revision: 2, enabled: true, supportedRatios: ["1:1"], maxImages: 1 });
  await assert.rejects(f.generate({ ratio: "16:9" }), hasCode("image_provider_incompatible"));
  await assert.rejects(f.generate({ count: 2 }), hasCode("image_provider_incompatible"));
  f.store.updateProvider(f.provider.id, { revision: 1, enabled: false });
  await assert.rejects(f.generate(), hasCode("image_model_unavailable"));
  assert.equal(f.requests.length, 0);
  const unconfigured = await setup(t, success, { secretBox: null });
  await assert.rejects(unconfigured.generate(), hasCode("image_service_unconfigured"));
  await assert.rejects(unconfigured.gateway.testProvider(unconfigured.provider.id, unconfigured.model.id), hasCode("image_service_unconfigured"));
  const corrupt = await setup(t);
  corrupt.store.updateProvider(corrupt.provider.id, { revision: 1, encryptedApiKey: "bad-secret" });
  await assert.rejects(corrupt.generate(), hasCode("image_service_unconfigured"));
});

test("connection tests validate one image for disabled configuration without saving it", async (t) => {
  const f = await setup(t);
  f.store.updateProvider(f.provider.id, { revision: 1, enabled: false });
  f.store.updateModel(f.model.id, { revision: 1, enabled: false, supportedRatios: ["3:4"] });
  assert.deepEqual(await f.gateway.testProvider(f.provider.id, f.model.id), { ok: true });
  assert.equal(f.requests[0].body.n, 1);
  assert.equal(f.requests[0].body.size, "1024x1536");
  assert.deepEqual(await readdir(f.tempRoot).catch((e) => e.code === "ENOENT" ? [] : Promise.reject(e)), []);
  await assert.rejects(f.gateway.testProvider("different-provider", f.model.id), hasCode("image_model_unavailable"));
});

test("gateway expires its files after 15 minutes, preserves unrelated files, and cleans after restart", async (t) => {
  const f = await setup(t);
  const result = await f.generate();
  await writeFile(join(f.tempRoot, "unrelated.txt"), "keep");
  f.advance(14 * 60000);
  await f.gateway.cleanupExpired();
  assert.deepEqual(await readFile(result.images[0].localPath), png);
  f.advance(60000);
  const restarted = createImageGenerationGateway({ store: f.store, secretBox: f.secretBox, tempRoot: f.tempRoot, now: () => Date.parse("2026-09-20T00:15:00Z") });
  t.after(() => restarted.close());
  await restarted.cleanupExpired();
  await assert.rejects(readFile(result.images[0].localPath), { code: "ENOENT" });
  assert.equal(await readFile(join(f.tempRoot, "unrelated.txt"), "utf8"), "keep");
});

test("gateway rejects extra or broken images atomically without leaving partial results", async (t) => {
  for (const broken of [false, true]) {
    const f = await setup(t, (request, response) => json(response, { data: [{ b64_json: png.toString("base64") }, { b64_json: broken ? "invalid" : png.toString("base64") }] }));
    await assert.rejects(f.generate({ count: broken ? 2 : 1 }), hasCode("image_provider_incompatible"));
    assert.deepEqual(await readdir(f.tempRoot).catch((e) => e.code === "ENOENT" ? [] : Promise.reject(e)), []);
  }
});

test("gateway rejects truncated containers that merely carry an image signature", async (t) => {
  const webpHeader = Buffer.alloc(20);
  webpHeader.write("RIFF", 0);
  webpHeader.writeUInt32LE(12, 4);
  webpHeader.write("WEBPVP8 ", 8);
  for (const bytes of [png.subarray(0, 33), Buffer.from("ffd8ffd9", "hex"), webpHeader]) {
    const f = await setup(t, (request, response) => json(response, { data: [{ b64_json: bytes.toString("base64") }] }));
    await assert.rejects(f.generate(), hasCode("image_provider_incompatible"));
  }
});

test("gateway settles on timeout and removes its abort listener even when a transport stalls", async (t) => {
  let signal;
  const f = await setup(t, success, { fetchImpl: (url, init) => { signal = init.signal; return new Promise(() => {}); } });
  const getProvider = f.store.getProvider.bind(f.store);
  t.mock.method(f.store, "getProvider", (id) => ({ ...getProvider(id), timeoutMs: 25 }));
  await assert.rejects(f.generate(), hasCode("image_provider_timeout"));
  assert.ok(signal.aborted);
  assert.equal(getEventListeners(signal, "abort").length, 0);
});

test("gateway reaps expired files on its background timer without a new request", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = await setup(t);
  const result = await f.generate();
  f.advance(15 * 60000);
  t.mock.timers.tick(60000);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await assert.rejects(readFile(result.images[0].localPath), { code: "ENOENT" });
});

test("gateway blocks generation paths that would disclose credentials to another origin", async (t) => {
  const f = await setup(t);
  f.store.updateProvider(f.provider.id, { revision: 1, generationPath: "https://1.1.1.1/steal" });
  await assert.rejects(f.generate(), hasCode("image_generation_failed"));
  assert.equal(f.requests.length, 0);
});

test("gateway preserves JPEG and WebP bytes and derives their MIME from the signature", async (t) => {
  for (const [bytes, mime] of [
    [await readFile(new URL("../assets/tool-logos/gamma.jpg", import.meta.url)), "image/jpeg"],
    [await readFile(new URL("../assets/tool-logos/stability-stable-image.webp", import.meta.url)), "image/webp"],
    [await readFile(new URL("../assets/tool-logos/dashtoon-studio.webp", import.meta.url)), "image/webp"],
    [lossyWebp, "image/webp"], [progressiveJpeg, "image/jpeg"]
  ]) {
    const f = await setup(t, (request, response) => json(response, { data: [{ b64_json: bytes.toString("base64") }] }));
    const result = await f.generate();
    assert.equal(result.images[0].mimeType, mime);
    assert.deepEqual(await readFile(result.images[0].localPath), bytes);
  }
});

test("generation and connection tests reject fabricated or oversized JPEG and WebP data", async (t) => {
  const fakeJpeg = Buffer.alloc(32);
  fakeJpeg.set([0xff, 0xd8, 0xff]);
  fakeJpeg.set([0xff, 0xd9], 30);
  const fakeWebp = Buffer.alloc(30);
  fakeWebp.write("RIFF");
  fakeWebp.writeUInt32LE(22, 4);
  fakeWebp.write("WEBPVP8X", 8);
  fakeWebp.writeUInt32LE(10, 16);
  fakeWebp.writeUIntLE(16383, 24, 3);
  fakeWebp.writeUIntLE(16383, 27, 3);
  const jpeg = await readFile(new URL("../assets/tool-logos/gamma.jpg", import.meta.url));
  const oversizedJpeg = Buffer.from(jpeg);
  const frame = oversizedJpeg.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(frame > 0, "fixture must contain a baseline frame");
  oversizedJpeg.writeUInt16BE(16384, frame + 5);
  oversizedJpeg.writeUInt16BE(16384, frame + 7);
  // A real header and end marker with the compressed scan removed.
  const scan = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  assert.ok(scan > 0);
  const brokenJpeg = Buffer.concat([jpeg.subarray(0, scan + 2 + jpeg.readUInt16BE(scan + 2)), Buffer.from([0xff, 0xd9])]);
  const webp = await readFile(new URL("../assets/tool-logos/stability-stable-image.webp", import.meta.url));
  const brokenWebp = Buffer.from(webp);
  brokenWebp.fill(0, 30);
  const oversizedWebp = Buffer.from(webp);
  oversizedWebp.writeUIntLE(16383, 24, 3);
  oversizedWebp.writeUIntLE(16383, 27, 3);
  const losslessFrame = oversizedWebp.indexOf("VP8L");
  assert.ok(losslessFrame > 0, "fixture must contain a lossless frame");
  const dimensionBits = oversizedWebp.readUInt32LE(losslessFrame + 9);
  oversizedWebp.writeUInt32LE(((dimensionBits & 0xf0000000) | 16383 | (16383 << 14)) >>> 0, losslessFrame + 9);
  const oversizedLossy = Buffer.from(lossyWebp);
  oversizedLossy.writeUInt16LE(8192, 26);
  oversizedLossy.writeUInt16LE(8192, 28);
  const oversizedLossless = Buffer.from(await readFile(new URL("../assets/tool-logos/dashtoon-studio.webp", import.meta.url)));
  oversizedLossless.writeUInt32LE((16383 | (16383 << 14)) >>> 0, 21);
  const brokenChunk = Buffer.from(lossyWebp);
  brokenChunk.writeUInt32LE(1000, 16);
  const brokenPartition = Buffer.from(lossyWebp);
  brokenPartition.writeUIntLE(0xfffff0, 20, 3);
  const brokenSegment = Buffer.from(jpeg);
  brokenSegment.writeUInt16BE(65535, frame + 2);
  for (const bytes of [fakeJpeg, fakeWebp, oversizedJpeg, oversizedWebp, oversizedLossy, oversizedLossless, brokenJpeg, brokenWebp, brokenChunk, brokenPartition, brokenSegment]) {
    for (const download of [false, true]) {
      const f = await setup(t, (request, response) => {
        if (request.url === "/file") response.end(bytes);
        else json(response, { data: [download ? { url: "https://93.184.216.34/file" } : { b64_json: bytes.toString("base64") }] });
      });
      await assert.rejects(f.generate(), hasCode("image_provider_incompatible"));
      await assert.rejects(f.gateway.testProvider(f.provider.id, f.model.id), hasCode("image_provider_incompatible"));
      assert.deepEqual(await readdir(f.tempRoot).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error)), []);
    }
  }
});

test("connection test normalizes database lookup failures without exposing internals", async (t) => {
  const f = await setup(t);
  t.mock.method(f.store, "getModel", () => { throw new Error("private-upstream"); });
  await assert.rejects(f.gateway.testProvider(f.provider.id, f.model.id), hasCode("image_generation_failed"));
});
