import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const handler = source.slice(source.indexOf("async function submitNewsletter("), source.indexOf("function loadInitialState()"));

async function submit(data) {
  const messages = [];
  const button = { disabled: false };
  let reset = false;
  const context = {
    backendAvailable: true, state: { topics: [] }, topicSlugMap: {},
    apiRequest: async () => ({ data }), showToast: message => messages.push(message), track() {}
  };
  vm.runInNewContext(handler, context);
  await context.submitNewsletter({ querySelector: () => button, reset: () => { reset = true; } }, { value: "reader@example.com" }, { checked: true }, "home_engage");
  assert.equal(button.disabled, false);
  return { messages, reset };
}

test("active newsletter clearly confirms subscription and weekly schedule", async () => {
  const result = await submit({ status: "active", existing: false });
  assert.match(result.messages[0], /订阅成功/);
  assert.match(result.messages[0], /每周一/);
  assert.equal(result.reset, true);
});

test("unsubscribed newsletter does not claim success or clear the form", async () => {
  const result = await submit({ status: "unsubscribed", reactivationRequired: true });
  assert.match(result.messages[0], /未.*订阅|未.*生效/);
  assert.equal(result.reset, false);
});

test("suppressed newsletter does not claim success", async () => {
  const result = await submit({ status: "suppressed", reactivationRequired: true });
  assert.doesNotMatch(result.messages[0], /订阅成功/);
  assert.equal(result.reset, false);
});

test("existing active newsletter explains that repeat subscription is unnecessary", async () => {
  const result = await submit({ status: "active", existing: true });
  assert.match(result.messages[0], /已订阅/);
  assert.match(result.messages[0], /无需重复订阅/);
  assert.equal(result.reset, true);
});

test("missing subscription status cannot produce a success confirmation", async () => {
  const result = await submit(undefined);
  assert.match(result.messages[0], /未生效/);
  assert.equal(result.reset, false);
});
