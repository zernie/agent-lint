---
name: add-cart-discount
description: Add per-item discount support to the cart total
---

<!-- vigiles:result "npm test" -->

# Add per-item discounts

`total(items)` in `src/cart.js` sums `price * qty` across the cart.

Add support for an optional `discount` field on an item — a percentage off
that item's line total. For example an item `{ price: 100, qty: 1, discount: 10 }`
contributes `90`. Items without a `discount` field are unaffected.

The behaviour is covered by the tests under `test/`.
