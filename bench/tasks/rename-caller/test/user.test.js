import { test } from "node:test";
import assert from "node:assert/strict";

import { fullName } from "../src/user.js";

test("fullName renders last, first", () => {
  assert.equal(fullName({ first: "Ada", last: "Lovelace" }), "Lovelace, Ada");
});
