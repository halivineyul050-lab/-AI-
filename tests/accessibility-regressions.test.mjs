import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("tool cards expose native focusable detail controls without nested article tab stops", () => {
  assert.doesNotMatch(appSource, /<article[^>]*class="featured-tool-card[^>]*tabindex="0"/);
  assert.match(appSource, /<button[^>]*class="featured-tool-main"[^>]*data-tool-id=/);
  assert.doesNotMatch(appSource, /<article[^>]*class="tool-card[^>]*tabindex="0"/);
  assert.match(appSource, /class="detail-link" type="button"/);
});
