# Stylelint — Reference

Shared linter reference for vigiles skills. Used by `strengthen` (find existing rules) and `pr-to-lint-rule` (write custom rules).

## Check Existing Plugins First

Before writing a custom rule, search these packages — the pattern may already be covered:

| Plugin                                      | Scope                    | Key rules                                                                                                                                   |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `stylelint-config-standard`                 | Standard CSS conventions | Extends `stylelint-config-recommended`, adds `declaration-block-no-redundant-longhand-properties`, `shorthand-property-no-redundant-values` |
| `stylelint-config-recommended`              | Error prevention         | `no-descending-specificity`, `no-duplicate-selectors`, `declaration-block-no-duplicate-properties`                                          |
| `stylelint-order`                           | Property ordering        | `order/properties-order`, `order/properties-alphabetical-order` — configurable sort orders                                                  |
| `stylelint-scss`                            | SCSS syntax              | `scss/no-duplicate-mixins`, `scss/no-unused-private-members`, `scss/at-rule-no-unknown`, `scss/dollar-variable-pattern`                     |
| `stylelint-config-css-modules`              | CSS Modules              | Adjusts rules for `:global`, `:local`, `composes` syntax                                                                                    |
| `stylelint-config-tailwindcss`              | Tailwind CSS             | Allows Tailwind directives (`@tailwind`, `@apply`, `@screen`)                                                                               |
| `stylelint-no-unsupported-browser-features` | Browser compat           | Flags CSS features not supported by your browserslist targets                                                                               |
| `stylelint-declaration-strict-value`        | Value enforcement        | Require variables/functions for specific properties (colors, fonts, z-index)                                                                |
| `stylelint-config-clean-order`              | Property order           | Opinionated property ordering (positioning → box model → typography → visual → misc)                                                        |
| `stylelint-config-prettier`                 | Prettier compat          | Disables rules that conflict with Prettier (deprecated in Stylelint v15+)                                                                   |
| `stylelint-a11y`                            | Accessibility            | `a11y/no-outline-none`, `a11y/no-text-size-adjust`, `a11y/media-prefers-reduced-motion`                                                     |

**Tip:** Stylelint v15+ removed all stylistic rules (spacing, formatting). Use Prettier for formatting, Stylelint for correctness.

## Rule Anatomy

Every Stylelint rule is a function that receives options and returns a checker:

```js
const stylelint = require("stylelint");

const ruleName = "plugin/no-important";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: "Unexpected !important — use utility classes instead.",
});
const meta = { url: "https://example.com/rules/no-important" };

/** @type {import('stylelint').Rule} */
const ruleFunction = (primary, secondary, context) => {
  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });
    if (!validOptions) return;

    root.walkDecls((decl) => {
      if (decl.important) {
        stylelint.utils.report({
          message: messages.rejected,
          node: decl,
          result,
          ruleName,
        });
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
```

### Key concepts

| Concept                             | Purpose                                    | Notes                                                     |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `primary`                           | First option (usually `true` or a pattern) | What the user passes in config                            |
| `secondary`                         | Second option (usually an object)          | Additional configuration                                  |
| `context`                           | Execution context                          | Contains `fix` boolean for auto-fix mode                  |
| `root`                              | PostCSS AST root node                      | Entry point for walking the CSS tree                      |
| `result`                            | Results accumulator                        | Pass to `stylelint.utils.report()`                        |
| `stylelint.utils.report()`          | Report a violation                         | Canonical way to report — handles severity, ignores, etc. |
| `stylelint.utils.validateOptions()` | Validate rule config                       | Returns false if config is invalid                        |

### PostCSS AST node types

| Node type     | What it represents      | Walker method         | Example                     |
| ------------- | ----------------------- | --------------------- | --------------------------- |
| `Root`        | Entire stylesheet       | —                     | Top-level container         |
| `Rule`        | Selector + declarations | `root.walkRules()`    | `.button { color: red }`    |
| `Declaration` | Property: value pair    | `root.walkDecls()`    | `color: red`                |
| `AtRule`      | `@` rule                | `root.walkAtRules()`  | `@media (min-width: 768px)` |
| `Comment`     | CSS comment             | `root.walkComments()` | `/* comment */`             |

Properties on `Declaration`: `decl.prop` (property name), `decl.value` (value string), `decl.important` (boolean).

## Configuration

### `.stylelintrc.json`

```json
{
  "extends": ["stylelint-config-standard"],
  "plugins": ["stylelint-order"],
  "rules": {
    "declaration-no-important": true,
    "selector-max-specificity": "0,3,0",
    "order/properties-alphabetical-order": true
  }
}
```

### `stylelint.config.js` (flat config)

```js
module.exports = {
  extends: ["stylelint-config-standard"],
  rules: {
    "declaration-no-important": true,
  },
  overrides: [
    {
      files: ["**/*.scss"],
      extends: ["stylelint-config-standard-scss"],
    },
  ],
};
```

### Key config concepts

- **`extends`** — inherit from shared configs (order matters — later overrides earlier)
- **`plugins`** — load additional rule packages
- **`rules`** — enable/disable/configure individual rules (`true`, `null`, or `[value, options]`)
- **`overrides`** — per-file rule configuration (like ESLint overrides)

## Testing Rules

```js
const { lint } = require("stylelint");

async function testRule() {
  const result = await lint({
    code: "a { color: pink !important; }",
    config: {
      plugins: ["./plugin-no-important.js"],
      rules: { "plugin/no-important": true },
    },
  });

  console.log(result.results[0].warnings);
  // [{ rule: "plugin/no-important", text: "Unexpected !important...", line: 1, column: 19 }]
}
```

For plugin development, use `jest-preset-stylelint` or test via `lint()` directly.

**Testing best practices:**

1. **Test with `lint()` API** — canonical method, works with any test runner
2. **Test valid and invalid cases** — ensure no false positives
3. **Test with SCSS/Less** if the plugin should support preprocessor syntax
4. **Test `overrides`** — if the rule has options, test each configuration

### vigiles enforce() reference

```typescript
enforce("stylelint/declaration-no-important", "Use utility classes instead.");
enforce(
  "stylelint/selector-max-specificity",
  "Keep specificity low for maintainability.",
);
```

vigiles loads Stylelint config via `createLinter` + `getConfigForFile`, checks if the rule value is not `null`.

## Edge Cases and Gotchas

### CSS-in-JS

Stylelint supports CSS-in-JS via custom syntaxes:

```json
{
  "overrides": [
    {
      "files": ["**/*.{js,jsx,ts,tsx}"],
      "customSyntax": "@stylelint/postcss-css-in-js"
    }
  ]
}
```

Note: `@stylelint/postcss-css-in-js` is deprecated as of Stylelint v15. For styled-components / emotion, consider `postcss-styled-syntax` or lint extracted CSS instead.

### SCSS / Less

Use dedicated configs:

- SCSS: `stylelint-config-standard-scss` (includes `stylelint-scss` plugin)
- Less: `postcss-less` as `customSyntax`

SCSS nesting (`&-modifier`) and mixins may trigger false positives in standard rules. The SCSS config handles this.

### Prettier conflicts (v15+)

Stylelint v15 removed all stylistic rules. If upgrading from v14:

- Remove `stylelint-config-prettier` (no longer needed)
- Remove manual disables of formatting rules (`indentation`, `string-quotes`, etc.)
- Stylelint now handles correctness only; Prettier handles formatting

### Property order plugins

`stylelint-order` and `stylelint-config-clean-order` can conflict. Use one ordering strategy:

- Alphabetical: `order/properties-alphabetical-order`
- Grouped: `order/properties-order` with a custom group list
- Clean order: extend `stylelint-config-clean-order` (opinionated groups)

### `extends` order matters

```json
{
  "extends": ["stylelint-config-standard", "stylelint-config-prettier"]
}
```

Later configs override earlier ones. Put base configs first, overrides last.

### Monorepo considerations

- Stylelint resolves config from the file being linted, walking up directories
- Each package can have its own `.stylelintrc.json`
- vigiles checks Stylelint config via `createLinter({ cwd: basePath })` — in a monorepo, run from each package root

## Mapping PR Feedback to Rule Strategy

| PR comment pattern           | Best approach                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- |
| "Don't use !important"       | `stylelint/declaration-no-important` — already exists                             |
| "Keep specificity low"       | `stylelint/selector-max-specificity` with threshold                               |
| "Sort properties"            | `stylelint-order` plugin — `order/properties-alphabetical-order` or custom groups |
| "Don't use ID selectors"     | `stylelint/selector-max-id` — already exists                                      |
| "Use variables for colors"   | `stylelint-declaration-strict-value` plugin                                       |
| "No vendor prefixes"         | `stylelint/property-no-vendor-prefix`, `value-no-vendor-prefix`                   |
| "Don't nest too deep"        | `stylelint/selector-max-compound-selectors` with threshold                        |
| "Use modern CSS"             | `stylelint/declaration-property-value-no-unknown` + browserslist                  |
| "Remove empty blocks"        | `stylelint/block-no-empty` — already exists                                       |
| "Don't duplicate properties" | `stylelint/declaration-block-no-duplicate-properties` — already exists            |
| "Use shorthand"              | `stylelint/declaration-block-no-redundant-longhand-properties` — already exists   |
| "Font naming convention"     | `stylelint/font-family-name-quotes` — already exists                              |
| "No unknown @rules"          | `stylelint/at-rule-no-unknown` (or `scss/at-rule-no-unknown` for SCSS)            |
