import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLikePattern } from "../backend/like-pattern.mjs";

test("LIKE search escapes its escape character and wildcard characters", () => {
  assert.equal(escapeLikePattern("100%_done!"), "100!%!_done!!");
  assert.equal(escapeLikePattern("普通搜索"), "普通搜索");
});
