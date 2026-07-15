const long = "function big() {\n" +
  Array.from({ length: 45 }, (_, i) => "  acc = acc + " + i + ";").join("\n") +
  "\n}";
module.exports = {
  name: "max-function-lines",
  rule: require("../generated/max-function-lines"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: ["function small() { return 1; }"],
  invalid: [{ code: long, errors: [{ messageId: "tooLong" }] }]
};
