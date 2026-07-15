// Stage-1 self-test for py-no-bare-except (ast-grep / Python).
// Cases authored WITH the checker — distinct from the independent gold set.
module.exports = {
  name: "py-no-bare-except",
  rule: require("../generated/py-no-bare-except.json"),
  valid: ["try:\n    risky()\nexcept OSError:\n    handle()", "value = 1"],
  invalid: ["try:\n    risky()\nexcept:\n    handle()"],
};
