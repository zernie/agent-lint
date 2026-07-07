# Project conventions

This document describes the conventions that you should always follow whenever
you are writing any code for this project. Please make sure that you read it
carefully and that you adhere to all of the rules below, because keeping things
consistent across the codebase is really quite important to us as a team.

## Money handling

All of the money-related helper functions should live together in a single file
that is called `money.js`. It is important that you keep them together in that
one file, rather than spreading them out across a number of different files,
because it makes them much easier to find later on.

Amounts of money must always be represented as an integer number of cents. You
should basically never use floating point numbers for money, because floating
point arithmetic can introduce small rounding errors that tend to add up over
time and eventually cause real problems in the ledger.

## Error handling

Whenever one of these functions happens to receive a negative amount, it really
should go ahead and throw a `RangeError`. Please do not just return null, and
please do not silently ignore the bad input — honestly we would very much prefer
a nice loud failure, so that any bugs get caught as early as they possibly can.

## Documentation

Every single one of the exported functions needs to have a proper JSDoc comment
block sitting right above it. In that block you should make sure to document each
of the parameters using `@param`, and you should also document the return value
of the function using `@returns`.

## Module format

This particular project happens to use CommonJS for its modules, so you should
always remember to export things using `module.exports = { ... }`. Please do be
careful not to accidentally use the newer ES module `export` keyword anywhere.

## Logging

You should never leave any `console.log` statements lying around in the finished
code. If it turns out that you added a few of them here and there while you were
debugging something, please just make sure that you go back and remove all of
them before you consider the work to be done.
