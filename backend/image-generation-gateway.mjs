import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { safeFetch } from "./safe-upstream.mjs";
import { HttpError } from "./validation.mjs";
import { inspectJpeg, inspectWebp, MAX_IMAGE_PIXELS } from "./image-structure.mjs";

const TTL_MS = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 60 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const SIZES = new Map([["1:1", "1024x1024"], ["16:9", "1792x1024"], ["9:16", "1024x1792"], ["4:3", "1536x1024"], ["3:4", "1024x1536"]]);
const ERRORS = {
  image_service_unconfigured: [503, "生图服务尚未配置，请联系管理员。"],
  image_model_unavailable: [503, "所选模型暂不可用，请选择其他模型。"],
  image_provider_auth_failed: [502, "生图平台鉴权失败，请联系管理员。"],
  image_provider_balance_insufficient: [402, "生图平台余额不足，请联系管理员充值或更换平台。"],
  image_provider_timeout: [504, "生图请求超时，请稍后重试。"],
  image_provider_rate_limited: [429, "生图平台请求过于频繁，请稍后重试。"],
  image_provider_incompatible: [502, "生图平台或请求格式不兼容，请调整参数或更换模型。"],
  image_reference_unsupported: [422, "图片平台未提供参考图编辑接口，请核对后台编辑路径或改选支持的模型。"],
  invalid_reference_image: [422, "参考图无效。请使用不超过 10MB 的 PNG、JPEG 或 WebP 图片。"],
  image_generation_failed: [502, "图片生成失败，请稍后重试。"]
};
const fail = (code) => new HttpError(ERRORS[code][0], code, ERRORS[code][1]);
const incompatible = () => fail("image_provider_incompatible");

// Only these literal messages may cross the server's 5xx privacy boundary.
export function imageErrorTitle(code) {
  return Object.hasOwn(ERRORS, code) ? ERRORS[code][1] : undefined;
}

function cancel(body) {
  // Do not let an unresponsive remote stream delay our deadline or byte limit.
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* already closed */ }
}

function abortable(operation, signal) {
  if (signal.aborted) return Promise.reject(fail("image_provider_timeout"));
  return new Promise((resolvePromise, reject) => {
    const onAbort = () => reject(fail("image_provider_timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(resolvePromise, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function readLimited(response, limit, signal) {
  if (Number(response.headers.get("content-length")) > limit) {
    cancel(response.body);
    throw incompatible();
  }
  if (!response.body) throw incompatible();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw incompatible();
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, length);
  } catch (error) {
    cancel(reader);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function inspectImage(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw incompatible();
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR") {
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw incompatible();
    let offset = 8, hasData = false, hasEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset + length + 12 > bytes.length) throw incompatible();
      if (type === "IDAT" && length) hasData = true;
      offset += length + 12;
      if (type === "IEND") { hasEnd = length === 0 && offset === bytes.length; break; }
    }
    if (!hasData || !hasEnd) throw incompatible();
    return { bytes, mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 32 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    try { inspectJpeg(bytes); } catch { throw incompatible(); }
    return { bytes, mimeType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)) && bytes.readUInt32LE(4) + 8 === bytes.length && bytes.readUInt32LE(16) > 0 && bytes.readUInt32LE(16) + 20 <= bytes.length) {
    try { inspectWebp(bytes); } catch { throw incompatible(); }
    return { bytes, mimeType: "image/webp", extension: "webp" };
  }
  throw incompatible();
}

function decodeImage(encoded) {
  if (typeof encoded !== "string" || !encoded.length || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw incompatible();
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw incompatible();
  return inspectImage(bytes);
}

async function checkStatus(response, signal, isReferenceEdit = false) {
  if (response.ok) return;
  let upstreamCode = "";
  if (response.status === 403) {
    try {
      const bytes = await readLimited(response, MAX_ERROR_BYTES, signal);
      upstreamCode = String(JSON.parse(bytes.toString("utf8"))?.code || "").toUpperCase();
    } catch { cancel(response.body); }
  } else cancel(response.body);
  const code = upstreamCode === "INSUFFICIENT_BALANCE" ? "image_provider_balance_insufficient"
    : [401, 403].includes(response.status) ? "image_provider_auth_failed"
    : response.status === 429 ? "image_provider_rate_limited"
    : [408, 504].includes(response.status) ? "image_provider_timeout"
    : response.status === 404 ? isReferenceEdit ? "image_reference_unsupported" : "image_model_unavailable"
    : [400, 405, 415, 422].includes(response.status) ? "image_provider_incompatible"
    : "image_generation_failed";
  throw fail(code);
}

export function createImageGenerationGateway({ store, secretBox, fetchImpl, retryDelay = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)), tempRoot = join(tmpdir(), "nikai-image-generations"), now = Date.now }) {
  const root = resolve(tempRoot);
  let cleanupPending;

  async function cleanupExpired() {
    if (cleanupPending) return cleanupPending;
    cleanupPending = (async () => {
      const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const entry of entries) {
        const match = /^nikai-generation-(\d+)-[0-9a-f-]{36}$/.exec(entry.name);
        if (entry.isDirectory() && match && Number(match[1]) <= Number(now())) {
          await rm(join(root, entry.name), { recursive: true, force: true });
        }
      }
    })();
    try { await cleanupPending; } finally { cleanupPending = undefined; }
  }

  const timer = setInterval(() => { cleanupExpired().catch(() => {}); }, 60_000);
  timer.unref();

  async function requestImages(input, testProviderId) {
    if (!secretBox) throw fail("image_service_unconfigured");
    const model = store.getModel(input?.modelRecordId);
    const provider = model && store.getProvider(model.providerId);
    const testing = testProviderId !== undefined;
    if (!model || !provider || (testing ? provider.id !== testProviderId : !model.enabled || !provider.enabled)) throw fail("image_model_unavailable");
    const ratio = testing ? model.supportedRatios.find((value) => SIZES.has(value)) : input.ratio;
    const prompt = testing ? "A simple blue circle on a white background." : input.prompt;
    const count = testing ? 1 : input.count;
    const style = testing ? "自动" : input.style ?? "自动";
    if (!SIZES.has(ratio) || !model.supportedRatios.includes(ratio) || !Number.isInteger(count) || count < 1 || count > Math.min(model.maxImages, 4) || typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000 || typeof style !== "string" || style.length > 100) throw incompatible();
    let key;
    try { key = secretBox.decrypt(provider.encryptedApiKey); } catch { throw fail("image_service_unconfigured"); }
    if (typeof key !== "string" || !key.trim()) throw fail("image_service_unconfigured");
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), Math.min(Math.max(Number(provider.timeoutMs) || 180000, 1), 180000));
    try {
      const hasReference = !testing && Boolean(input.referenceImage);
      if (hasReference && !provider.editPath) throw fail("image_reference_unsupported");
      const url = new URL(hasReference ? provider.editPath : provider.generationPath, provider.baseUrl);
      // An interface path must not move the decrypted key to another origin.
      if (url.origin !== new URL(provider.baseUrl).origin) throw fail("image_generation_failed");
      const effectivePrompt = style && style !== "自动" ? `${prompt}\n\n风格要求：${style}` : prompt;
      let body;
      let contentType;
      if (hasReference) {
        let reference;
        try { reference = inspectImage(input.referenceImage.bytes); } catch { throw fail("invalid_reference_image"); }
        if (reference.mimeType !== input.referenceImage.mimeType) throw fail("invalid_reference_image");
        const boundary = `----NikaiImageEdit${randomUUID().replaceAll("-", "")}`;
        const fields = { model: model.modelId, prompt: effectivePrompt, size: SIZES.get(ratio), n: String(count), response_format: "b64_json" };
        const chunks = [];
        for (const [name, value] of Object.entries(fields)) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference.${reference.extension}"\r\nContent-Type: ${reference.mimeType}\r\n\r\n`), reference.bytes, Buffer.from(`\r\n--${boundary}--\r\n`));
        body = Buffer.concat(chunks);
        contentType = `multipart/form-data; boundary=${boundary}`;
      } else {
        body = JSON.stringify({ model: model.modelId, prompt: effectivePrompt, size: SIZES.get(ratio), n: count, response_format: "b64_json" });
        contentType = "application/json";
      }
      const requestOptions = { fetchImpl, signal: controller.signal, method: "POST", headers: { "Content-Type": contentType, Authorization: `Bearer ${key}` }, body };
      let response;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          response = await abortable(safeFetch(url, requestOptions), controller.signal);
          break;
        } catch (error) {
          const transientTransportFailure = error?.message === "Upstream request failed";
          if (!transientTransportFailure || attempt === 3 || controller.signal.aborted) throw error;
          await abortable(retryDelay(250 * (2 ** attempt)), controller.signal);
        }
      }
      await checkStatus(response, controller.signal, hasReference);
      const bytes = await readLimited(response, MAX_JSON_BYTES, controller.signal);
      let payload;
      try { payload = JSON.parse(bytes.toString("utf8")); } catch { throw incompatible(); }
      if (!Array.isArray(payload?.data) || payload.data.length !== count) throw incompatible();
      const images = [];
      for (const item of payload.data) {
        if (typeof item?.b64_json === "string") images.push(decodeImage(item.b64_json));
        else if (typeof item?.url === "string" && item.url.length <= 8192) {
          const imageResponse = await abortable(safeFetch(item.url, { fetchImpl, signal: controller.signal }), controller.signal);
          await checkStatus(imageResponse, controller.signal);
          images.push(inspectImage(await readLimited(imageResponse, MAX_IMAGE_BYTES, controller.signal)));
        } else throw incompatible();
      }
      return images;
    } catch (error) {
      if (controller.signal.aborted) throw fail("image_provider_timeout");
      if (error instanceof HttpError && Object.hasOwn(ERRORS, error.code)) throw error;
      throw fail("image_generation_failed");
    } finally {
      clearTimeout(deadline);
    }
  }

  return {
    cleanupExpired,
    close() { clearInterval(timer); },
    async testProvider(providerId, modelId) {
      try {
        await requestImages({ modelRecordId: modelId }, providerId);
        return { ok: true };
      } catch (error) {
        if (error instanceof HttpError && Object.hasOwn(ERRORS, error.code)) throw error;
        throw fail("image_generation_failed");
      }
    },
    async generate(input) {
      let directory;
      try {
        await cleanupExpired();
        const decoded = await requestImages(input);
        const generationId = randomUUID();
        const expires = Number(now()) + TTL_MS;
        const expiresAt = new Date(expires).toISOString();
        await mkdir(root, { recursive: true, mode: 0o700 });
        directory = join(root, `nikai-generation-${expires}-${generationId}`);
        await mkdir(directory, { mode: 0o700 });
        const images = [];
        for (const image of decoded) {
          const id = randomUUID();
          const localPath = join(directory, `${id}.${image.extension}`);
          await writeFile(localPath, image.bytes, { flag: "wx", mode: 0o600 });
          images.push({ id, mimeType: image.mimeType, localPath, expiresAt });
        }
        return { generationId, images };
      } catch (error) {
        if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
        if (error instanceof HttpError && Object.hasOwn(ERRORS, error.code)) throw error;
        throw fail("image_generation_failed");
      }
    }
  };
}
