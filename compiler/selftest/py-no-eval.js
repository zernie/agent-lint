// Stage-1 self-test for py-no-eval (ast-grep / Python).
// Uses `eval($$$A)` (the variadic form — the fix for py-no-print's arity bug), so
// it catches eval with any arity while staying AST-anchored: `obj.eval()` (an
// attribute call, e.g. the PyTorch `model.eval()` idiom) and `ast.literal_eval`
// are NOT the builtin and must not match.
module.exports = {
  name: "py-no-eval",
  rule: require("../generated/py-no-eval.json"),
  valid: ["ast.literal_eval(s)", "obj.eval()"],
  invalid: ["eval(source)"],
};
