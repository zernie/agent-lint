# Project conventions

Follow these for all code. Consistency matters.

## Money handling

Money helpers live in one file: `money.js`. Keep together, easier to find.

Amounts = integer cents. Never floats — float math rounds wrong, errors accumulate in ledger.

## Error handling

Negative amount → throw `RangeError`. No null return, no silent ignore. Loud failure catches bugs early.

## Documentation

Every exported function: JSDoc block above it. Document each param with `@param`, return with `@returns`.

## Module format

CommonJS. Export via `module.exports = { ... }`. Never ES `export`.

## Logging

No `console.log` in finished code. Remove debug logs before done.
