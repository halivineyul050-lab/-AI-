import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageProviderDiscovery } from "../backend/image-provider-discovery.mjs";

const secret = "sk-discovery-secret";
const provider = {
  id: "provider-1",
  baseUrl: "https://93.184.216.34",
  encryptedApiKey: "encrypted"
};

function createDiscovery(payload, status = 200) {
  const requests = [];
  const discovery = createImageProviderDiscovery({
    store: { getProvider: (id) => id === provider.id ? provider : null },
    secretBox: { decrypt: (value) => value === "encrypted" ? secret : "" },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    }
  });
  return { discovery, requests };
}

test("provider discovery normalizes, deduplicates and marks image-looking model ids", async () => {
  const fixture = createDiscovery({ data: [
    { id: "gpt-image-live" },
    { id: "gpt-5.5" },
    "flux-pro",
    { id: "gpt-image-live" },
    { id: "" },
    null
  ] });

  assert.deepEqual(await fixture.discovery.discover(provider.id), { items: [
    { modelId: "gpt-image-live", displayName: "gpt-image-live", imageLikely: true },
    { modelId: "gpt-5.5", displayName: "gpt-5.5", imageLikely: false },
    { modelId: "flux-pro", displayName: "flux-pro", imageLikely: true }
  ] });
  assert.equal(new URL(fixture.requests[0].url).pathname, "/v1/models");
  assert.equal(new Headers(fixture.requests[0].init.headers).get("authorization"), `Bearer ${secret}`);
});

test("provider discovery accepts direct arrays and never fabricates default models", async () => {
  for (const payload of [[], { data: [] }, [{ id: "imagen-3" }]]) {
    const fixture = createDiscovery(payload);
    const result = await fixture.discovery.discover(provider.id);
    assert.deepEqual(result.items, payload.length ? [{ modelId: "imagen-3", displayName: "imagen-3", imageLikely: true }] : []);
  }
});

test("provider discovery returns stable safe errors", async () => {
  const missing = createDiscovery({ data: [] }).discovery;
  await assert.rejects(() => missing.discover("missing"), (error) => error.status === 404 && error.code === "image_config_not_found");
  for (const [status, code] of [[401, "image_provider_auth_failed"], [403, "image_provider_auth_failed"], [429, "image_provider_rate_limited"], [404, "image_provider_incompatible"], [500, "image_generation_failed"]]) {
    const fixture = createDiscovery({ error: secret }, status);
    await assert.rejects(() => fixture.discovery.discover(provider.id), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(JSON.stringify({ message: error.message, stack: error.stack }), /sk-discovery-secret/);
      return true;
    });
  }
});

test("provider discovery distinguishes insufficient balance from invalid credentials", async () => {
  const fixture = createDiscovery({ code: "INSUFFICIENT_BALANCE", message: secret }, 403);
  await assert.rejects(() => fixture.discovery.discover(provider.id), (error) => {
    assert.equal(error.status, 402);
    assert.equal(error.code, "image_provider_balance_insufficient");
    assert.equal(error.message, "生图平台余额不足，请联系管理员充值或更换平台。");
    assert.doesNotMatch(JSON.stringify({ message: error.message, stack: error.stack }), /sk-discovery-secret/);
    return true;
  });
});
