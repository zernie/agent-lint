module.exports = {
  name: "no-explicit-any",
  rule: require("../generated/no-explicit-any"),
  languageOptions: { parser: require("@typescript-eslint/parser"), ecmaVersion: 2022, sourceType: "module" },
  valid: ["function f(x: number): number { return x; }", "let u: unknown;"],
  invalid: [
    { code: "function f(x: any): void {}", errors: [{ messageId: "noAny" }] },
    { code: "let v: any;", errors: [{ messageId: "noAny" }] }
  ]
};
