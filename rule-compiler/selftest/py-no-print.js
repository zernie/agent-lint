// Stage-1 self-test for py-no-print (ast-grep / Python).
//
// DELIBERATELY NAIVE, like R5/R10 on the ESLint side: the generated rule uses a
// single metavariable `print($A)`, and every `invalid` case here is single-arg —
// so the checker PASSES its own self-test. The independent gold set adds `print()`
// (zero-arg) and `print(a, b)` (multi-arg), which `$A` silently misses, so Stage 2
// catches the recall leak and the gate ABSTAINS. The sound form is `print($$$A)`.
module.exports = {
  name: "py-no-print",
  rule: require("../generated/py-no-print.json"),
  valid: ['logger.info("hi")', "pprint(data)"],
  invalid: ["print('debug')", "print(value)"],
};
