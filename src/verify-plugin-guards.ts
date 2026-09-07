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
