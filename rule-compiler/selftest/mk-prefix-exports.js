module.exports = {
  name: "mk-prefix-exports",
  rule: require("../generated/mk-prefix-exports"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: ["export function mkWidget() {}", "function widget() {}"],
  invalid: [{ code: "export function widget() {}", errors: [{ messageId: "prefix" }] }]
};
