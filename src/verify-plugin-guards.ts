/**
 * Sweep the disaster battery across every hook a plugin/repo actually DECLARES.
 *
 * 🔴 THE GAP THIS CLOSES, and it is the same one twice. `verifyGuardrail` takes a
 * COMMAND STRING. #211 taught it to honour a hook's `if:` condition — but only
 * when the caller remembers to pass it, and its own comment says so:
 *
 *     // `condition` + `protocol` are inherited from RunHookOptions — pass the
 *     // hook's declared `if` here …
 *
 * So "forgot to pass the condition" stayed a reachable state, and reaching it
 * produces exactly the false 7/7 that #211 existed to kill. The fix is not
 * another warning: it is to stop asking the caller for facts the config already
 * holds. This function reads the hook's command, event, matcher AND condition off
 * the same registration, so the three cannot be paired wrongly.
 *
 * WHAT IT IS NOT. It reports; it does not judge. There is deliberately no
 * throwing `assertPluginGuards`, because intent is DECLARED PER HOOK and a repo's
 * config declares none of it — we do not know which of a plugin's five hooks is
 * meant to be a bash-safety guard. `assertBlocksDisasters` remains the gate you
 * reach for once YOU have said which hook must block what; this is the sweep that
 * tells you which hooks are even in the conversation. Same neutrality
 * `formatGuardrailReport` already commits to, one level up.
 *
 * THREE THINGS THAT ARE NOT A VERDICT, and each has its own shape rather than a
 * quietly-zero score — the whole lesson of #211 is that a missing RUN must never
 * be readable as a finding:
 *
 *   - a hook on another EVENT (`Stop`, `SessionStart`, a `PostToolUse` nudge) is
 *     never asked about these calls at all;
 *   - a hook whose MATCHER cannot select the battery's tools likewise;
 *   - a hook whose COMMAND still names a variable nobody has set cannot be run as
 *     the harness runs it, so running it would measure a different program.
 *
 * A plugin with no hooks reports zero of everything and says so in `notes`. None
 * of these is "safe" and none is "blocks nothing".
 *
 * HARNESS-AGNOSTIC, with Claude Code as the default — the same shape as
 * {@link runHarnessTest}. Every piece it composes already takes its harness by
 * injection: `loadPlugin` takes a `PluginLayout`, `normalizeHooks` reads both the
 * CC-nested and Codex-flat shapes, and `decideHookCondition` treats a harness that
 * declares no condition support as having none. Narrowing this to Claude Code
 * would have been a choice, not a constraint, and `harness-parity-and-extensibility`
 * forbids the CC-first-and-bolt-the-rest-on shape. A harness whose hooks are not
 * shell processes (`capabilities.shellHooks === false`, e.g. OpenCode) reports
 * n/a in `notes` rather than an empty success.
 */
import { resolve } from "node:path";
import { loadPlugin } from "./plugin-loader.js";
import {
  normalizeHooks,
  type HookRegistration,
} from "./core/hook-normalize.js";
import { hookMatcherSelects } from "./core/hook-matcher.js";
import { claudeCodeAdapter } from "./adapters/claude-code/adapter.js";
import type { HarnessAdapter } from "./core/adapter.js";
import {
  DISASTER_CATALOG,
  guardrailRow,
  verifyGuardrail,
  type DisasterCategory,
  type DisasterEvent,
  type GuardrailResult,
} from "./guardrail-check.js";
import type { RunHookOptions } from "./run-hook.js";

/** The hook a sweep looked at, as its config declares it. */
export interface SweptHook {
  /** The event it registers under, e.g. `"PreToolUse"`. */
  readonly event: string;
  /** Its tool matcher, or `null` when it declares none (matches everything). */
  readonly matcher: string | null;
  /** Its condition as written (Claude Code's `if`), or `null` when unconditional. */
  readonly condition: string | null;
  /** The command, with the harness's plugin-root token already expanded. */
  readonly command: string;
  /**
   * Its position in the flattened registration list, so two hooks sharing a
   * command are still distinguishable in a report. Stable for one sweep of one
   * directory; not an identity across versions.
   */
  readonly index: number;
}

/**
 * What happened to one hook. A DISCRIMINATED UNION, not a result list plus three
 * nullable fields: `results` exists on exactly the outcome that has them, so
 * "read the score of a hook that was never run" is a type error rather than a
 * `0/7` someone quotes.
 */
export type SweptHookOutcome =
  | {
      /** The battery reached this hook; `results` holds one entry per event. */
      readonly status: "measured";
      readonly hook: SweptHook;
      /** One result per battery event, in catalog order. */
      readonly results: readonly GuardrailResult[];
      /** Ids of the events it denied. */
      readonly blocked: readonly string[];
      /** Ids it ran on and let through. */
      readonly allowed: readonly string[];
      /** Ids the harness would never have handed it (condition did not match). */
      readonly notRun: readonly string[];
    }
  | {
      /**
       * The battery does not apply to this hook — a different event, or a matcher
       * that selects none of the battery's tools. NOT a score of zero.
       */
      readonly status: "not-applicable";
      readonly hook: SweptHook;
      /** One line naming which of the two it is, and against what. */
      readonly reason: string;
    }
  | {
      /**
       * The command names a variable nothing has set, so the program we would run
       * is not the program the harness runs. Refusing is the honest answer; the
       * fix is in the caller's hands (pass `env`).
       */
      readonly status: "unresolved";
      readonly hook: SweptHook;
      /** One line naming the unset variables. */
      readonly reason: string;
    };

/** The whole sweep. */
export interface PluginGuardReport {
  /** The directory swept, resolved to an absolute path. */
  readonly dir: string;
  /** The adapter that read it, e.g. `"claude-code"`. */
  readonly harness: string;
  /** The event each disaster was delivered as (default `"PreToolUse"`). */
  readonly event: string;
  /** The battery that was used, so a report says what it measured against. */
  readonly events: readonly DisasterEvent[];
  /** One outcome per declared hook, in config order. */
  readonly hooks: readonly SweptHookOutcome[];
  /**
   * Why the sweep measured less than a reader might assume — no hooks declared,
   * a harness with no shell hooks, every hook on another event. Empty ONLY when
   * at least one hook was measured.
   *
   * 🔴 THIS IS THE EMPTY CASE'S VOICE. `hooks: []` on its own reads as a clean
   * bill of health, which is the exact false confidence the battery exists to
   * remove — so a sweep that measured nothing always says so in words.
   */
  readonly notes: readonly string[];
}

/** Options for {@link experimental_verifyPluginGuards}. */
export interface VerifyPluginGuardsOptions extends Omit<
  RunHookOptions,
  "condition" | "protocol"
> {
  /**
   * The harness to read the repo as. Defaults to Claude Code, so an existing
   * Claude Code repo needs nothing. The condition grammar and the block protocol
   * both come from this adapter's `hookProtocol`.
   */
  readonly adapter?: HarnessAdapter;
  /** Restrict the battery to these categories (default: the whole catalog). */
  readonly categories?: readonly DisasterCategory[];
  /** Override the battery entirely. */
  readonly events?: readonly DisasterEvent[];
  /** The event each disaster is delivered as (default `"PreToolUse"`). */
  readonly event?: string;
}
// `condition` and `protocol` are deliberately NOT accepted: the condition is read
// per hook from the config, and the protocol comes from the adapter. Letting a
// caller pass either would reintroduce the pairing mistake this exists to make
// unrepresentable — one hook's `if` applied to a different hook's command.

const DEFAULT_EVENT = "PreToolUse";

/** A `$NAME` / `${NAME}` reference — not `$(…)`, `$1` or `$@`. */
const VAR_REF = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g;

/**
 * Variables the command names that nothing would set at run time.
 *
 * Checked against the environment the hook would ACTUALLY get (the caller's `env`
 * layered over `process.env`) rather than against the mere presence of a `$`.
 * A repo whose hooks reference `$CLAUDE_PROJECT_DIR` is ordinary, and a caller
 * who passes that variable has resolved it — flagging them anyway would be the
 * cry-wolf shape, and the reader would stop reading the field.
 */
function unsetVariables(
  command: string,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const missing = new Set<string>();
  for (const [, name] of command.matchAll(VAR_REF))
    if (env[name] === undefined) missing.add(name);
  return [...missing];
}

/** The battery, after `categories` / `events` narrowing. */
function selectEvents(
  opts: VerifyPluginGuardsOptions,
): readonly DisasterEvent[] {
  if (opts.events) return opts.events;
  if (opts.categories) {
    const set = new Set(opts.categories);
    return DISASTER_CATALOG.filter((e) => set.has(e.category));
  }
  return DISASTER_CATALOG;
}

/** The distinct tools a battery names, for the matcher-reachability message. */
function toolsOf(events: readonly DisasterEvent[]): string[] {
  return [...new Set(events.map((e) => e.tool))];
}

/** One registration as the report names it. */
function sweptHook(reg: HookRegistration, index: number): SweptHook {
  return {
    event: reg.event,
    matcher: reg.matcher,
    condition: reg.condition,
    command: reg.command,
    index,
  };
}

/**
 * The environment each hook is run with: the harness's plugin-root variable set
 * to the real root, with the caller's `env` layered on top so they can override
 * it or add anything else.
 *
 * 🔴 WITHOUT THIS, THE COMMONEST HOOK SHAPE IN THE WILD READS AS `unresolved`.
 * `loadPlugin` expands the BRACED token (`${PLUGIN_ROOT}`) textually, but real
 * hooks are shell and are written unbraced (`node "$CLAUDE_PLUGIN_ROOT"/x.cjs` —
 * the vendored oh-my-claudecode shape). Setting the variable rather than doing a
 * second string substitution covers BOTH spellings with one mechanism, and it is
 * what the harness itself does: the shell in a real session resolves that name
 * because the harness put it in the environment.
 *
 * The NAME is derived from `layout.pluginRootToken`, never written out, so this
 * stays correct for a harness that spells its root differently.
 */
function hookEnvironment(
  layout: HarnessAdapter["layout"],
  root: string,
  callerEnv: Record<string, string> | undefined,
): Record<string, string> {
  const name = /^\$\{(.+)\}$/.exec(layout.pluginRootToken)?.[1];
  return { ...(name ? { [name]: root } : {}), ...callerEnv };
}

/** Everything a per-hook sweep needs beyond the registration itself. */
interface SweepContext {
  readonly battery: readonly DisasterEvent[];
  readonly eventName: string;
  readonly opts: VerifyPluginGuardsOptions;
  readonly protocol: NonNullable<HarnessAdapter["hookProtocol"]>;
  /** The env every hook is run with — the caller's, over the plugin root. */
  readonly env: Record<string, string>;
}

/**
 * Decide one hook, running the battery only when it could reach this hook at all.
 *
 * The three non-verdicts are settled BEFORE anything is spawned, in the order the
 * harness itself would settle them: it looks at the event, then the matcher, and
 * only then is there a process to run.
 */
function sweepHook(
  reg: HookRegistration,
  index: number,
  ctx: SweepContext,
): SweptHookOutcome {
  const { battery, eventName, opts, protocol, env } = ctx;
  const hook = sweptHook(reg, index);

  if (reg.event !== eventName)
    return {
      status: "not-applicable",
      hook,
      reason: `registered on ${reg.event}; this battery is delivered as ${eventName}, so the hook is never asked about these calls`,
    };

  const reachable = battery.filter((e) =>
    hookMatcherSelects(reg.matcher, e.tool),
  );
  if (reachable.length === 0)
    return {
      status: "not-applicable",
      hook,
      reason: `matcher \`${reg.matcher ?? ""}\` selects none of the tools this battery calls (${toolsOf(battery).join(", ")}) — the harness never spawns it here`,
    };

  const missing = unsetVariables(reg.command, { ...process.env, ...env });
  if (missing.length > 0)
    return {
      status: "unresolved",
      hook,
      reason: `the command names ${missing.map((v) => `\`$${v}\``).join(", ")}, which nothing sets here — running it would measure a different program than the harness runs. Pass \`env\` to resolve it`,
    };

  const ran = verifyGuardrail(reg.command, {
    ...opts,
    env,
    events: reachable,
    event: eventName,
    condition: reg.condition ?? undefined,
    protocol,
  });
  // The events the matcher excluded are folded back in as NOT-RUN entries, in
  // catalog order, so `results` always answers for the whole battery. Dropping
  // them would leave a hook reporting "1/1 blocked" for a battery of seven.
  const byId = new Map(ran.map((r) => [r.event.id, r]));
  const results = battery.map(
    (event) =>
      byId.get(event.id) ?? {
        event,
        blocked: false,
        exitCode: 0,
        ran: false,
        reason: `matcher \`${reg.matcher ?? ""}\` does not select ${event.tool} — the harness never spawns this hook for it`,
      },
  );

  const ids = (pick: (r: GuardrailResult) => boolean): string[] =>
    results.filter(pick).map((r) => r.event.id);
  return {
    status: "measured",
    hook,
    results,
    blocked: ids((r) => r.blocked),
    allowed: ids((r) => r.ran && !r.blocked),
    notRun: ids((r) => !r.ran),
  };
}

/** The `notes` a sweep owes its reader when it measured less than it looks like. */
function sweepNotes(
  dir: string,
  regs: readonly HookRegistration[],
  outcomes: readonly SweptHookOutcome[],
  eventName: string,
): string[] {
  if (outcomes.some((o) => o.status === "measured")) return [];
  if (regs.length === 0)
    return [
      `No hooks are declared in ${dir}. Nothing was measured — this is not a clean bill of health, it is an absence of guards.`,
    ];
  return [
    `${regs.length} hook(s) declared, none of them reachable by this battery on ${eventName}. Nothing was measured — read each hook's reason below rather than the (empty) score.`,
  ];
}

/**
 * Run the disaster battery against every hook a plugin or repo declares, using
 * each hook's OWN event, matcher and condition, and report per hook.
 *
 * ```ts
 * import { experimental_verifyPluginGuards } from "vigiles";
 *
 * const report = experimental_verifyPluginGuards(".");
 * for (const h of report.hooks) {
 *   if (h.status === "measured")
 *     console.log(`${h.blocked.length}/${h.results.length}  ${h.hook.command}`);
 *   else console.log(`⊘ ${h.status}  ${h.hook.command} — ${h.reason}`);
 * }
 * for (const note of report.notes) console.log(note);
 * ```
 *
 * Nothing here needs a model or a key. The hooks it finds are the ones the
 * harness would load, so a hook that is present on disk but not registered is
 * absent from the report by construction — which is the correct answer, and the
 * one you would not get by globbing `hooks/*.sh`.
 *
 * ⚠️ It RUNS each reachable hook. A hook is a program you did not necessarily
 * write, so point this at a repo whose hooks you are willing to execute, or pass
 * `trusted: false` / `sandbox: "auto"` (inherited from {@link RunHookOptions}) to
 * confine them. `verifyGuardrail` has always had the same property; sweeping a
 * whole plugin makes it worth saying out loud.
 *
 * @experimental Days old, with no consumer outside this repository. The REPORT
 * SHAPE is the part most likely to move — specifically whether `not-applicable`
 * stays one status or splits by cause, and whether the per-hook counts stay id
 * arrays. The prefix comes off when that shape survives sweeping several real
 * third-party repos unchanged; see docs/experimental.md.
 *
 * @param dir - the plugin or repo root to read hooks from.
 */
export function experimental_verifyPluginGuards(
  dir: string,
  opts: VerifyPluginGuardsOptions = {},
): PluginGuardReport {
  const adapter = opts.adapter ?? claudeCodeAdapter;
  const root = resolve(dir);
  const battery = selectEvents(opts);
  const eventName = opts.event ?? DEFAULT_EVENT;
  const base = {
    dir: root,
    harness: adapter.name,
    event: eventName,
    events: battery,
  };

  // A harness whose hooks are not shell processes has nothing this tier can
  // drive. Saying so is the `no-silent-skips` half — an empty `hooks` list with
  // no note is indistinguishable from "we looked and it was fine".
  if (!adapter.capabilities.shellHooks || !adapter.hookProtocol)
    return {
      ...base,
      hooks: [],
      notes: [
        `n/a — ${adapter.name} hooks are not shell processes, so the disaster battery cannot drive them. Nothing was measured.`,
      ],
    };

  const regs = normalizeHooks(loadPlugin(root, adapter.layout).settings.hooks);
  const ctx: SweepContext = {
    battery,
    eventName,
    opts,
    protocol: adapter.hookProtocol,
    env: hookEnvironment(adapter.layout, root, opts.env),
  };
  const hooks = regs.map((reg, i) => sweepHook(reg, i, ctx));
  return { ...base, hooks, notes: sweepNotes(root, regs, hooks, eventName) };
}

// ---------------------------------------------------------------------------
// Rendering. The one motivating use case for the sweep is "point the battery at
// YOUR hooks", and a caller who has to fold a discriminated union by hand before
// he can see that is being handed the library's internals instead of its answer.
// ---------------------------------------------------------------------------

/** Longest a command may run in a header line before it is elided. */
const COMMAND_WIDTH = 68;

/**
 * Hooks named under one not-measured reason before the rest are counted instead.
 *
 * 🔴 THE ONLY LOSSY STEP IN THIS RENDERER, and it is confined to the half where
 * the payload is the REASON rather than the hook. A repo can register dozens of
 * hooks and most will be irrelevant to a Bash battery, so listing every one of
 * them is a wall the reader skips — and the two lines that mattered are skipped
 * with it. Nothing is silently dropped: the group's count is exact, and the tail
 * line says how many more share the reason.
 */
const HOOKS_PER_REASON = 3;

/** A command as one short line — hooks are shell, and may be long or multi-line. */
function oneLine(command: string, width = COMMAND_WIDTH): string {
  const flat = command.replace(/\s+/g, " ").trim();
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
}

/** `n thing` / `n things`, so a count never sits as a bare number beside a noun. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** How the config selects this hook — the three facts the sweep read off it. */
function hookMeta(hook: SweptHook): string {
  const parts = [
    hook.event,
    hook.matcher === null
      ? "no matcher (every tool)"
      : `matcher \`${hook.matcher}\``,
  ];
  if (hook.condition !== null) parts.push(`if \`${hook.condition}\``);
  return parts.join(" · ");
}

type MeasuredOutcome = Extract<SweptHookOutcome, { status: "measured" }>;
type UnmeasuredOutcome = Exclude<SweptHookOutcome, MeasuredOutcome>;

/**
 * One measured hook: a headline carrying its count, the selection facts, then one
 * row per battery event in the SAME vocabulary `formatGuardrailReport` prints —
 * they share {@link guardrailRow}, so the two reports cannot drift into two
 * spellings of the same three outcomes.
 */
function measuredBlock(outcome: MeasuredOutcome): string[] {
  return [
    `  #${outcome.hook.index}  blocks ${outcome.blocked.length}/${outcome.results.length}  \`${oneLine(outcome.hook.command)}\``,
    `      ${hookMeta(outcome.hook)}`,
    ...outcome.results.map((r) => `      ${guardrailRow(r)}`),
  ];
}

/** The distinct reasons in a set of unmeasured hooks, each with the hooks it covers. */
function byReason(
  outcomes: readonly UnmeasuredOutcome[],
): { reason: string; hooks: SweptHook[] }[] {
  const groups = new Map<string, SweptHook[]>();
  for (const o of outcomes) {
    const hooks = groups.get(o.reason) ?? [];
    hooks.push(o.hook);
    groups.set(o.reason, hooks);
  }
  return [...groups].map(([reason, hooks]) => ({ reason, hooks }));
}

/**
 * One unmeasured status, grouped by reason.
 *
 * 🔴 NO COUNT APPEARS HERE, and that is this half's whole contract: a hook the
 * battery never reached has no score, so printing `0/7` beside it would
 * reproduce — in rendering, one layer above the type system — exactly the false
 * confidence the discriminated union was built to make unrepresentable. The
 * reason is the payload; the hooks are listed under it.
 */
function unmeasuredSection(
  label: string,
  outcomes: readonly UnmeasuredOutcome[],
): string[] {
  if (outcomes.length === 0) return [];
  const lines = [`  ⊘ ${label} — ${plural(outcomes.length, "hook")}`];
  for (const group of byReason(outcomes)) {
    lines.push(`     ${group.reason}`);
    for (const hook of group.hooks.slice(0, HOOKS_PER_REASON))
      lines.push(`       #${hook.index}  \`${oneLine(hook.command, 56)}\``);
    const rest = group.hooks.length - HOOKS_PER_REASON;
    if (rest > 0)
      lines.push(`       …and ${plural(rest, "more hook")} for this reason`);
  }
  return lines;
}

/**
 * The census — what was declared and what became of it. Never a score.
 *
 * Omitted entirely when nothing was declared, because a row of zeroes reads as a
 * scoreboard, and the `notes` directly below already say what happened in words.
 * `notes` is guaranteed non-empty in that case: it is empty ONLY when some hook
 * was measured.
 */
function censusLine(report: PluginGuardReport): string[] {
  if (report.hooks.length === 0) return [];
  const count = (status: SweptHookOutcome["status"]): number =>
    report.hooks.filter((h) => h.status === status).length;
  return [
    `${plural(report.hooks.length, "hook")} declared: ${count("measured")} measured, ${count("unresolved")} unresolved, ${count("not-applicable")} not applicable.`,
  ];
}

/** The closing notes, printed once for the whole sweep rather than per hook. */
function footer(measured: readonly MeasuredOutcome[]): string[] {
  const lines: string[] = [];
  if (measured.some((m) => m.allowed.length > 0))
    lines.push(
      "",
      "Allows ≠ a bug unless a guard is MEANT to block them — gate intent with",
      "assertBlocksDisasters(cmd, { categories: [...] }).",
    );
  if (measured.some((m) => m.notRun.length > 0))
    lines.push(
      "",
      "⊘ Some events never reached a hook: its condition does not match them, so it",
      "cannot protect you there however its body is written.",
    );
  return lines;
}

/**
 * Render a {@link PluginGuardReport} as terminal text.
 *
 * ```ts
 * import {
 *   experimental_verifyPluginGuards,
 *   experimental_formatPluginGuardReport,
 * } from "vigiles";
 *
 * console.log(
 *   experimental_formatPluginGuardReport(experimental_verifyPluginGuards(".")),
 * );
 * ```
 *
 * NEUTRAL, the same way {@link formatGuardrailReport} is: it reports what each
 * hook blocks without deciding whether that was the hook's job. A repo's config
 * never says which of its hooks is meant to be a bash-safety guard, so a verdict
 * here would be invented rather than read.
 *
 * 🔴 A HOOK THE BATTERY NEVER REACHED IS NEVER GIVEN A NUMBER. A `measured` hook
 * prints `blocks n/7`; a `not-applicable` or `unresolved` one prints its REASON
 * under a `⊘` heading and no count at all, because a rendered `0/7` is the same
 * false confidence the discriminated union exists to prevent, reintroduced one
 * layer up where the type system can no longer see it. For the same reason the
 * report's `notes` are printed FIRST and in full: a sweep that measured nothing
 * has to say so in words, since an output with no rows reads as a clean bill of
 * health.
 *
 * MANY HOOKS STAY READABLE by grouping the unmeasured half BY REASON — a repo
 * with thirty hooks usually has two or three distinct reasons — and naming at
 * most {@link HOOKS_PER_REASON} hooks per reason before counting the rest. The
 * measured half is never collapsed: those are the hooks you came for.
 *
 * @experimental It renders {@link PluginGuardReport}, whose SHAPE is the part
 * most likely to move (see {@link experimental_verifyPluginGuards}), so a stable
 * name here would promise a stability its only input does not have. The prefix
 * comes off with the same change that takes it off the report.
 *
 * @param report - a sweep from {@link experimental_verifyPluginGuards}.
 */
export function experimental_formatPluginGuardReport(
  report: PluginGuardReport,
): string {
  const measured = report.hooks.filter(
    (h): h is MeasuredOutcome => h.status === "measured",
  );
  const unmeasured = (status: UnmeasuredOutcome["status"]) =>
    report.hooks.filter((h): h is UnmeasuredOutcome => h.status === status);

  const lines = [
    `Guard sweep of ${report.dir} — ${report.harness} · ${plural(report.events.length, "dangerous action")} delivered as ${report.event}`,
    ...censusLine(report),
    // The empty case's voice, verbatim and above everything else: `hooks: []`
    // renders as an absence of rows, which is indistinguishable from "we looked
    // and it was fine" unless the words are there to say otherwise.
    ...report.notes.flatMap((note) => ["", `⚠ ${note}`]),
  ];

  if (measured.length > 0)
    lines.push("", "MEASURED", ...measured.flatMap(measuredBlock));

  const notMeasured = [
    ...unmeasuredSection("unresolved", unmeasured("unresolved")),
    ...unmeasuredSection("not applicable", unmeasured("not-applicable")),
  ];
  if (notMeasured.length > 0)
    lines.push(
      "",
      "NOT MEASURED — nothing below has a score; each group says why",
      ...notMeasured,
    );

  return [...lines, ...footer(measured)].join("\n");
}
