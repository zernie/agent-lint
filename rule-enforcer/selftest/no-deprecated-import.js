module.exports = {
  name: "no-deprecated-import",
  rule: require("../generated/no-deprecated-import"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: ["import { Button } from '@acme/ui';"],
  invalid: [{ code: "import { Button } from '@acme/legacy-ui';", errors: [{ messageId: "deprecated" }] }]
};
