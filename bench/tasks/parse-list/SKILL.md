---
name: implement-parse-list
description: Implement the parseList string utility
---

<!-- vigiles:result "npm test" -->

# Implement parseList

Implement a function `parseList(input)` in `src/parse.js` and export it as a
named ESM export.

It takes a comma-separated string and returns the list of items:

- Split the input on commas.
- Trim surrounding whitespace from each item.

The module must be importable as `parseList` from `src/parse.js`. The behaviour
is covered by the tests under `test/`.
