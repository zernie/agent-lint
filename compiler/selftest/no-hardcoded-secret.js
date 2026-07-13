module.exports = {
  name: "no-hardcoded-secret",
  rule: require("../generated/no-hardcoded-secret"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: ["const password = process.env.PW;", "const x = getSecret();"],
  invalid: [
    { code: "const password = \"hunter2\";", errors: [{ messageId: "secret" }] },
    { code: "const apiKey = \"AKIA1234567890ABCD\";", errors: [{ messageId: "secret" }] }
  ]
};
