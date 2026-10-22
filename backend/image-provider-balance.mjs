import { safeFetch } from "./safe-upstream.mjs";
import { HttpError } from "./validation.mjs";

const MAX_BALANCE_BYTES = 64 * 1024;
const FIELD_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function failure(status, code, message) {
  return new HttpError(status, code, message);
}

function validFieldPath(value, { optional = false } = {}) {
  if (optional && value === "") return true;
  return typeof value === "string" && value.length <= 512 && value.split(".").every((part) => FIELD_SEGMENT.test(part)
    && !["__proto__", "prototype", "constructor"].includes(part));
}

function readField(object, path) {
  let current = object;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

async function readJsonBounded(response) {
  if (!response.body) throw failure(502, "image_balance_invalid_response", "平台余额接口未返回 JSON 数据。");
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BALANCE_BYTES) {
    await response.body.cancel().catch(() => {});
    throw failure(502, "image_balance_invalid_response", "平台余额响应过大。");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BALANCE_BYTES) {
        await reader.cancel().catch(() => {});
        throw failure(502, "image_balance_invalid_response", "平台余额响应过大。");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid JSON object");
    return parsed;
  } catch {
    throw failure(502, "image_balance_invalid_response", "平台余额响应格式不正确。");
  }
}

function numericBalance(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || /^\s*$/.test(value) || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createImageProviderBalance({ store, secretBox, fetchImpl, now = () => new Date() }) {
  return {
    async query(providerId) {
      const provider = store.getProvider(providerId);
      if (!provider) throw failure(404, "image_config_not_found", "平台不存在。");
      if (!provider.balancePath) throw failure(409, "image_balance_unconfigured", "尚未配置余额查询接口。");
      if (!/^\/(?!\/)[A-Za-z0-9/_-]{1,511}$/.test(provider.balancePath)
        || !validFieldPath(provider.balanceValueField)
        || !validFieldPath(provider.balanceCurrencyField, { optional: true })) {
        throw failure(422, "image_balance_invalid_config", "余额接口配置无效，请检查查询路径和 JSON 字段。");
      }
      if (!secretBox) throw failure(503, "image_service_unconfigured", "生图服务尚未配置，请联系管理员。");

      let key;
      try { key = secretBox.decrypt(provider.encryptedApiKey); }
      catch { throw failure(503, "image_service_unconfigured", "生图平台密钥不可用，请联系管理员。"); }
      if (typeof key !== "string" || !key.trim()) throw failure(503, "image_service_unconfigured", "生图平台密钥不可用，请联系管理员。");

      let target;
      try {
        const base = new URL(provider.baseUrl);
        target = new URL(provider.balancePath, base);
        if (base.protocol !== "https:" || target.origin !== base.origin || target.username || target.password
          || target.search || target.hash) throw new Error("unsafe URL");
      } catch {
        throw failure(422, "image_balance_invalid_config", "余额查询地址必须是平台自身的 HTTPS 站内路径。");
      }

      const controller = new AbortController();
      const timeoutMs = Math.min(Math.max(Number(provider.timeoutMs) || 60000, 1000), 30000);
      const deadline = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        try {
          response = await safeFetch(target, {
            fetchImpl,
            signal: controller.signal,
            headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
          });
        } catch {
          if (controller.signal.aborted) throw failure(504, "image_balance_timeout", "余额查询超时，请稍后重试。");
          throw failure(502, "image_balance_unavailable", "暂时无法连接生图平台的余额接口。");
        }
        if ([401, 403].includes(response.status)) {
          await response.body?.cancel().catch(() => {});
          throw failure(502, "image_balance_auth_failed", "余额接口鉴权失败，请检查平台 API Key 和查询权限。");
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw failure(502, "image_balance_upstream_failed", `余额接口返回 HTTP ${response.status}。`);
        }
        if (!/^application\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get("content-type") || "")) {
          await response.body?.cancel().catch(() => {});
          throw failure(502, "image_balance_invalid_response", "平台余额接口没有返回 JSON。");
        }
        const payload = await readJsonBounded(response);
        const balance = numericBalance(readField(payload, provider.balanceValueField));
        if (balance === null) throw failure(502, "image_balance_invalid_response", "平台响应中未找到有效余额，请检查余额字段配置。");
        const rawCurrency = provider.balanceCurrencyField ? readField(payload, provider.balanceCurrencyField) : "";
        const currency = typeof rawCurrency === "string" && /^[A-Za-z0-9_-]{1,12}$/.test(rawCurrency.trim())
          ? rawCurrency.trim().toUpperCase()
          : "";
        const currentTime = now();
        return { balance, currency, checkedAt: (currentTime instanceof Date ? currentTime : new Date(currentTime)).toISOString() };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (controller.signal.aborted) throw failure(504, "image_balance_timeout", "余额查询超时，请稍后重试。");
        throw failure(502, "image_balance_unavailable", "暂时无法读取平台余额。");
      } finally {
        clearTimeout(deadline);
      }
    }
  };
}
