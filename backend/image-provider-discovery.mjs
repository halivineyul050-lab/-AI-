import { safeFetch } from "./safe-upstream.mjs";
import { HttpError } from "./validation.mjs";

const MAX_MODELS_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const IMAGE_MODEL_MARKERS = ["image", "dall", "flux", "imagen", "seedream", "gpt-image", "sdxl", "stable-diffusion"];

function failure(status, code, title) {
  return new HttpError(status, code, title);
}

async function readErrorCode(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ERROR_BYTES) return "";
      chunks.push(Buffer.from(value));
    }
    return String(JSON.parse(Buffer.concat(chunks, length).toString("utf8"))?.code || "").toUpperCase();
  } catch { return ""; }
  finally { try { await reader.cancel(); } catch { /* already closed */ } reader.releaseLock(); }
}

async function checkStatus(response) {
  if (response.ok) return;
  if (response.status === 403 && await readErrorCode(response) === "INSUFFICIENT_BALANCE") {
    throw failure(402, "image_provider_balance_insufficient", "生图平台余额不足，请联系管理员充值或更换平台。");
  }
  if ([401, 403].includes(response.status)) throw failure(502, "image_provider_auth_failed", "生图平台鉴权失败，请联系管理员。");
  if (response.status === 429) throw failure(429, "image_provider_rate_limited", "生图平台请求过于频繁，请稍后重试。");
  if ([408, 504].includes(response.status)) throw failure(504, "image_provider_timeout", "生图请求超时，请稍后重试。");
  if ([400, 404, 405, 415, 422].includes(response.status)) throw failure(502, "image_provider_incompatible", "平台未开放模型列表，请手工添加模型。");
  throw failure(502, "image_generation_failed", "图片模型同步失败，请稍后重试。");
}

function normalizeItems(payload) {
  const input = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set();
  const items = [];
  for (const entry of input) {
    const modelId = (typeof entry === "string" ? entry : typeof entry?.id === "string" ? entry.id : "").trim();
    if (!modelId || modelId.length > 191 || seen.has(modelId)) continue;
    seen.add(modelId);
    const lowered = modelId.toLowerCase();
    items.push({ modelId, displayName: modelId, imageLikely: IMAGE_MODEL_MARKERS.some((marker) => lowered.includes(marker)) });
  }
  return items;
}

export function createImageProviderDiscovery({ store, secretBox, fetchImpl }) {
  return {
    async discover(providerId) {
      const provider = store.getProvider(providerId);
      if (!provider) throw failure(404, "image_config_not_found", "平台不存在");
      if (!secretBox) throw failure(503, "image_service_unconfigured", "生图服务尚未配置，请联系管理员。");
      let key;
      try { key = secretBox.decrypt(provider.encryptedApiKey); } catch { throw failure(503, "image_service_unconfigured", "生图服务尚未配置，请联系管理员。"); }
      if (typeof key !== "string" || !key.trim()) throw failure(503, "image_service_unconfigured", "生图服务尚未配置，请联系管理员。");
      const url = new URL("/v1/models", provider.baseUrl);
      if (url.origin !== new URL(provider.baseUrl).origin) throw failure(502, "image_generation_failed", "图片模型同步失败，请稍后重试。");
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), Math.min(Math.max(Number(provider.timeoutMs) || 60000, 1), 300000));
      try {
        const response = await safeFetch(url, { fetchImpl, signal: controller.signal, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
        await checkStatus(response);
        if (Number(response.headers.get("content-length")) > MAX_MODELS_BYTES) throw failure(502, "image_provider_incompatible", "平台模型列表格式不兼容。");
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_MODELS_BYTES) throw failure(502, "image_provider_incompatible", "平台模型列表格式不兼容。");
        let payload;
        try { payload = JSON.parse(bytes.toString("utf8")); } catch { throw failure(502, "image_provider_incompatible", "平台模型列表格式不兼容。"); }
        return { items: normalizeItems(payload) };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (controller.signal.aborted) throw failure(504, "image_provider_timeout", "生图请求超时，请稍后重试。");
        throw failure(502, "image_generation_failed", "图片模型同步失败，请稍后重试。");
      } finally {
        clearTimeout(deadline);
      }
    }
  };
}
