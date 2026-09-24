import assert from "node:assert/strict";
import { test } from "node:test";
import https from "node:https";
import http from "node:http";
import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { createSecretBox } from "../backend/image-provider-secrets.mjs";
import { assertSafeUpstreamUrl, safeFetch } from "../backend/safe-upstream.mjs";
import { redactSensitiveText, sanitizeSensitiveData, validateEventBatch } from "../backend/validation.mjs";

const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("secret box uses authenticated randomized encryption and accepts hex keys", () => {
  const key = Buffer.alloc(32, 7);
  const box = createSecretBox(key);
  const payload = box.encrypt("sk-example-secret");
  assert.doesNotMatch(payload, /sk-example-secret/);
  assert.match(payload, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.notEqual(payload, box.encrypt("sk-example-secret"));
  assert.equal(box.decrypt(payload), "sk-example-secret");
  assert.equal(createSecretBox(key.toString("hex")).decrypt(payload), "sk-example-secret");
  assert.throws(() => createSecretBox(Buffer.alloc(32, 8)).decrypt(payload));
  const parts = payload.split(".");
  parts[2] = Buffer.from("tampered secret").toString("base64url");
  assert.throws(() => box.decrypt(parts.join(".")));
  key.fill(0);
  assert.equal(box.decrypt(payload), "sk-example-secret");
});

test("secret box rejects absent or malformed keys and payloads without echoing secrets", () => {
  for (const key of [undefined, "", "sk-private-key", "z".repeat(64), Buffer.alloc(31)]) {
    assert.throws(() => createSecretBox(key), /NIKE_IMAGE_CONFIG_KEY/);
  }
  const box = createSecretBox(Buffer.alloc(32, 7));
  for (const payload of [null, "sk-secret-value", "v2.a.b.c", "v1.a.b.c", box.encrypt("hello") + ".extra"]) {
    assert.throws(() => box.decrypt(payload), (error) => !String(error).includes("sk-secret-value"));
  }
});

test("upstream URL accepts public HTTPS destinations and rejects unsafe syntax", async () => {
  assert.equal((await assertSafeUpstreamUrl("https://api.example.test/v1", { lookup })).href, "https://api.example.test/v1");
  await assertSafeUpstreamUrl("https://[2606:4700:4700::1111]/", { lookup });
  for (const url of ["http://api.example.test", "https://user:secret@api.example.test", "https://localhost", "https://api.localhost.", "https://machine.local", "not-a-url"]) {
    await assert.rejects(() => assertSafeUpstreamUrl(url, { lookup }));
  }
});

test("upstream URL blocks private, reserved and mapped address ranges, including mixed DNS", async () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::", "::1", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1", "invalid"]) {
    await assert.rejects(() => assertSafeUpstreamUrl("https://api.example.test", { lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }] }), /private|unsafe/i, address);
  }
  await assert.rejects(() => assertSafeUpstreamUrl("https://127.1", { lookup }), /private/i);
  await assert.rejects(() => assertSafeUpstreamUrl("https://api.example.test", { lookup: async () => [...await lookup(), { address: "127.0.0.1", family: 4 }] }), /private/i);
  await assert.rejects(() => assertSafeUpstreamUrl("https://api.example.test", { lookup: async () => [] }));
});

test("safeFetch blocks unsafe redirects before sending another request", async () => {
  for (const location of ["https://127.0.0.1/internal", "http://public.example/end", "https://private.example/end"]) {
    let calls = 0;
    await assert.rejects(() => safeFetch("https://public.example/start", {
      lookup: async (host) => host === "private.example" ? [{ address: "10.0.0.1", family: 4 }] : lookup(),
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(options.redirect, "manual");
        return new Response(null, { status: 302, headers: { location } });
      }
    }));
    assert.equal(calls, 1);
  }
});

test("safeFetch follows relative redirects and caps them at three", async () => {
  let calls = 0;
  const result = await safeFetch("https://public.example/start", { lookup, fetchImpl: async (url) => {
    calls++;
    return new URL(url).pathname === "/end" ? new Response("done") : new Response(null, { status: 307, headers: { location: "/end" } });
  } });
  assert.equal(await result.text(), "done");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(() => safeFetch("https://public.example/start", { lookup, fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "/again" } });
  } }), /redirect/i);
  assert.equal(calls, 4);
});

test("safeFetch never forwards credentials or request bodies to a different origin", async () => {
  let calls = 0;
  await assert.rejects(() => safeFetch("https://public.example/start", {
    lookup, method: "POST", body: "private prompt", headers: { Authorization: "Bearer private-key" },
    fetchImpl: async () => { calls++; return new Response(null, { status: 307, headers: { location: "https://other.example/end" } }); }
  }), /redirect/i);
  assert.equal(calls, 1);
});

test("safeFetch converts a POST 303 to GET and hides upstream transport errors", async () => {
  const response = await safeFetch("https://public.example/start", {
    lookup, method: "POST", body: "request", headers: { "Content-Type": "application/json" },
    fetchImpl: async (url, options) => {
      if (new URL(url).pathname === "/start") return new Response(null, { status: 303, headers: { location: "/end" } });
      assert.equal(options.method, "GET");
      assert.equal(options.body, undefined);
      assert.equal(new Headers(options.headers).has("content-type"), false);
      return new Response("done");
    }
  });
  assert.equal(await response.text(), "done");
  await assert.rejects(() => safeFetch("https://public.example", { lookup, fetchImpl: async () => { throw new Error("Authorization: Bearer private-value"); } }), (error) => !JSON.stringify({ message: error.message, stack: error.stack }).includes("private-value"));
});

test("default transport pins validated DNS while preserving HTTPS hostname and streams responses", async (t) => {
  let lookups = 0;
  t.mock.method(https, "request", (url, options, onResponse) => {
    assert.equal(url.hostname, "public.example");
    assert.equal(options.agent, false);
    options.lookup("public.example", { all: true }, (error, addresses) => {
      assert.equal(error, null);
      assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
    });
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      const upstream = new PassThrough();
      upstream.statusCode = 200;
      upstream.statusMessage = "OK";
      upstream.headers = { "content-type": "application/json" };
      onResponse(upstream);
      upstream.end('{"ok":true}');
    });
    return request;
  });
  const response = await safeFetch("https://public.example", { lookup: async () => {
    lookups++;
    return [{ address: lookups === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
  } });
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(lookups, 1);
});

test("default transport rejects invalid response metadata without throwing out of its callback", async (t) => {
  for (const metadata of [{ statusCode: 600, headers: {} }, { statusCode: 200, headers: { "x-test": "private-value\ninvalid" } }]) {
    let onResponse;
    const started = Promise.withResolvers();
    t.mock.method(https, "request", (url, options, callback) => {
      onResponse = callback;
      const request = new EventEmitter();
      request.end = () => started.resolve();
      return request;
    });
    const pending = safeFetch("https://public.example", { lookup });
    const rejected = assert.rejects(pending, (error) => /upstream request failed/i.test(error.message) && !String(error).includes("private-value"));
    await started.promise;
    const upstream = Object.assign(new PassThrough(), metadata);
    assert.doesNotThrow(() => onResponse(upstream));
    await rejected;
    assert.equal(upstream.destroyed, true);
    t.mock.restoreAll();
  }
});

test("safeFetch rejects pre-aborted signals before any DNS lookup or request", async () => {
  const controller = new AbortController();
  controller.abort(new Error("private-abort-reason"));
  let lookups = 0;
  let requests = 0;
  await assert.rejects(() => safeFetch("https://public.example", {
    signal: controller.signal,
    lookup: async () => { lookups++; return lookup(); },
    fetchImpl: async () => { requests++; return new Response("unexpected"); }
  }), /aborted/i);
  assert.equal(lookups, 0);
  assert.equal(requests, 0);
});

test("safeFetch interrupts initial and redirect DNS waits and cleans abort listeners", async () => {
  for (const redirect of [false, true]) {
    const controller = new AbortController();
    const started = Promise.withResolvers();
    const unresolved = Promise.withResolvers();
    let lookups = 0;
    let requests = 0;
    const pending = safeFetch("https://public.example", {
      signal: controller.signal,
      lookup: () => {
        lookups++;
        if (redirect && lookups === 1) return lookup();
        started.resolve();
        return unresolved.promise;
      },
      fetchImpl: async () => { requests++; return new Response(null, { status: 302, headers: { location: "/end" } }); }
    });
    await started.promise;
    controller.abort(new Error("private-abort-reason"));
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve("still pending"), 100); });
    try {
      const outcome = await Promise.race([pending.then(() => "resolved", (error) => error), timeout]);
      assert.ok(outcome instanceof Error, "aborting must settle before DNS finishes");
      assert.match(outcome.message, /aborted/i);
      assert.doesNotMatch(String(outcome), /private-abort-reason/);
      assert.equal(getEventListeners(controller.signal, "abort").length, 0);
      assert.equal(requests, redirect ? 1 : 0);
    } finally {
      clearTimeout(timer);
      unresolved.reject(new Error("late DNS failure must be handled"));
      await pending.catch(() => {});
    }
  }
});

test("successful and failed DNS validation remove abort listeners", async () => {
  const controller = new AbortController();
  await assertSafeUpstreamUrl("https://public.example", { lookup, signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await assert.rejects(() => assertSafeUpstreamUrl("https://public.example", { signal: controller.signal, lookup: async () => { throw new Error("DNS failed"); } }));
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("default transport aborts during the request and while consuming a response body", async (t) => {
  for (const phase of ["request", "body"]) {
    const received = Promise.withResolvers();
    const disconnected = Promise.withResolvers();
    const server = http.createServer((request, response) => {
      response.on("close", () => disconnected.resolve());
      if (phase === "body") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.write("partial");
      }
      received.resolve();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.mock.method(https, "request", (url, options, callback) => http.request({ ...options, hostname: "127.0.0.1", port: server.address().port }, callback));
    try {
      const controller = new AbortController();
      const pending = safeFetch("https://public.example", { lookup, signal: controller.signal });
      await received.promise;
      const consumed = phase === "body" ? (await pending).text() : pending;
      const rejected = assert.rejects(consumed, (error) => /abort/i.test(error.message) && !String(error).includes("private-abort-reason"));
      controller.abort(new Error("private-abort-reason"));
      await rejected;
      await disconnected.promise;
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      t.mock.restoreAll();
    }
  }
});

test("sanitizer redacts structured errors, logger input, key assignments and ciphertext", () => {
  const encrypted = createSecretBox(Buffer.alloc(32, 7)).encrypt("private-value");
  const error = new Error('Authorization: Bearer bearer-secret api_key=query-secret&ok=1 apiKey="quoted-secret" sk-short');
  error.details = { api_key: "nested-secret", apiKey: "camel-secret", encryptedApiKey: encrypted, authorization: "Bearer header-secret" };
  const serialized = JSON.stringify(sanitizeSensitiveData(error));
  for (const secret of ["bearer-secret", "query-secret", "quoted-secret", "sk-short", "nested-secret", "camel-secret", encrypted, "header-secret"]) assert.ok(!serialized.includes(secret), secret);
  const loggerInput = redactSensitiveText(JSON.stringify({ Authorization: "Bearer logger-secret", api_key: "json-secret", apiKey: "camel-json-secret", ciphertext: encrypted }));
  for (const secret of ["logger-secret", "json-secret", "camel-json-secret", encrypted]) assert.ok(!loggerInput.includes(secret), secret);
  assert.match(serialized, /\[secret\]/);
});

test("text sanitizer redacts entire JSON credential values containing escaped quotes", () => {
  const sanitized = redactSensitiveText(JSON.stringify({ apiKey: 'prefix"hidden-suffix', api_key: "start\\end-secret" }));
  assert.doesNotMatch(sanitized, /prefix|hidden-suffix|end-secret/);
});

test("safeFetch does not expose malformed header credentials in errors", async () => {
  await assert.rejects(() => safeFetch("https://public.example", {
    lookup, headers: { Authorization: "Bearer invalid\nprivate-credential" }, fetchImpl: async () => new Response("unreachable")
  }), (error) => !String(error).includes("private-credential"));
});

test("analytics redacts API credential property names without losing ordinary properties", () => {
  const batch = validateEventBatch({ visitorId: "visitor-123", sessionId: "session-123", events: [{ eventId: "event-123", eventName: "page_view", clientTime: "2026-09-20T00:00:00Z", pageType: "home", path: "/", properties: { apiKey: "plain-secret", api_key: "another-secret", Authorization: "Basic secret", label: "kept" } }] });
  assert.deepEqual(batch.events[0].properties, { apiKey: "[secret]", api_key: "[secret]", Authorization: "[secret]", label: "kept" });
});
