module.exports = {
  name: "no-console-log",
  rule: require("../generated/no-console-log"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: ["logger.log('hi');", "console.error('x');", "console.warn('x');"],
  invalid: [{ code: "console.log('x');", errors: [{ messageId: "noConsoleLog" }] }]
};
