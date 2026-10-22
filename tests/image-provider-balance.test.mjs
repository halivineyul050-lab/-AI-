import assert from "node:assert/strict";
import { test } from "node:test";
import { createSecretBox } from "../backend/image-provider-secrets.mjs";
import { createImageProviderBalance } from "../backend/image-provider-balance.mjs";

const provider = {
  id: "provider-1",
  baseUrl: "https://93.184.216.34/v1",
  encryptedApiKey: createSecretBox(Buffer.alloc(32, 7)).encrypt("provider-secret"),
  timeoutMs: 10000,
  balancePath: "/account/balance",
  balanceValueField: "data.remaining",
  balanceCurrencyField: "data.currency"
};
const store = (value = provider) => ({ getProvider: () => value });
const secretBox = createSecretBox(Buffer.alloc(32, 7));

test("balance lookup uses the saved provider bearer key and returns only normalized balance fields", async () => {
  let request;
  const service = createImageProviderBalance({
    store: store(),
    secretBox,
    now: () => new Date("2026-09-28T01:02:03.000Z"),
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return new Response(JSON.stringify({ data: { remaining: "12.75", currency: "USD" } }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await service.query("provider-1");
  assert.deepEqual(result, { balance: 12.75, currency: "USD", checkedAt: "2026-09-28T01:02:03.000Z" });
  assert.equal(request.url.origin, "https://93.184.216.34");
  assert.equal(request.url.pathname, "/account/balance");
  assert.equal(request.options.headers.get("authorization"), "Bearer provider-secret");
});

test("balance lookup rejects an unconfigured endpoint without making an upstream request", async () => {
  let calls = 0;
  const service = createImageProviderBalance({
    store: store({ ...provider, balancePath: "" }),
    secretBox,
    fetchImpl: async () => { calls += 1; return new Response("{}"); }
  });

  await assert.rejects(service.query("provider-1"), { code: "image_balance_unconfigured" });
  assert.equal(calls, 0);
});

test("balance lookup rejects unsafe paths, non-numeric balances, and non-success responses without leaking upstream data", async () => {
  const unsafe = createImageProviderBalance({
    store: store({ ...provider, balancePath: "//internal.example/private" }),
    secretBox,
    fetchImpl: async () => new Response("{}")
  });
  await assert.rejects(unsafe.query("provider-1"), { code: "image_balance_invalid_config" });

  const invalidValue = createImageProviderBalance({
    store: store(), secretBox,
    fetchImpl: async () => new Response(JSON.stringify({ data: { remaining: "not-money", currency: "USD" } }), { headers: { "content-type": "application/json" } })
  });
  await assert.rejects(invalidValue.query("provider-1"), { code: "image_balance_invalid_response" });

  const forbidden = createImageProviderBalance({
    store: store(), secretBox,
    fetchImpl: async () => new Response(JSON.stringify({ error: "provider-secret-echo" }), { status: 403, headers: { "content-type": "application/json" } })
  });
  await assert.rejects(forbidden.query("provider-1"), (error) => {
    assert.equal(error.code, "image_balance_auth_failed");
    assert.doesNotMatch(error.message, /provider-secret-echo/);
    return true;
  });
});

test("balance lookup reports malformed response and provider timeout with safe errors", async () => {
  const html = createImageProviderBalance({
    store: store(), secretBox,
    fetchImpl: async () => new Response("<html>secret details</html>", { headers: { "content-type": "text/html" } })
  });
  await assert.rejects(html.query("provider-1"), (error) => {
    assert.equal(error.code, "image_balance_invalid_response");
    assert.doesNotMatch(error.message, /secret details/);
    return true;
  });

  const timeout = createImageProviderBalance({
    store: store({ ...provider, timeoutMs: 1001 }), secretBox,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })
  });
  await assert.rejects(timeout.query("provider-1"), { code: "image_balance_timeout" });
});

test("balance lookup preserves a finite negative balance and accepts the application's numeric clock", async () => {
  const service = createImageProviderBalance({
    store: store(),
    secretBox,
    now: () => Date.parse("2026-09-28T01:02:03.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({ data: { remaining: "-0.75", currency: "usd" } }), {
      headers: { "content-type": "application/json" }
    })
  });
  assert.deepEqual(await service.query("provider-1"), {
    balance: -0.75,
    currency: "USD",
    checkedAt: "2026-09-28T01:02:03.000Z"
  });
});
