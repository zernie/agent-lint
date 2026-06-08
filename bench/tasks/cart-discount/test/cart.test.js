import { test } from "node:test";
import assert from "node:assert/strict";

import { total } from "../src/cart.js";

test("sums price times quantity", () => {
  assert.equal(
    total([
      { price: 10, qty: 2 },
      { price: 5, qty: 1 },
    ]),
    25,
  );
});

test("applies a per-item discount percentage", () => {
  assert.equal(total([{ price: 100, qty: 1, discount: 10 }]), 90);
});
