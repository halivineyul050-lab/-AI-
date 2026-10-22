import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAuthNextPath } from "../public/auth-redirect.mjs";

test("authentication return paths remain on the current origin", () => {
  const origin = "https://ontimo.cn";
  for (const value of ["https://evil.com", "//evil.com", "/\\evil.com", "/%5Cevil.com", "/%09/evil.com"]) {
    assert.equal(resolveAuthNextPath(value, origin), "/", value);
  }
  assert.equal(resolveAuthNextPath("/admin.html?tab=tools#list", origin), "/admin.html?tab=tools#list");
  assert.equal(resolveAuthNextPath("/news", origin), "/news");
  assert.equal(resolveAuthNextPath("/search?q=hello%20world", origin), "/search?q=hello%20world");
});
