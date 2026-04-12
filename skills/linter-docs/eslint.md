# ESLint — Reference

Shared linter reference for vigiles skills. Used by `strengthen` (find existing rules) and `pr-to-lint-rule` (write custom rules).

## Check Existing Plugins First

Before writing a custom rule, search these plugins — the pattern may already be covered:

| Plugin                                              | Scope                               | Key rules to know                                                                                                                              |
| --------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint`                                | Type-aware TS rules                 | `no-floating-promises`, `no-misused-promises`, `strict-boolean-expressions`, `naming-convention`, `no-restricted-imports` (type-aware variant) |
| `eslint-plugin-import-x`                            | Import hygiene (flat-config native) | `no-cycle`, `no-unresolved`, `no-extraneous-dependencies`, `order`, `no-internal-modules`                                                      |
| `eslint-plugin-boundaries`                          | Module boundary enforcement         | `element-types`, `entry-point`, `external` — define allowed dependency directions between architectural layers                                 |
| `eslint-plugin-sonarjs`                             | Code smells & complexity            | `cognitive-complexity`, `no-duplicate-string`, `no-identical-functions`, `no-nested-conditional`                                               |
| `eslint-plugin-unicorn`                             | Modern JS idioms                    | `prefer-node-protocol`, `no-array-for-each`, `prefer-top-level-await`, `filename-case`                                                         |
| `eslint-plugin-react` / `eslint-plugin-react-hooks` | React patterns                      | `rules-of-hooks`, `exhaustive-deps`, `no-unstable-nested-components`, `jsx-no-leaked-render`                                                   |
| `eslint-plugin-jsx-a11y`                            | Accessibility                       | `alt-text`, `anchor-is-valid`, `no-autofocus`, `click-events-have-key-events`                                                                  |
| `eslint-plugin-n`                                   | Node.js-specific                    | `no-sync`, `no-process-exit`, `prefer-global/buffer`, `no-unsupported-features`                                                                |
| `eslint-plugin-regexp`                              | Regex safety                        | `no-super-linear-backtracking`, `no-misleading-unicode-character`, `prefer-quantifier`                                                         |
| `eslint-plugin-security`                            | Security anti-patterns              | `detect-object-injection`, `detect-non-literal-regexp`, `detect-child-process`                                                                 |
| `@eslint/json` / `@eslint/markdown`                 | Non-JS file linting                 | Lint JSON and markdown files with ESLint flat config — useful for config validation                                                            |

**Tip:** `no-restricted-syntax` with an AST selector handles many one-off patterns without a custom rule. Try it first.

## Rule Anatomy

Every ESLint rule is an object with `meta` and `create`:

```js
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion", // "problem" | "suggestion" | "layout"
    docs: {
      description: "Disallow direct database calls outside the data layer",
      recommended: false,
    },
    messages: {
      noDirectDb:
        "Use the repository pattern — import from 'src/data/' instead of calling {{ name }} directly.",
    },
    fixable: null, // "code" if you provide a fixer
    schema: [], // JSON Schema for rule options
  },

  create(context) {
    return {
      // visitor methods keyed by AST node type or selector
      CallExpression(node) {
        if (isDirectDbCall(node)) {
          context.report({
            node,
            messageId: "noDirectDb",
            data: { name: node.callee.name },
          });
        }
      },
    };
  },
};
```

### meta.type — choose correctly

| Type           | When to use                               | Example                                           |
| -------------- | ----------------------------------------- | ------------------------------------------------- |
| `"problem"`    | Code that is/will be broken               | Missing `await` on a promise                      |
| `"suggestion"` | Code that works but violates a convention | Using `console.log` instead of the project logger |
| `"layout"`     | Whitespace/formatting only                | Rarely used — Prettier handles this               |

### meta.messages — be prescriptive

Bad: `"Don't do this."` — tells the developer nothing.
Good: `"Use the {{ replacement }} wrapper instead of {{ original }}."` — tells them exactly what to write.

Always include **what to do** in the message, not just what's wrong.

## AST Node Types — Cheat Sheet

Common patterns and the AST nodes that catch them:

| You want to detect         | AST node / selector                                                             | Notes                               |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| Function call `foo()`      | `CallExpression[callee.name="foo"]`                                             | Selector form — no code needed      |
| Method call `obj.method()` | `CallExpression[callee.type="MemberExpression"][callee.property.name="method"]` |                                     |
| Import `from "module"`     | `ImportDeclaration[source.value="module"]`                                      | Static imports only                 |
| `require("module")`        | `CallExpression[callee.name="require"][arguments.0.value="module"]`             | CJS                                 |
| Variable named X           | `VariableDeclarator[id.name="X"]`                                               |                                     |
| Class with decorator       | `ClassDeclaration > Decorator`                                                  | Experimental — needs parser support |
| JSX element `<Foo>`        | `JSXOpeningElement[name.name="Foo"]`                                            | Needs JSX parser                    |
| Template literal           | `TemplateLiteral`                                                               | Includes tagged templates           |
| `throw` statement          | `ThrowStatement`                                                                |                                     |
| `new Promise()`            | `NewExpression[callee.name="Promise"]`                                          |                                     |

**Pro tip:** Use [AST Explorer](https://astexplorer.net) (parser: `@typescript-eslint/parser`, transform: `ESLint v4`) to prototype visitor logic interactively.

## ESTree Selectors

ESLint supports CSS-like AST selectors. These replace boilerplate visitor code:

```js
create(context) {
  return {
    // Match: import from any path containing "internal"
    'ImportDeclaration[source.value=/internal/]'(node) {
      context.report({ node, messageId: "noInternalImport" });
    },

    // Match: await inside a loop body
    'ForStatement > BlockStatement AwaitExpression'(node) {
      context.report({ node, messageId: "noAwaitInLoop" });
    },

    // Match: console.log, console.warn, console.error
    'MemberExpression[object.name="console"]'(node) {
      context.report({ node: node.parent, messageId: "useLogger" });
    },
  };
}
```

Selector syntax:

- `A > B` — B is a direct child of A
- `A B` — B is a descendant of A
- `A[attr="val"]` — attribute match (string equality)
- `A[attr=/regex/]` — attribute match (regex)
- `A:exit` — fires when **leaving** the node (post-order)
- `:not(A)` — negation
- `A + B` — B immediately follows A (sibling)

## Accessing TypeScript Type Information

For type-aware rules, use `@typescript-eslint/utils`:

```ts
import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://example.com/rules/${name}`,
);

export default createRule({
  name: "no-unhandled-promise",
  meta: {
    type: "problem",
    docs: { description: "Require promises to be handled" },
    messages: { unhandled: "This promise must be awaited or returned." },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      ExpressionStatement(node) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(node.expression);
        const type = checker.getTypeAtLocation(tsNode);
        if (isPromiseLike(checker, type)) {
          context.report({ node, messageId: "unhandled" });
        }
      },
    };
  },
});
```

**Requirements for type-aware rules:**

1. The ESLint config must use `@typescript-eslint/parser` with `projectService: true` (or legacy `project` option)
2. The rule must live in a plugin (not standalone `eslint-rules/` dir) for parser services to work reliably
3. Type-aware rules are slower — only use when you genuinely need type information

## Auto-Fix and Suggestions

### `fix` — automatic, silent

Use for safe, semantics-preserving changes:

```js
context.report({
  node,
  messageId: "preferNodeProtocol",
  fix(fixer) {
    return fixer.replaceText(node.source, `"node:${module}"`);
  },
});
```

Safety rules for `fix`:

- **Never change runtime behavior.** If the fix might break code, use `suggest` instead.
- **Never remove code** unless it's provably dead.
- One `fix` per report. Multiple changes go in a single fix call using an array.
- Test your fix: `RuleTester` will verify the fix output matches `output` in your test case.

### `suggest` — manual, user-picks

Use for changes that might alter semantics:

```js
context.report({
  node,
  messageId: "noDirectDbCall",
  suggest: [
    {
      messageId: "wrapWithRepo",
      fix(fixer) {
        return fixer.replaceText(
          node,
          `repository.${node.callee.property.name}(${argsText})`,
        );
      },
    },
  ],
});
```

## Testing with RuleTester

```js
import { RuleTester } from "eslint";
import rule from "./no-direct-db.js";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: "module",
  },
});

tester.run("no-direct-db", rule, {
  valid: [
    // Always include: correctly following the rule
    `import { findUser } from "src/data/users";`,
    // Edge case: dynamic import (intentionally allowed)
    `const mod = await import("pg");`,
  ],
  invalid: [
    {
      code: `import { Pool } from "pg";`,
      errors: [{ messageId: "noDirectDb" }],
    },
    // If the rule has a fixer, test the output
    {
      code: `const fs = require("fs");`,
      output: `const fs = require("node:fs");`,
      errors: [{ messageId: "preferNodeProtocol" }],
    },
  ],
});
```

**Testing best practices:**

1. **Test the valid cases first.** If valid cases fail, your rule is too aggressive.
2. **Include edge cases.** Dynamic imports, re-exports, type-only imports, destructured requires.
3. **Test error placement.** Use `errors: [{ messageId, line, column }]` to verify the squiggly appears on the right token.
4. **Test with options.** If your rule has configurable options, test each combination.
5. **For TypeScript rules**, use `@typescript-eslint/rule-tester` and provide `parser` + `parserOptions` with a real `tsconfig.json`.

## Flat Config Registration

ESLint 9+ uses flat config. Register custom rules via a local plugin object:

```js
// eslint.config.js
import noDirectDb from "./eslint-rules/no-direct-db.js";

export default [
  {
    plugins: {
      // Namespace all custom rules under "local"
      local: {
        rules: {
          "no-direct-db": noDirectDb,
        },
      },
    },
    rules: {
      "local/no-direct-db": "error",
    },
  },
];
```

**Important:** The config key in `rules` must be `<plugin-namespace>/<rule-name>`. The `enforce()` reference in vigiles matches this: `enforce("eslint/local/no-direct-db", "...")`.

If the project still uses legacy `.eslintrc`, the rule goes in `rulesDir` instead — but flat config is the path forward.

## Edge Cases and Gotchas

### TypeScript AST differences

TypeScript adds AST node types that ESTree doesn't have. Common ones to watch for:

- `TSAsExpression` — `x as string` wraps the expression; your visitor might miss the inner node
- `TSNonNullExpression` — `x!` adds a wrapper node
- `TSTypeAnnotation` — `: string` on parameters creates child nodes that break naive `node.params.length` checks
- `TSImportEqualsDeclaration` — `import x = require("y")` is NOT an `ImportDeclaration`
- `TSEnumDeclaration` — enums look like variable declarations but aren't

**Rule of thumb:** If your rule targets function parameters, imports, or expressions, test it with TypeScript annotations and assertions.

### `no-restricted-syntax` — the 80% solution

Before writing a custom rule, check if `no-restricted-syntax` covers it:

```js
rules: {
  "no-restricted-syntax": ["error",
    {
      selector: 'CallExpression[callee.object.name="console"]',
      message: "Use the project logger from 'src/lib/logger'.",
    },
    {
      selector: 'ImportDeclaration[source.value="moment"]',
      message: "Use dayjs — we're migrating off moment.",
    },
  ],
}
```

This works for any pattern you can express as an AST selector. You only need a custom rule when you need:

- Type information
- Multi-node analysis (e.g., "if X is imported, then Y must also be imported")
- Auto-fix or suggestions
- Configurable options via schema

### `no-restricted-imports` — the import-specific shortcut

For import bans specifically, `no-restricted-imports` is more ergonomic:

```js
rules: {
  "no-restricted-imports": ["error", {
    paths: [
      { name: "lodash", message: "Import specific lodash functions: lodash/get" },
      { name: "moment", message: "Use dayjs instead." },
    ],
    patterns: [
      { group: ["src/internal/*"], message: "Use the public API from src/index.ts" },
    ],
  }],
}
```

### Auto-fix conflicts

If two rules try to fix the same range of code, ESLint drops both fixes. Avoid this by:

- Keeping fix ranges tight (fix only the exact tokens, not the whole statement)
- Using `suggest` instead of `fix` when the rule might overlap with Prettier or another fixer
- Testing with `--fix-dry-run` before enabling in CI

### Performance

- Avoid `Program:exit` handlers that walk the entire AST — use specific node visitors instead.
- Selector matching has overhead. For hot paths, a manual `CallExpression` check is faster than a complex selector.
- Type-aware rules add ~2-5x overhead because they invoke the TypeScript compiler. Group them in a separate config block with `files: ["src/**/*.ts"]` so they only run on TS files.
- If your custom rules directory has more than ~10 rules, bundle them into a proper plugin package for better caching.

### Monorepo considerations

- ESLint flat config is resolved from `cwd`, not from the file being linted. In a monorepo, set `cwd` to the package root, not the workspace root.
- `vigiles generate-types` discovers ESLint rules using `calculateConfigForFile("dummy.js")` from the project `basePath`. If your monorepo has different configs per package, run `generate-types` from each package root.
- Plugin rules must be installed in the `node_modules` visible from the config file's location. Hoisted deps in a monorepo can cause "plugin not found" errors — install them in the package's own `devDependencies`.

## Mapping PR Feedback to Rule Strategy

| PR comment pattern                  | Best approach                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| "Don't import from X"               | `no-restricted-imports` — zero custom code                                                         |
| "Don't call X()"                    | `no-restricted-syntax` with a `CallExpression` selector                                            |
| "Use X instead of Y"                | `no-restricted-syntax` if detection is simple; custom rule with `fix` if you want auto-replacement |
| "Every file must have X"            | Not ESLint — use vigiles `check(every(...).has(...))`                                              |
| "This promise isn't awaited"        | `@typescript-eslint/no-floating-promises` — already exists                                         |
| "Use our custom hook"               | Custom rule checking `CallExpression` against an allow-list                                        |
| "Wrong naming convention"           | `@typescript-eslint/naming-convention` — highly configurable, rarely needs custom code             |
| "Don't use `any`"                   | `@typescript-eslint/no-explicit-any` — already exists                                              |
| "Wrap API calls with error handler" | Custom rule: detect unwrapped `fetch`/`axios` calls, `suggest` the wrapper                         |
| "Don't mutate state directly"       | `eslint-plugin-react` `no-direct-mutation-state` or custom rule checking assignment targets        |
