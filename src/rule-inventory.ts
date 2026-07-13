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
interface IntentMapping {
  readonly intent: string;
  readonly linter: LinterName;
  /** Whole-token, code-shaped triggers only (no bare English words). */
  readonly keywords: readonly string[];
  /** The off-the-shelf rule that enforces this intent. */
  readonly rule: string;
  /** The one-line config change that turns it on. */
  readonly configFix: string;
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
const INTENT_MAP: readonly IntentMapping[] = [
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
    keywords: ["@ts-ignore", "ts-expect-error", "ban-ts-comment"],
    rule: "@typescript-eslint/ban-ts-comment",
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
    keywords: ["no-unused-vars"],
    rule: "@typescript-eslint/no-unused-vars",
    configFix: '"@typescript-eslint/no-unused-vars": "error"',
  },
  {
    intent: "no non-null assertion",
    linter: "eslint",
    keywords: ["no-non-null-assertion"],
    rule: "@typescript-eslint/no-non-null-assertion",
    configFix: '"@typescript-eslint/no-non-null-assertion": "error"',
  },
  {
    intent: "no floating promises",
    linter: "eslint",
    keywords: ["no-floating-promises"],
    rule: "@typescript-eslint/no-floating-promises",
    configFix: '"@typescript-eslint/no-floating-promises": "error"',
  },
  {
    intent: "react hooks deps",
    linter: "eslint",
    keywords: ["react-hooks/exhaustive-deps", "exhaustive-deps"],
    rule: "react-hooks/exhaustive-deps",
    configFix: '"react-hooks/exhaustive-deps": "error"',
  },
];

/** Whether the mapped rule is visible in the lint config text (textual grep — imperfect, labelled). */
export type ConfigState = "in-config" | "not-in-config";

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
 */
function matchesWholeToken(text: string, keyword: string): boolean {
  const re = new RegExp(
    `(^|[^\\w/@.-])${escapeRe(keyword)}([^\\w/@.-]|$)`,
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
export function buildRuleInventory(
  instructionText: string,
  configText: string,
  options: RuleInventoryOptions = {},
): RuleInventoryItem[] {
  const linters = options.linters;
  const items: RuleInventoryItem[] = [];
  for (const m of INTENT_MAP) {
    if (linters && !linters.includes(m.linter)) continue;
    const matched = m.keywords.find((kw) =>
      matchesWholeToken(instructionText, kw),
    );
    if (!matched) continue;
    const configState: ConfigState = matchesWholeToken(configText, m.rule)
      ? "in-config"
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
