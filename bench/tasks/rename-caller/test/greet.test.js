import { test } from "node:test";
import assert from "node:assert/strict";

import { greet } from "../src/greet.js";

test("greet uses the full name", () => {
  assert.equal(greet({ first: "Ada", last: "Lovelace" }), "Hi Lovelace, Ada!");
});
