import { test } from "node:test";
import assert from "node:assert/strict";

import { parseList } from "../src/parse.js";

test("splits on commas and trims whitespace", () => {
  assert.deepEqual(parseList("a, b ,c"), ["a", "b", "c"]);
});

test("an empty string is an empty list", () => {
  assert.deepEqual(parseList(""), []);
});

test("empty segments are dropped", () => {
  assert.deepEqual(parseList("a,,b"), ["a", "b"]);
});
