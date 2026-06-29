/**
 * Pure decision logic for `vigiles init`.
 *
 * Turns CLI args + whether a human's at a TTY into a concrete setup PLAN, so the
 * IO-heavy `setup()` in cli.ts stays a thin shell and every choice is unit-tested.
 * Best-practice onboarding: **interactive** when a human runs it in a terminal,
 * **non-interactive** (sensible defaults) for agents / CI / piped input — so
 * "set up vigiles" from a Claude Code or Codex prompt Just Works without hanging
 * on a prompt. See docs/agent-setup.md.
 */

/** What `vigiles init` will set up. */
export interface SetupPlan {
  /** Lint pillar — verify instruction-file references (specs, types, compile, lint, hooks). */
  lint: boolean;
  /** Test pillar — test the harness (scaffold a starter harness test + CI job). */
  test: boolean;
  /** Wire CI (the `zernie/vigiles@v1` Action; creates a workflow if none). */
  gha: boolean;
  /** Install the Claude Code plugin (hooks + skills). */
  plugin: boolean;
  /** Strict rule severities in `.vigilesrc.json`. */
  strict: boolean;
  /** Rewrite an existing STALE CI workflow in place (instead of only warning). */
  force: boolean;
}

/** The explicit choices a user pinned via flags (undefined = "not specified"). */
export interface ParsedSetupArgs {
  target?: string;
  strict: boolean;
  /** `--report-only` — write the gating rules at "warn" (nothing fails CI). The
   * orthogonal severity dial; composes with `--strict` (which rules) by setting
   * their severity. */
  reportOnly: boolean;
  yes: boolean;
  /** `--force` — rewrite a stale CI workflow in place. */
  force: boolean;
  /** Lint pillar — `--lint` → true, `--no-lint` → false, absent → undefined. */
  lint?: boolean;
  /** Test pillar — `--test` → true, `--no-test` → false, absent → undefined. */
  test?: boolean;
  /** `--harness=claude,codex` override (empty = auto-detect). */
  harness?: string;
  gha?: boolean;
  plugin?: boolean;
}

function flagValue(
  args: readonly string[],
  prefix: string,
): string | undefined {
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** `--name` → true, `--no-name` → false, neither present → undefined. */
function boolFlag(args: readonly string[], name: string): boolean | undefined {
  if (args.includes(`--${name}`)) return true;
  if (args.includes(`--no-${name}`)) return false;
  return undefined;
}

/** Parse `init` args into the choices the user pinned. The two pillars are
 * selected with `--lint` / `--test`. */
export function parseSetupArgs(args: readonly string[]): ParsedSetupArgs {
  return {
    target: flagValue(args, "--target="),
    strict: args.includes("--strict"),
    reportOnly: args.includes("--report-only"),
    yes: args.includes("--yes") || args.includes("-y"),
    force: args.includes("--force"),
    lint: boolFlag(args, "lint"),
    test: boolFlag(args, "test"),
    harness: flagValue(args, "--harness="),
    gha: args.includes("--no-gha") ? false : undefined,
    plugin: args.includes("--no-plugin") ? false : undefined,
  };
}

/** The non-interactive defaults: both pillars, CI, and the plugin. */
export function defaultPlan(strict = false): SetupPlan {
  return {
    lint: true,
    test: true,
    gha: true,
    plugin: true,
    strict,
    force: false,
  };
}

/**
 * Pure config-merge for what `vigiles init` writes to `.vigilesrc.json`: record
 * the `harness` if absent, add strict rule severities if `--strict`, NEVER
 * clobber an existing key. Returns the merged config, or `null` when nothing
 * changed (so the IO layer skips the write). The IO (read/parse/write + the
 * malformed-file guard) stays in cli.ts.
 */
/**
 * The structural rules `init` gates BY DEFAULT (severity `error`, so a broken
 * surface fails `vigiles lint`). Every one is HIGH-PRECISION / FP-safe — it fires
 * only on a genuine defect (a never-available/typo'd tool, a subagent missing
 * `name`/`description`, a typo'd hook event, a dead hook script, a broken MCP
 * ref, two skills that collide in the selector) — so a well-formed plugin stays
 * green and catching real breakage out of the box never cries wolf.
 *
 * Deliberately EXCLUDES `require-instructions-spec` and the workflow-forcing rules:
 * those make a CLEAN repo fail (you simply haven't written the spec/test yet), so
 * they stay opt-in under `--strict` (progressive adoption — see
 * `STRICT_EXTRA_RULES`).
 *
 * This is the **`structural`** rule group (see research/install-enforcement-dx.md).
 */
export const STRUCTURAL_RULES = [
  "subagent-tool-contract",
  "subagent-frontmatter",
  "hook-events",
  "hook-script-exists",
  "mcp-config",
  "mcp-tool-resolves",
  "mcp-hook-target-resolves",
  "disallowed-tools-contract",
  "description-overlap",
] as const;

/**
 * The **`workflow`** group — the WORKFLOW-FORCING / opinionated tier `--strict`
 * gates, which a clean repo can still fail because you haven't done the work yet:
 * a spec per instruction file (`require-instructions-spec`), a test/eval per
 * surface (`untested-*`). Opt-in by design (the smooth-adoption on-ramp). The
 * Clippy-`pedantic` / TS-`strict` analog — ONE opinionated opt-in.
 *
 * NB `frontmatter-valid` / `skill-frontmatter` live in the `nudge` group, not
 * here: they're acknowledged-noisy recommendations we never gate on (see
 * research/install-enforcement-dx.md).
 */
export const WORKFLOW_RULES = [
  "require-instructions-spec",
  "untested-skill",
  "untested-subagent",
  "untested-hook",
] as const;

/**
 * The **`nudge`** group — recommendations / acknowledged-noisy checks that NEVER
 * gate (not even under `--strict`): `frontmatter-valid` (js-yaml is stricter than
 * CC's loader), `skill-frontmatter` (skills load without it) and `unmarked-refs`
 * (the undecidable-plaintext nudge) sit at `warn`; `prefer-compiled-hooks` defaults
 * OFF (a recommendation that shouldn't fire unasked — the shell lane stays
 * first-class). `lethal-trifecta` + `skill-resource-resolves` are here for now on a
 * don't-cry-wolf rollout (default `warn`; a team raises either to `error` by hand
 * once it's confirmed quiet on their corpus). `init` does not write these — they
 * keep their own default severities. Named for the group taxonomy
 * (research/install-enforcement-dx.md).
 */
export const NUDGE_RULES = [
  "frontmatter-valid",
  "skill-frontmatter",
  "prefer-compiled-hooks",
  "unmarked-refs",
  "lethal-trifecta",
  "skill-resource-resolves",
] as const;

export function mergeProjectConfig(
  existing: Record<string, unknown>,
  opts: {
    harness: string | string[];
    strict: boolean;
    reportOnly?: boolean;
    /** Whether the LINT pillar is on (default true). The rule gate is a lint-layer
     * concern, so a test-only setup (`init --test` / `--no-lint`) records the
     * harness but writes NO lint rules. */
    lint?: boolean;
  },
): Record<string, unknown> | null {
  const config = { ...existing };
  let changed = false;
  if (config.harness === undefined) {
    config.harness = opts.harness;
    changed = true;
  }
  // The rule gate belongs to the LINT layer — a test-only setup records the
  // harness but writes no rules (honoring the positive-flag contract that
  // `--test` selects only the test pillar).
  if (opts.lint !== false) {
    // Gate the FP-safe `structural` group by default; `--strict` adds the
    // `workflow` group on top. `--report-only` is the orthogonal severity dial —
    // it writes the SAME rule set at "warn" (nothing fails CI; the
    // migration/observe mode). Never clobber a severity the user already set —
    // only fill the undefined ones.
    const severity = opts.reportOnly ? "warn" : "error";
    const gate = opts.strict
      ? [...STRUCTURAL_RULES, ...WORKFLOW_RULES]
      : [...STRUCTURAL_RULES];
    const rules = { ...(config.rules as Record<string, unknown> | undefined) };
    for (const r of gate) {
      if (rules[r] === undefined) {
        rules[r] = severity;
        changed = true;
      }
    }
    config.rules = rules;
  }
  return changed ? config : null;
}

/**
 * Whether to drop into interactive prompts: a human at a TTY who passed neither
 * `--yes` nor an explicit `--target`, and who hasn't already pinned every choice
 * via flags. Agents / CI / piped input (no TTY) never prompt.
 */
export function shouldPrompt(parsed: ParsedSetupArgs, isTTY: boolean): boolean {
  if (!isTTY || parsed.yes || parsed.target) return false;
  const pillarsPinned = parsed.lint !== undefined || parsed.test !== undefined;
  const allPinned =
    pillarsPinned && parsed.gha !== undefined && parsed.plugin !== undefined;
  return !allPinned;
}

/** Interactive answers (only the fields the prompts cover). */
export type SetupAnswers = Partial<
  Pick<SetupPlan, "lint" | "test" | "gha" | "plugin" | "strict">
>;

/** Ask one question with a default — injected so the interactive Q&A is pure +
 *  unit-testable (a fake `ask` scripts answers; no TTY, no readline). */
export type AskFn = (question: string, def: string) => Promise<string>;

const isYesAnswer = (s: string): boolean => /^y(es)?$/i.test(s);

/**
 * The interactive setup Q&A as PURE logic over an injected `ask` — the prompts,
 * their defaults, and the answer→`SetupAnswers` mapping. The IO shell (readline)
 * lives in `cli.ts`'s `promptSetup`, which just supplies a real `ask`. Keeping
 * this here means the fragile interactive path is unit-tested deterministically
 * (the questions can't silently break) without a terminal.
 */
export async function collectSetupAnswers(ask: AskFn): Promise<SetupAnswers> {
  const pillars = (
    await ask("Set up which pillars? [both/lint/test] (both): ", "both")
  ).toLowerCase();
  const gha = isYesAnswer(await ask("Wire CI (GitHub Action)? [Y/n]: ", "y"));
  const plugin = isYesAnswer(
    await ask("Install the Claude Code plugin (hooks + skills)? [Y/n]: ", "y"),
  );
  // Structural gating (broken tools/hooks/MCP/collisions) is always on. This asks
  // about the WORKFLOW tier — a spec per file + a test per surface — which a clean
  // repo can fail just for not having done the work yet, so it's the recommended
  // default a human opts OUT of (never forced on a silent run).
  const strict = isYesAnswer(
    await ask(
      "Also enforce specs + a test per surface (recommended)? [Y/n]: ",
      "y",
    ),
  );
  return {
    lint: pillars !== "test",
    test: pillars !== "lint" && pillars !== "verify",
    gha,
    plugin,
    strict,
  };
}

/**
 * Apply the pillar flags. A positive flag (`--lint` and/or `--test`) is an
 * explicit SELECTION — enable exactly the named pillars. Otherwise default to
 * both and let a `--no-*` flag drop one.
 */
function applyPillarFlags(plan: SetupPlan, parsed: ParsedSetupArgs): void {
  if (parsed.lint === true || parsed.test === true) {
    plan.lint = parsed.lint === true;
    plan.test = parsed.test === true;
    return;
  }
  if (parsed.lint === false) plan.lint = false;
  if (parsed.test === false) plan.test = false;
}

function applyAnswers(plan: SetupPlan, answers: SetupAnswers): void {
  if (answers.lint !== undefined) plan.lint = answers.lint;
  if (answers.test !== undefined) plan.test = answers.test;
  if (answers.gha !== undefined) plan.gha = answers.gha;
  if (answers.plugin !== undefined) plan.plugin = answers.plugin;
  if (answers.strict !== undefined) plan.strict = answers.strict;
}

/**
 * How to install vigiles's skills/hooks for ONE harness — the deterministic
 * decision behind the IO in cli.ts, so a CI test asserts WHICH commands an
 * install runs without a network call or a real `claude`/`codex` binary.
 *
 * The method is genuinely harness-specific: Claude Code has a GLOBAL plugin
 * marketplace (installs to ~/.claude/plugins/, nothing in the repo); Codex has
 * no global store — its config is repo-committed (`.codex/`, AGENTS.md), so its
 * instructions are read directly and skills are an opt-in, repo-local concern.
 */
export interface InstallPlan {
  harness: string;
  /** Shell commands to auto-run (empty = nothing runnable here). */
  commands: string[];
  /** One-line success message printed after the commands run. */
  successMessage: string;
  /** The equivalent commands a user runs by hand (printed on failure / no-CLI). */
  manualSteps: string[];
  /** Always-printed informational lines (where it installs, caveats). */
  notes: string[];
  /** Whether this method writes files into the consumer's repo (vendoring). */
  vendors: boolean;
}

/** Per-harness install plan. `hasClaude` gates the auto-run `claude plugin` CLI
 * (else the same two steps are printed as `/plugin` slash commands).
 *
 * Both methods install GLOBALLY, never into the repo: Claude through its plugin
 * marketplace (~/.claude/plugins/), Codex through the cross-agent `skills` CLI
 * with `-g -y` (the global store ~/.agents/skills/, which Codex reads). Codex
 * gets the skills but NOT hooks — Codex hook wiring (.codex/config.toml [hooks])
 * is not automated yet. */
export function planPluginInstall(
  harnesses: readonly string[],
  opts: { hasClaude: boolean },
): InstallPlan[] {
  return harnesses.map((harness) => {
    if (harness === "claude") {
      return {
        harness,
        commands: opts.hasClaude
          ? [
              "claude plugin marketplace add zernie/vigiles",
              "claude plugin install vigiles@vigiles",
            ]
          : [],
        successMessage:
          "✓ Installed the vigiles plugin (hooks + skills) into ~/.claude/plugins/",
        manualSteps: [
          "/plugin marketplace add zernie/vigiles",
          "/plugin install vigiles@vigiles",
        ],
        notes: [
          "Installs globally to ~/.claude/plugins/ — nothing is added to your repo.",
        ],
        vendors: false,
      };
    }
    if (harness === "codex") {
      // The cross-agent `skills` CLI with `-g -y` installs to the global store
      // ~/.agents/skills/ (NOT the repo, and NOT ~/.codex/ — verified against
      // the real CLI). Skills only; Codex hooks (.codex/config.toml [hooks])
      // are not wired automatically.
      return {
        harness,
        commands: ["npx --yes skills add zernie/vigiles -a codex -g -y"],
        successMessage:
          "✓ Installed the vigiles skills into ~/.agents/skills/ (global, not vendored)",
        manualSteps: ["npx skills add zernie/vigiles -a codex -g -y"],
        notes: [
          "Codex reads AGENTS.md directly; the skills install globally to ~/.agents/skills/ (not the repo).",
          "Codex hooks (.codex/config.toml [hooks]) are not auto-wired yet — add them manually for compile-on-edit.",
        ],
        vendors: false,
      };
    }
    return {
      harness,
      commands: [],
      successMessage: "",
      manualSteps: [],
      notes: [`No plugin install path for harness '${harness}'.`],
      vendors: false,
    };
  });
}

/**
 * Resolve the final plan: defaults, then flags, then interactive answers (each
 * layer overrides the previous only where it has an opinion). `--target` pins a
 * bare lint-pillar spec (no harness scaffold).
 */
export function resolvePlan(
  parsed: ParsedSetupArgs,
  answers?: SetupAnswers,
): SetupPlan {
  const plan = defaultPlan(parsed.strict);
  applyPillarFlags(plan, parsed);
  if (parsed.gha === false) plan.gha = false;
  if (parsed.plugin === false) plan.plugin = false;
  if (parsed.force) plan.force = true;
  if (parsed.target) plan.test = false;
  if (answers) applyAnswers(plan, answers);
  return plan;
}
