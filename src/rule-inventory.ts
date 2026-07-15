/**
 * Rule-inventory — the deterministic, foreign-safe teaser surface of the
 * `audit` rule-compile tier (design: `research/audit-rule-compile-tier.md`).
 *
 * Finds prose rules in a `CLAUDE.md` / `AGENTS.md` that map to an off-the-shelf
 * lint rule, and whether that rule already appears in the repo's lint config.
 * The remedy for a documented-but-unconfigured intent is a one-line config
 * change, not synthesis — so this is a cheap, high-value nudge.
 *
 * NO model. NO config execution (textual grep only — never resolves/executes
 * `eslint.config.js`, which would be the RCE path). HIGH PRECISION by
 * construction: only rule-name / code-token-shaped keywords are matched, and
 * only as whole tokens. Bare prose words are excluded on purpose — a raw
 * keyword match (`token`, `!`, `await`, `secret`, `silently`, …) sprays false
 * positives on real instruction files (measured: 107 raw hits over 4 real
 * CLAUDE.md files, ~all garbage). The model-driven analysis (extract → classify
 * → compile → gate → run) lives in the OPT-IN tier, not here.
 *
 * MULTI-LINTER by shape, ESLint-first by data. The matcher is linter-agnostic;
 * each mapping is keyed by linter, so adding Ruff / Clippy / Pylint / RuboCop /
 * Stylelint is additive DATA (a curation task), not a refactor. The OPT-IN tier
 * should resolve "is this rule enabled" via vigiles's existing multi-linter
 * `checkLinterRule` engine (which execs the config) — kept out of this
 * exec-free, foreign-safe surface on purpose.
 */

/** Linters vigiles's cross-reference engine already understands. */
export type LinterName =
  | "eslint"
  | "ruff"
  | "clippy"
  | "pylint"
  | "rubocop"
  | "stylelint";

/** One prose→rule mapping for a single linter. `keywords` are rule-name/token-shaped. */
export interface IntentMapping {
  readonly intent: string;
  readonly linter: LinterName;
  /** Whole-token, code-shaped triggers only (no bare English words). */
  readonly keywords: readonly string[];
  /** The off-the-shelf rule that enforces this intent. */
  readonly rule: string;
  /** The one-line config change that turns it on. */
  readonly configFix: string;
  /** True if a `recommended` preset typically enables this rule (so a bare
   * recommended-extends is evidence it may already be on). */
  readonly inRecommended?: boolean;
}

/**
 * Curated from agent-rules-compiler's `rule-map.json`, keeping ONLY the
 * specific (rule-name / code-token) keywords and dropping every bare-word
 * trigger the FP measurement flagged (`token`, `secret`, `password`, `await`,
 * `!`, `aria`, `silently`, `prefix`, `complexity`, `barrel`, `cycle`, …).
 *
 * ESLint-only today — Ruff/Clippy/Pylint/RuboCop/Stylelint entries append here
 * with their own `linter` + rule-name keywords, no code change.
 */
// SCOPE (2026-07-14): this hand-curated list is a small high-precision FAST-PATH
// (alias enrichment for the most common rules), NOT the strategy. The strategy is
// the DYNAMIC available-rule catalog — enumerate the rules the repo's linter
// ACTUALLY has (spike: 702 for this repo vs ~23 here) and match prose against
// THAT, own-repo/consented since it executes the linter. Do NOT keep growing this
// by hand. See research/rule-compiler-multilang-design.md §0.
export const INTENT_MAP: readonly IntentMapping[] = [
  {
    intent: "no console.log / use the logger",
    linter: "eslint",
    keywords: ["console.log", "no-console"],
    rule: "no-console",
    configFix: '"no-console": "error"',
  },
  {
    intent: "no `any` type",
    linter: "eslint",
    keywords: ["no-explicit-any", "@typescript-eslint/no-explicit-any"],
    rule: "@typescript-eslint/no-explicit-any",
    inRecommended: true,
    configFix: '"@typescript-eslint/no-explicit-any": "error"',
  },
  {
    intent: "no eslint-disable / no linter suppressors",
    linter: "eslint",
    keywords: ["eslint-disable", "eslint-comments/no-use"],
    rule: "eslint-comments/no-use",
    configFix:
      "enable eslint-comments/no-use OR linterOptions.noInlineConfig: true",
  },
  {
    intent: "no @ts-ignore / @ts-expect-error abuse",
    linter: "eslint",
    keywords: [
      "@ts-ignore",
      "ts-expect-error",
      "ban-ts-comment",
      "@typescript-eslint/ban-ts-comment",
    ],
    rule: "@typescript-eslint/ban-ts-comment",
    inRecommended: true,
    configFix: '"@typescript-eslint/ban-ts-comment": "error"',
  },
  {
    intent: "no hardcoded secrets",
    linter: "eslint",
    keywords: ["no-secrets"],
    rule: "no-secrets/no-secrets",
    configFix: "add eslint-plugin-no-secrets rule no-secrets/no-secrets",
  },
  {
    intent: "no empty catch / no swallowed errors",
    linter: "eslint",
    keywords: ["no-empty"],
    rule: "no-empty",
    inRecommended: true,
    configFix: '"no-empty": ["error", {"allowEmptyCatch": false}]',
  },
  {
    intent: "no var / prefer const-let",
    linter: "eslint",
    keywords: ["no-var", "prefer-const"],
    rule: "no-var",
    configFix: '"no-var": "error"',
  },
  {
    intent: "strict equality ===",
    linter: "eslint",
    keywords: ["eqeqeq"],
    rule: "eqeqeq",
    configFix: '"eqeqeq": "error"',
  },
  {
    intent: "template literals over concatenation",
    linter: "eslint",
    keywords: ["prefer-template"],
    rule: "prefer-template",
    configFix: '"prefer-template": "error"',
  },
  {
    intent: "no debugger",
    linter: "eslint",
    keywords: ["no-debugger"],
    rule: "no-debugger",
    inRecommended: true,
    configFix: '"no-debugger": "error"',
  },
  {
    intent: "restricted / deprecated imports",
    linter: "eslint",
    keywords: ["no-restricted-imports", "import/no-restricted-paths"],
    rule: "no-restricted-imports",
    configFix: '"no-restricted-imports": ["error", {…}]',
  },
  {
    intent: "no circular deps",
    linter: "eslint",
    keywords: ["import/no-cycle", "no-cycle"],
    rule: "import/no-cycle",
    configFix: '"import/no-cycle": "error"',
  },
  {
    intent: "function length / complexity caps",
    linter: "eslint",
    keywords: [
      "max-lines-per-function",
      "max-depth",
      "max-params",
      "max-statements",
    ],
    rule: "max-lines-per-function",
    configFix: '"max-lines-per-function": ["error", 40]',
  },
  {
    intent: "no unused vars",
    linter: "eslint",
    keywords: ["no-unused-vars", "@typescript-eslint/no-unused-vars"],
    rule: "@typescript-eslint/no-unused-vars",
    inRecommended: true,
    configFix: '"@typescript-eslint/no-unused-vars": "error"',
  },
  {
    intent: "no non-null assertion",
    linter: "eslint",
    keywords: [
      "no-non-null-assertion",
      "@typescript-eslint/no-non-null-assertion",
    ],
    rule: "@typescript-eslint/no-non-null-assertion",
    inRecommended: true,
    configFix: '"@typescript-eslint/no-non-null-assertion": "error"',
  },
  {
    intent: "no floating promises",
    linter: "eslint",
    keywords: [
      "no-floating-promises",
      "@typescript-eslint/no-floating-promises",
    ],
    rule: "@typescript-eslint/no-floating-promises",
    inRecommended: true,
    configFix: '"@typescript-eslint/no-floating-promises": "error"',
  },
  {
    intent: "react hooks deps",
    linter: "eslint",
    keywords: ["react-hooks/exhaustive-deps", "exhaustive-deps"],
    rule: "react-hooks/exhaustive-deps",
    configFix: '"react-hooks/exhaustive-deps": "error"',
  },
  // Added from the hand-verified rule-adherence corpus (real repos: motion,
  // mapbox) — both are documented in the wild and have an off-the-shelf rule.
  {
    intent: "no default exports",
    linter: "eslint",
    keywords: ["import/no-default-export", "no-default-export"],
    rule: "import/no-default-export",
    configFix: '"import/no-default-export": "error"',
  },
  {
    intent: "no TODO / FIXME comments",
    linter: "eslint",
    keywords: ["no-warning-comments"],
    rule: "no-warning-comments",
    configFix:
      '"no-warning-comments": ["error", {"terms": ["todo", "fixme"], "location": "anywhere"}]',
  },
  // Grounded in the OSS-corpus sweep — rules real AGENTS.md files actually NAME
  // (cloudflare/workers-sdk names all three inline). Keyword set is rule-name /
  // code-shaped only, so it fires when the doc names the rule, never on prose.
  {
    intent: "require curly braces for control flow",
    linter: "eslint",
    keywords: ["curly", "curly braces"],
    rule: "curly",
    configFix: '"curly": ["error", "all"]',
  },
  {
    intent: "use import type for type-only imports",
    linter: "eslint",
    keywords: [
      "consistent-type-imports",
      "@typescript-eslint/consistent-type-imports",
    ],
    rule: "@typescript-eslint/consistent-type-imports",
    configFix: '"@typescript-eslint/consistent-type-imports": "error"',
  },
  {
    intent: "no focused / .only tests committed",
    linter: "eslint",
    keywords: [
      "no-only-tests",
      "no-focused-tests",
      "describe.only",
      "it.only",
      "test.only",
    ],
    rule: "no-only-tests/no-only-tests",
    configFix: '"no-only-tests/no-only-tests": "error"',
  },

  // --- Pylint (Python) — routing basics. These feed classify() (routing → reuse);
  // buildRuleInventory is gated to eslint (see below) because pylint is
  // ON-BY-DEFAULT (deny-list), so the eslint-shaped config-state check would
  // MISLABEL it (a symbol in `disable=` reads as "in-config", an absent one as
  // "enable it"). Accurate pylint enabled-state needs the inverted-polarity
  // ConfigProbe (research/rule-compiler-multilang-design.md §3), deferred —
  // classify() needs NO enabled-state, so pylint prose still routes honestly.
  // Keywords are code-shaped symbols + Python-UNAMBIGUOUS compounds (singular AND
  // plural, since matchesWholeToken is boundary-exact); bare ambiguous words
  // (`snake_case` — Rust/Ruby too, `import *` — JS `import * as`, "unused imports"
  // — collides with eslint) are deliberately EXCLUDED to avoid cross-language FPs.
  {
    intent: "no bare except (Python)",
    linter: "pylint",
    keywords: ["bare-except", "bare except", "W0702"],
    rule: "bare-except",
    configFix:
      "pylint enables bare-except (W0702) by default; keep it out of the disable list",
  },
  {
    intent: "no broad exception catch (Python)",
    linter: "pylint",
    keywords: [
      "broad-exception-caught",
      "broad except",
      "broad exception",
      "W0718",
    ],
    rule: "broad-exception-caught",
    configFix:
      "pylint enables broad-exception-caught (W0718) by default; keep it out of the disable list",
  },
  {
    intent: "require docstrings (Python)",
    linter: "pylint",
    // Bare "docstring"/"docstrings" removed — it over-fires on docstring
    // CONTENT/STYLE rules (the dogfood caught langchain's "docstring warnings" /
    // "backticks in docstrings"). Presence ("add docstrings", "docstrings for
    // each") is handled by the PATTERN_RULE_MAP docstring-presence pattern in
    // rule-routing.ts; only the rule SYMBOL matches here.
    keywords: ["missing-docstring", "missing-function-docstring", "C0116"],
    rule: "missing-function-docstring",
    configFix:
      "pylint enables missing-function-docstring (C0116) by default; keep it out of the disable list",
  },
  {
    intent: "no mutable default arguments (Python)",
    linter: "pylint",
    keywords: [
      "dangerous-default-value",
      "mutable default",
      "mutable default argument",
      "mutable default arguments",
      "W0102",
    ],
    rule: "dangerous-default-value",
    configFix:
      "pylint enables dangerous-default-value (W0102) by default; keep it out of the disable list",
  },
  {
    intent: "prefer f-strings (Python)",
    linter: "pylint",
    keywords: ["f-string", "f-strings", "consider-using-f-string", "C0209"],
    rule: "consider-using-f-string",
    configFix:
      "pylint enables consider-using-f-string (C0209) by default; keep it out of the disable list",
  },
  {
    intent: "consistent naming (Python)",
    linter: "pylint",
    keywords: ["invalid-name", "C0103"],
    rule: "invalid-name",
    configFix:
      "pylint enables invalid-name (C0103) by default; set naming-style in [tool.pylint], keep it out of disable",
  },
  {
    intent: "limit function arguments (Python)",
    linter: "pylint",
    keywords: ["too-many-arguments", "R0913"],
    rule: "too-many-arguments",
    configFix:
      "pylint enables too-many-arguments (R0913) by default; set max-args in [tool.pylint]",
  },
  {
    intent: "limit function length (Python)",
    linter: "pylint",
    keywords: ["too-many-statements", "R0915"],
    rule: "too-many-statements",
    configFix:
      "pylint enables too-many-statements (R0915) by default; set max-statements in [tool.pylint]",
  },
  {
    intent: "no wildcard imports (Python)",
    linter: "pylint",
    keywords: [
      "wildcard-import",
      "wildcard import",
      "wildcard imports",
      "W0401",
    ],
    rule: "wildcard-import",
    configFix:
      "pylint enables wildcard-import (W0401) by default; keep it out of the disable list",
  },
  {
    intent: "no global statement (Python)",
    linter: "pylint",
    keywords: ["global-statement", "global statement", "W0603"],
    rule: "global-statement",
    configFix:
      "pylint enables global-statement (W0603) by default; keep it out of the disable list",
  },
  {
    intent: "max line length (Python)",
    linter: "pylint",
    keywords: ["line-too-long", "C0301"],
    rule: "line-too-long",
    configFix:
      "pylint enables line-too-long (C0301) by default; set max-line-length in [tool.pylint]",
  },
  {
    intent: "no unused imports (Python)",
    linter: "pylint",
    keywords: ["unused-import", "W0611"],
    rule: "unused-import",
    configFix:
      "pylint enables unused-import (W0611) by default; keep it out of the disable list",
  },
];

/**
 * Whether the mapped rule is visible in the lint config text (textual grep —
 * imperfect, labelled). `contradiction` is the sharpest state: the harness
 * documents the rule as a norm, yet the config EXPLICITLY sets it to off/0 —
 * the docs and the config disagree.
 */
export type ConfigState =
  | "in-config"
  | "not-in-config"
  | "preset-maybe"
  | "contradiction";

/** One documented-intent → off-the-shelf-rule finding. */
export interface RuleInventoryItem {
  readonly intent: string;
  readonly linter: LinterName;
  /** The rule-name/token that matched in the instruction file. */
  readonly matched: string;
  /** The off-the-shelf rule that enforces it. */
  readonly rule: string;
  /** Whether `rule` appears anywhere in the provided config text. */
  readonly configState: ConfigState;
  /** The one-line config change to enforce it (shown when not in config). */
  readonly configFix: string;
}

/** Options for {@link buildRuleInventory}. */
export interface RuleInventoryOptions {
  /**
   * Restrict to the repo's detected linter(s). When omitted, all linters are
   * considered — safe because the keywords are rule-name-specific, but a caller
   * that knows the repo is Python-only can pass `["ruff"]` to avoid a stray
   * cross-language rule-name collision.
   */
  readonly linters?: readonly LinterName[];
}

/** Escape a keyword for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A keyword matches only as a WHOLE token: bounded by start/end or a
 * non-`[\w/@.-]` character on each side (so `no-console` matches in
 * `` `no-console` `` and `enforce no-console;` but `no-console-x` does not,
 * and prose containing the substring elsewhere never trips it).
 *
 * The TRAILING boundary is a lookahead, not a consuming class, so a keyword at
 * SENTENCE END ("No wildcard imports.") matches: a `.` is allowed unless it
 * CONTINUES a code token (`.log` in `console.log`), which still blocks a partial
 * match. `(?![\w/@-])` rejects a word/`/`/`@`/`-` continuation; `(?!\.[\w/@-])`
 * rejects a dotted continuation but permits a trailing sentence `.`.
 */
export function matchesWholeToken(text: string, keyword: string): boolean {
  const re = new RegExp(
    `(^|[^\\w/@.-])${escapeRe(keyword)}(?![\\w/@-])(?!\\.[\\w/@-])`,
    "i",
  );
  return re.test(text);
}

/**
 * Build the deterministic rule inventory. Pure: caller passes the instruction
 * file text (concatenated CLAUDE.md/AGENTS.md) and the lint config text (any
 * `eslint.config.*` / `.eslintrc*` / `ruff.toml` / … contents concatenated, or
 * "" if none). Returns one item per documented intent whose keyword resolves.
 * `not-in-config` items are the actionable nudges.
 */
/** ESLint re-exports some core rules under `@typescript-eslint/`; treat the base
 * and scoped names as the same rule when checking the config text (so a repo that
 * has base `no-unused-vars` satisfies the `@typescript-eslint/no-unused-vars`
 * intent, and vice-versa). oxlint/biome use the SAME rule names, so once their
 * config files are in the read set this handles them for free. */
function variantsOf(rule: string): string[] {
  const TS = "@typescript-eslint/";
  if (rule.startsWith(TS)) return [rule, rule.slice(TS.length)];
  if (!rule.includes("/")) return [rule, TS + rule];
  return [rule];
}

/** True if the rule (or a base/scoped variant) appears in the config text. */
function ruleInConfig(configText: string, rule: string): boolean {
  return variantsOf(rule).some((v) => matchesWholeToken(configText, v));
}

/**
 * Whether the rule (or a variant) is EXPLICITLY disabled in the config text —
 * `"no-console": "off"`, `no-console: 0`, `"no-console": ["off", …]`. Distinct
 * from mere presence ({@link ruleInConfig}): a documented rule that the config
 * turns OFF is a contradiction (docs say enforce, config disables), not an
 * enforcement. Textual only — never resolves/executes the config (the RCE path).
 * Conservative: matches only a literal off/0 severity right after the rule key,
 * so a real `"error"`/`"warn"`/`1`/`2` never trips it.
 */
function ruleSetOff(configText: string, rule: string): boolean {
  return variantsOf(rule).some((v) => {
    const re = new RegExp(
      `["']?${escapeRe(v)}["']?\\s*:\\s*(?:\\[\\s*)?["']?(?:off|0)\\b`,
      "i",
    );
    return re.test(configText);
  });
}

/** Index of the first WHOLE-token occurrence of `keyword` in `text` (the keyword
 * itself, not the boundary char), or -1. */
function firstTokenIndex(text: string, keyword: string): number {
  const re = new RegExp(
    `(^|[^\\w/@.-])(${escapeRe(keyword)})([^\\w/@.-]|$)`,
    "i",
  );
  const m = re.exec(text);
  return m ? m.index + m[1].length : -1;
}

/**
 * Whether the matched mention is a documented opt-OUT ("`no-explicit-any` is off
 * intentionally", "we disable X") rather than a norm to enforce. When the author
 * deliberately turns a rule off, a not-in-config state is CONSISTENT, not a gap —
 * nudging them to enable it is actively wrong advice (found dogfooding
 * pmndrs/react-spring). Deterministic negation window around the matched token;
 * conservative on purpose — only strong off/disable cues, so it never suppresses
 * a genuine "enforce this" nudge. */
function isDocumentedOptOut(text: string, keyword: string): boolean {
  const idx = firstTokenIndex(text, keyword);
  if (idx < 0) return false;
  // Test the context on EITHER SIDE of the token, never the token itself — else
  // the cue `disable` would match inside the rule name `eslint-disable` and
  // self-suppress every mention of it. Left/right windows are separate strings.
  // NB: `disabled` (full word) not `disable` — `disable` would match inside the
  // rule name `eslint-disable`, which can appear in a NEIGHBOURING token's window.
  const CUE = /\b(?:off|disabled|not enforced|not enabled|turned off)\b/i;
  const left = text.slice(Math.max(0, idx - 48), idx);
  const right = text.slice(idx + keyword.length, idx + keyword.length + 48);
  return CUE.test(left) || CUE.test(right);
}

/** A `recommended`-style preset extend anywhere in the config text — evidence
 * that preset-enabled rules may already be on even when not named literally.
 * Coarse on purpose: presence of a preset downgrades a not-named preset rule to
 * `preset-maybe` (no false "unenforced" alarm) rather than claiming it's off. */
function extendsRecommended(configText: string): boolean {
  return /recommended/i.test(configText);
}

export function buildRuleInventory(
  instructionText: string,
  configText: string,
  options: RuleInventoryOptions = {},
): RuleInventoryItem[] {
  const linters = options.linters;
  const items: RuleInventoryItem[] = [];
  for (const m of INTENT_MAP) {
    if (linters && !linters.includes(m.linter)) continue;
    // ROUTE-ONLY for non-eslint linters: the config-state check below
    // (ruleSetOff/ruleInConfig) is eslint-config-shaped and would MISLABEL a
    // pylint rule, which is ON-BY-DEFAULT (a symbol in `disable=` reads as
    // "in-config"; an absent one as "enable it" — both inverted). The routing
    // preview (classify) still reuses these; accurate pylint enabled-state waits
    // on the inverted-polarity ConfigProbe (design doc §3). Don't cry wolf.
    if (m.linter !== "eslint") continue;
    const matched = m.keywords.find((kw) =>
      matchesWholeToken(instructionText, kw),
    );
    if (!matched) continue;
    const off = ruleSetOff(configText, m.rule);
    const inConfig = ruleInConfig(configText, m.rule);
    // A rule the author documents as deliberately OFF, and whose config agrees
    // (absent, or literally set to off), is consistent — not a gap. Skip it so we
    // never nudge "enable X" against an intentional opt-out, and never flag a
    // documented opt-out as a contradiction.
    if (isDocumentedOptOut(instructionText, matched) && (off || !inConfig)) {
      continue;
    }
    // Precedence: an explicit off/0 is a contradiction even though the rule name
    // is technically "in config" — so it must be checked before `in-config`.
    const configState: ConfigState = off
      ? "contradiction"
      : inConfig
        ? "in-config"
        : m.inRecommended && extendsRecommended(configText)
          ? "preset-maybe"
          : "not-in-config";
    items.push({
      intent: m.intent,
      linter: m.linter,
      matched,
      rule: m.rule,
      configState,
      configFix: m.configFix,
    });
  }
  return items;
}
