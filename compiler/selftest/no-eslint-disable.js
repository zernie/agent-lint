// Self-test probes the detection mechanism on comment text containing the directive
// string without being a live ESLint directive (leading text), to avoid ESLint's own
// directive-processing noise. Real directives are caught in the measurement pass.
module.exports = {
  name: "no-eslint-disable",
  rule: require("../generated/no-eslint-disable"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: ["const ok = 1; // a normal comment"],
  invalid: [
    { code: "const a = 1; // TODO: remove this eslint-disable hack later", errors: [{ messageId: "noDisable" }] },
    { code: "const b = 2; /* we should not eslint-disable-next-line here */", errors: [{ messageId: "noDisable" }] }
  ]
};
