/**
 * vigiles v2 — Executable specification system.
 *
 * Specs are TypeScript files that compile to instruction files (CLAUDE.md, SKILL.md).
 * The spec is the source of truth. The markdown is a build artifact.
 *
 * Two rule types:
 *   enforce() — delegated to an external linter (ESLint, Ruff, Clippy, etc.)
 *   guidance() — prose only, no mechanical enforcement
 */

// ---------------------------------------------------------------------------
// Template literal types for type-safe linter references
// ---------------------------------------------------------------------------

/** Linters and policy catalogs vigiles can cross-reference. */
type BuiltinLinter =
  | "eslint"
  | "stylelint"
  | "ruff"
  | "clippy"
  | "pylint"
  | "rubocop"
  | "cedar";

/** Scoped ESLint plugin prefix (e.g., @typescript-eslint). */
type ScopedPlugin = `@${string}/${string}`;

/** A linter/rule reference: "eslint/no-console", "ruff/T201", "@typescript-eslint/no-explicit-any". */
export type LinterRule = `${BuiltinLinter}/${string}` | ScopedPlugin;

/** Vigiles-proven rule reference: "vigiles/<assertion-id>". */
export type VigilesRef = `vigiles/${string}`;

/** Any enforcement reference. */
export type EnforcementRef = LinterRule | VigilesRef;

// ---------------------------------------------------------------------------
// Type augmentation points for generate-types (#1 + #6)
//
// When `vigiles generate-types` runs, it emits a .d.ts that populates these
// interfaces via declaration merging. This narrows enforce(), file(), and
// cmd() signatures from "any string" to "only known valid references."
//
// Without generated types: interfaces are empty, strict types fall back to
// broad LinterRule / string. No change in behavior.
//
// With generated types: enforce("eslint/no-consolee") → type error in editor.
// ---------------------------------------------------------------------------

/**
 * Populated by generate-types with per-linter rule unions.
 * Keys are linter prefixes ("eslint", "@typescript-eslint", "ruff", etc.),
 * values are unions of enabled rule names.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KnownLinterRules {}

/**
 * Populated by generate-types with project file paths.
 * Single key "files" maps to a union of relative paths.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KnownProjectFiles {}

/**
 * Populated by generate-types with npm script names.
 * Single key "scripts" maps to a union of script names.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KnownNpmScripts {}

/**
 * When KnownLinterRules is populated, narrows to exact rule unions.
 * Falls back to broad LinterRule when no generated types exist.
 */
export type StrictLinterRule = [keyof KnownLinterRules] extends [never]
  ? LinterRule
  : {
      [K in keyof KnownLinterRules]: `${K & string}/${KnownLinterRules[K] & string}`;
    }[keyof KnownLinterRules];

/**
 * When KnownProjectFiles is populated, narrows file() to known paths.
 * Falls back to string when no generated types exist.
 */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-duplicate-type-constituents */
export type StrictFile = [keyof KnownProjectFiles] extends [never]
  ? string
  : KnownProjectFiles[keyof KnownProjectFiles] & string;

export type StrictCmd = [keyof KnownNpmScripts] extends [never]
  ? string
  :
      | `npm run ${KnownNpmScripts[keyof KnownNpmScripts] & string}`
      | `npm ${KnownNpmScripts[keyof KnownNpmScripts] & string}`
      | (string & {}); // escape hatch for non-npm commands
/* eslint-enable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-duplicate-type-constituents */

// ---------------------------------------------------------------------------
// Claude Code tool types (for hook validation)
// ---------------------------------------------------------------------------

export type ClaudeTool =
  | "Read"
  | "Write"
  | "Edit"
  | "Bash"
  | "Grep"
  | "Glob"
  | "Agent"
  | "TodoWrite"
  | "WebSearch"
  | "WebFetch"
  | "NotebookEdit";

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PreSession"
  | "PostSession"
  | "Notification";

// ---------------------------------------------------------------------------
// Rule types
// ---------------------------------------------------------------------------

/** A rule delegated to an external tool (linter, ast-grep, dependency-cruiser, etc.) or to a vigiles-internal check. */
export interface EnforceRule {
  readonly _kind: "enforce";
  readonly linterRule: LinterRule | VigilesRef;
  readonly why: string;
  /** Skip verification for this rule. Default: true (verify). */
  readonly verify: boolean;
}

/** A guidance-only rule (prose, no enforcement). */
export interface GuidanceRule {
  readonly _kind: "guidance";
  readonly text: string;
}

/** A reactive rule: runs a command when watched files change. */
export interface GuardRule {
  readonly _kind: "guard";
  readonly watch: string | readonly string[];
  readonly run: string;
  readonly description: string;
}

export type Rule = EnforceRule | GuidanceRule | GuardRule;

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/**
 * Declare a rule enforced by an external tool or vigiles itself.
 *
 * When generated types are present, the `linterRule` argument is narrowed
 * to only accept rules that exist in your linter configs. Vigiles-internal
 * checks use the `vigiles/<assertion-id>` namespace and are dispatched to
 * built-in mechanical validators (e.g. `vigiles/orphan-docs`).
 *
 *   enforce("eslint/no-console", "Use structured logger.")
 *   enforce("@typescript-eslint/no-floating-promises", "Always await.")
 *   enforce("ruff/T201", "Use logging module.")
 *   enforce("vigiles/orphan-docs", "No docs without spec references.")
 */
export function enforce(
  ref: NoInfer<StrictLinterRule> | VigilesRef,
  why: string,
  options?: { verify?: boolean },
): EnforceRule {
  return {
    _kind: "enforce",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    linterRule: ref as LinterRule | VigilesRef,
    why,
    verify: options?.verify ?? true,
  };
}

/**
 * Declare a guidance-only rule.
 *
 *   guidance("Google unfamiliar APIs before implementing.")
 */
export function guidance(text: string): GuidanceRule {
  return { _kind: "guidance", text };
}

/**
 * Declare a reactive guard: runs a command when watched files change.
 *
 *   guard({ watch: "*.spec.ts", run: "npx vigiles compile" }, "Recompile on spec change")
 *   guard({ watch: ["eslint.config.*", "package.json"], run: "npx vigiles generate-types" }, "Regen types")
 */
export function guard(
  options: { watch: string | readonly string[]; run: string },
  description: string,
): GuardRule {
  return {
    _kind: "guard",
    watch: options.watch,
    run: options.run,
    description,
  };
}

// ---------------------------------------------------------------------------
// Reference helpers for skill instructions
// ---------------------------------------------------------------------------

/**
 * Branded string types — these prove a reference has gone through
 * vigiles's verification. The compiler only accepts branded refs,
 * not raw strings, for path-sensitive positions.
 */
declare const __brand: unique symbol;
export type VerifiedPath = string & { readonly [__brand]: "VerifiedPath" };
export type VerifiedCmd = string & { readonly [__brand]: "VerifiedCmd" };
export type VerifiedRef = string & { readonly [__brand]: "VerifiedRef" };

/** A typed file reference — verified at compile time. */
export interface FileRef {
  readonly _ref: "file";
  readonly path: VerifiedPath;
}

/** A typed command reference — verified at compile time. */
export interface CmdRef {
  readonly _ref: "cmd";
  readonly command: VerifiedCmd;
}

/** A typed cross-reference to another instruction file/skill. */
export interface SkillRef {
  readonly _ref: "skill";
  readonly path: VerifiedRef;
}

/** A typed symbol reference — the named file must define the named symbol. */
export interface SymbolRef {
  readonly _ref: "symbol";
  readonly file: VerifiedPath;
  readonly symbol: string;
}

export type Ref = FileRef | CmdRef | SkillRef | SymbolRef;

/**
 * Reference a file path — verified to exist at compile time.
 * When generated types are present, narrowed to known project files.
 */
export function file(path: NoInfer<StrictFile>): FileRef {
  return { _ref: "file", path: path as VerifiedPath };
}

/**
 * Reference a command — verified against package.json at compile time.
 * When generated types are present, narrowed to known npm scripts.
 */
export function cmd(command: NoInfer<StrictCmd>): CmdRef {
  return { _ref: "cmd", command: command as VerifiedCmd };
}

/**
 * Reference a symbol defined in a file — verified at compile time that the
 * named file exists AND defines the named symbol (via ast-grep, cross-language).
 * Compiles to the file-qualified inline form `` `file#symbol` `` so the markdown
 * `audit` / `refs-hook` re-verify the same reference.
 */
export function symbol(file: NoInfer<StrictFile>, name: string): SymbolRef {
  return { _ref: "symbol", file: file as VerifiedPath, symbol: name };
}

/**
 * Reference another skill or instruction file — verified to exist.
 * Compiles to a markdown link: [skill name](path)
 */
export function ref(path: string): SkillRef {
  return { _ref: "skill", path: path as VerifiedRef };
}

// ---------------------------------------------------------------------------
// Instruction template — process refs inside skill instructions
// ---------------------------------------------------------------------------

export type InstructionFragment = string | Ref;

/**
 * Tagged template literal for skill instructions with typed references.
 *
 *   instructions`
 *     Check ${file("eslint.config.ts")} for rules.
 *     Run ${cmd("npm test")} to verify.
 *     See ${ref("skills/other/SKILL.md")} for format.
 *   `
 */
export function instructions(
  strings: TemplateStringsArray,
  ...values: InstructionFragment[]
): InstructionFragment[] {
  const result: InstructionFragment[] = [];
  for (let i = 0; i < strings.length; i++) {
    if (strings[i]) result.push(strings[i]);
    if (i < values.length) result.push(values[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLAUDE.md spec (#5 — conditional maxSectionLines)
// ---------------------------------------------------------------------------

/** Known markdown instruction file targets. */
export type InstructionTarget = "CLAUDE.md" | "AGENTS.md" | (string & {}); // escape hatch for custom targets

export interface ClaudeSpec {
  readonly _specType: "claude";
  /**
   * Output filename(s). Defaults to "CLAUDE.md". Also used as the h1 heading.
   * Pass an array to compile one spec to multiple targets (e.g., CLAUDE.md + AGENTS.md).
   */
  readonly target?: InstructionTarget | InstructionTarget[];
  /** npm scripts / shell commands → descriptions. Verified against package.json. */
  readonly commands?: Record<string, string>;
  /** File paths → descriptions. Verified via existsSync. */
  readonly keyFiles?: Record<string, string>;
  /** Named prose sections — plain strings or tagged templates with file()/cmd()/ref(). */
  readonly sections?: Record<string, string | InstructionFragment[]>;
  /** Maximum lines per prose section (per-spec override). */
  readonly maxSectionLines?: number;
  /**
   * Maximum estimated tokens for the compiled output (~4 chars per token).
   * Compile fails if exceeded. Matches ETH Zurich 2511.12884 finding that
   * files over ~300 lines / ~2000 tokens degrade agent task success.
   */
  readonly maxTokens?: number;
  /** Rules: enforce(), check(), or guidance(). */
  readonly rules: Record<string, Rule>;
}

/**
 * Input type for claude() — maxSectionLines is only valid when sections are provided.
 * TypeScript errors if you set maxSectionLines without defining sections.
 */
type ClaudeSpecBase = {
  readonly target?: InstructionTarget | InstructionTarget[];
  readonly commands?: Record<string, string>;
  readonly keyFiles?: Record<string, string>;
  readonly maxTokens?: number;
  readonly rules: Record<string, Rule>;
};

type ClaudeSpecSections =
  | {
      readonly sections: Record<string, string | InstructionFragment[]>;
      readonly maxSectionLines?: number;
    }
  | { readonly sections?: undefined; readonly maxSectionLines?: never };

type ClaudeSpecInput = ClaudeSpecBase & ClaudeSpecSections;

/**
 * Define a CLAUDE.md specification.
 *
 *   // CLAUDE.md.spec.ts
 *   export default claude({ commands: {...}, rules: {...} });
 */
export function claude(spec: ClaudeSpecInput): ClaudeSpec {
  return { _specType: "claude", ...spec } as ClaudeSpec;
}

// ---------------------------------------------------------------------------
// SKILL.md spec
// ---------------------------------------------------------------------------

/**
 * A deterministic gate on a skill step or its final result. A gate is one of:
 * a command (exit 0), a file (must exist), or a *project role* that resolves to
 * the host project's real command at run time. cmd/file gates are verified
 * against the repo at author time; role gates are portable — a skill that runs
 * in other repos should prefer `project("test")` over a hard-coded `npm test`.
 */
export type Gate = CmdRef | FileRef | RoleGate;

/** Project command roles, resolved per host project at run time. */
export type ProjectRole = "test" | "build" | "lint";

/** A portable gate that resolves to the host project's command for a role. */
export interface RoleGate {
  readonly _ref: "role";
  readonly role: ProjectRole;
}

/**
 * A portable gate that resolves to the host project's command for a role
 * (e.g. `project("test")` → `npm test` / `pytest` / `cargo test`). Use this
 * in skills meant to run across projects, instead of hard-coding a command.
 */
export function project(role: ProjectRole): RoleGate {
  return { _ref: "role", role };
}

/**
 * A declared skill input. Compiles to the `argument-hint` frontmatter and a
 * `## Arguments` section; referenced as `$1`/`$2`/`$ARGUMENTS` in the body.
 */
export interface SkillInput {
  /** Argument name, e.g. "pattern". */
  readonly name: string;
  /** Human-readable hint shown in argument-hint and the Arguments section. */
  readonly hint: string;
  /** Required by default; set false to render as optional (`[<name>]`). */
  readonly required?: boolean;
}

/** One step of a gated skill pipeline. */
export interface SkillStep {
  /** What the model should do — prose, optionally with typed refs. */
  readonly do: string | InstructionFragment[];
  /** Deterministic check that must pass before advancing to the next step. */
  readonly gate?: Gate;
  /** Max attempts to satisfy the gate before the step fails (default 1). */
  readonly retry?: number;
}

/** Declare a skill input (compiles to argument-hint + an Arguments entry). */
export function input(
  name: string,
  hint: string,
  opts: { required?: boolean } = {},
): SkillInput {
  return { name, hint, required: opts.required };
}

/** Declare a gated pipeline step. */
export function step(
  instr: string | InstructionFragment[],
  opts: { gate?: Gate; retry?: number } = {},
): SkillStep {
  return { do: instr, gate: opts.gate, retry: opts.retry };
}

export interface SkillSpec {
  readonly _specType: "skill";
  /** Skill name (used in frontmatter). */
  readonly name: string;
  /** Short description (used in frontmatter). */
  readonly description: string;
  /**
   * Hint for the argument (frontmatter). Ignored when `inputs` is set —
   * `inputs` derive the argument-hint instead.
   */
  readonly argumentHint?: string;
  /** Typed inputs — compile to argument-hint + a `## Arguments` section. */
  readonly inputs?: readonly SkillInput[];
  /** Whether to disable model invocation (frontmatter flag). */
  readonly disableModelInvocation?: boolean;
  /**
   * Gated pipeline steps. When set, the skill compiles to a `## Steps`
   * checklist with a deterministic gate per step. Use this OR `body`.
   */
  readonly steps?: readonly SkillStep[];
  /**
   * Terminal postcondition — the skill is "done" only when this gate passes.
   * Compiles to a `## Result` section + a `vigiles:result` marker.
   */
  readonly result?: Gate;
  /** Freeform instruction body (linear/unstructured skills). Use this OR `steps`. */
  readonly body?: string | InstructionFragment[];
  /**
   * Max lines for an inline fenced code block before compilation errors,
   * forcing the script into a file referenced via `file()` (default 20).
   * Keeps big scripts out of the skill body (token budget + progressive
   * disclosure). Set 0 to disable.
   */
  readonly maxInlineCodeLines?: number;
}

/**
 * Define a SKILL.md specification.
 *
 *   // skills/my-skill/SKILL.md.spec.ts
 *   export default skill({ name: "my-skill", description: "...", body: "..." });
 */
export function skill(spec: Omit<SkillSpec, "_specType">): SkillSpec {
  return { _specType: "skill", ...spec };
}

// ---------------------------------------------------------------------------
// Subagent specs
// ---------------------------------------------------------------------------

/**
 * A subagent definition (compiles to `agents/<name>.md`). Unlike a skill —
 * reference material the model reads on activation — a subagent is a *delegated
 * worker with a contract*: a dispatch `description`, an allowed-`tools` rail, an
 * optional `model`, a system-prompt `body`, and the `rules` it must follow. That
 * tool contract + those rules are the "railway" a subagent runs on, and they're
 * exactly the compile-time-verifiable surface vigiles owns: the body's
 * `file()`/`cmd()`/`symbol()` marks are checked like any instruction file, and
 * the tools list is verified against the real tool set.
 */
export interface AgentSpec {
  readonly _specType: "agent";
  /** Subagent name (frontmatter + dispatch handle). */
  readonly name: string;
  /** When to dispatch this subagent — the trigger (frontmatter). */
  readonly description: string;
  /** Model alias (e.g. "sonnet", "opus", "haiku", "inherit"). Optional. */
  readonly model?: string;
  /**
   * The allowed-tools contract — the rails the worker runs on. Each entry must be
   * a known built-in tool (Read/Write/Edit/Bash/Grep/Glob/WebSearch/WebFetch/
   * NotebookEdit/TodoWrite/Task/Skill) or an MCP tool (`mcp__server__tool`).
   * Omit to inherit all tools. Verified at compile time.
   */
  readonly tools?: readonly string[];
  /**
   * The lead/intro prose of the system prompt (the "You are…" opener), before any
   * sections. Carries verified `file()`/`cmd()`/`symbol()`/`ref()` marks. No
   * markdown headers — use `sections` for those.
   */
  readonly body?: string | InstructionFragment[];
  /**
   * Named `##` sections of the system prompt (e.g. Purpose, Core Principles,
   * Capabilities) — the shape real subagents actually take. Same verified-ref +
   * no-nested-`##` rules as a CLAUDE.md spec's sections. Use `body` for the intro
   * and `sections` for the structured rest.
   */
  readonly sections?: Record<string, string | InstructionFragment[]>;
  /** Rules the worker must follow — rendered as a `## Rules` section. */
  readonly rules?: Record<string, Rule>;
}

/**
 * Define a subagent specification (compiles to `agents/<name>.md`).
 *
 *   // agents/reviewer.md.spec.ts
 *   export default agent({
 *     name: "reviewer",
 *     description: "Review a diff for correctness. Dispatch PROACTIVELY after edits.",
 *     model: "sonnet",
 *     tools: ["Read", "Grep", "Bash"],
 *     body: instructions`Review the diff. Run ${cmd("npm test")} first.`,
 *     rules: {
 *       "no-floating": enforce("@typescript-eslint/no-floating-promises", "Await promises."),
 *     },
 *   });
 */
export function agent(spec: Omit<AgentSpec, "_specType">): AgentSpec {
  return { _specType: "agent", ...spec };
}

// ---------------------------------------------------------------------------
// Spec file naming convention (#11)
//
// Type-level proof that a spec filename maps to its output.
// SpecPath<"CLAUDE.md"> = "CLAUDE.md.spec.ts"
// ---------------------------------------------------------------------------

/** Derive the spec filename from an output filename. */
export type SpecPath<Output extends `${string}.md`> = `${Output}.spec.ts`;

/** Extract the output filename from a spec filename. */
export type OutputPath<Spec extends `${string}.md.spec.ts`> =
  Spec extends `${infer Base}.spec.ts` ? Base : never;

// ---------------------------------------------------------------------------
// Compile pipeline phantom types (#7)
//
// Branded stages track which validations have been applied.
// The compiler can only emit markdown from a fully-validated spec.
// ---------------------------------------------------------------------------

declare const __stage: unique symbol;

/** A spec that hasn't been validated yet. */
export type RawSpec<T extends ClaudeSpec | SkillSpec = ClaudeSpec> = T & {
  readonly [__stage]: "raw";
};

/** A spec whose file/cmd/ref references have been validated. */
export type RefsValidated<T extends ClaudeSpec | SkillSpec = ClaudeSpec> = T & {
  readonly [__stage]: "refs-validated";
};

/** A spec whose linter rules have been cross-referenced. */
export type LintersVerified<T extends ClaudeSpec | SkillSpec = ClaudeSpec> =
  T & {
    readonly [__stage]: "linters-verified";
  };

/** A fully validated spec, ready for markdown emission. */
export type ReadyToEmit<T extends ClaudeSpec | SkillSpec = ClaudeSpec> = T & {
  readonly [__stage]: "ready";
};

// ---------------------------------------------------------------------------
// Project-level config
// ---------------------------------------------------------------------------

/** Per-linter verification mode. */
export type LinterMode = boolean | "catalog-only";

export interface VigilesV2Config {
  /** Glob pattern to discover spec files. Default: "**\/*.spec.ts" */
  readonly specs?: string;
  /** Auto-discover linter rules for coverage reporting. */
  readonly discover?: boolean;
  /** Maximum rules per spec file. */
  readonly maxRules?: number;
  /** Maximum estimated tokens for compiled output. ~4 chars per token. */
  readonly maxTokens?: number;
  /** Maximum lines per prose section. Forces splitting into named sections. */
  readonly maxSectionLines?: number;
  /** Global kill switch: skip ALL linter verification during compile. */
  readonly verifyLinters?: boolean;
  /** Per-linter verification mode: true (full), "catalog-only", or false (skip). */
  readonly linters?: Record<string, LinterMode>;
}

export function defineConfig(config: VigilesV2Config): VigilesV2Config {
  return config;
}
