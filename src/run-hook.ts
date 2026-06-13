/**
 * vigiles — the *unit* tier for Claude Code hooks.
 *
 * A hook is just a process: Claude Code pipes a JSON event to its stdin and
 * reads back an exit code (0 ok, 2 = block) and, optionally, a JSON decision on
 * stdout. `runHook` exercises exactly that contract directly — no `claude`
 * binary, no model, no sandbox — so a hook's logic can be unit-tested in
 * milliseconds:
 *
 *   const r = runHook('"$GUARD" ', {
 *     hook_event_name: "PreToolUse",
 *     tool_name: "Bash",
 *     tool_input: { command: "git commit --no-verify" },
 *   }, { env: { GUARD: guardPath } });
 *   assert.ok(r.blocked);            // exit 2 / decision:block / permission:deny
 *
 * Why this exists alongside `runHarnessTest`:
 *   - It is the cheap base of the pyramid — no CLI dependency, runs anywhere.
 *   - It reaches every event. The deterministic `runHarnessTest` mock can drive
 *     SessionStart/Stop/UserPromptSubmit/Bash PreToolUse|PostToolUse, but NOT
 *     Edit/Write tool events (headless-gated), PreCompact, Notification,
 *     SessionEnd, or SubagentStop. At this tier you hand the hook the event
 *     JSON yourself, so all of them are testable.
 *
 * It does NOT prove the hook is *wired* into the harness (that the settings
 * point at it, that `${CLAUDE_PLUGIN_ROOT}` resolves) — that is what the
 * `plugin:` loader + `runHarnessTest` cover. Use both: unit-test the hook's
 * logic here, then assert it fires in the assembled machine there.
 */
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildEgressNft,
  buildEgressBwrapArgv,
  resolveAllow,
  parseResolvers,
  parseNftCounters,
  countersToResult,
  egressAvailable,
  type EgressFiles,
} from "./egress.js";
import {
  decideSandbox,
  sandboxAvailable,
  bwrapArgs,
  setenvArgs,
  parseEgressLog,
  diffTrees,
  type SandboxMode,
  type EgressAttempt,
} from "./sandbox.js";

export type { EgressAttempt };

/** A hook event payload (the JSON Claude Code writes to the hook's stdin). */
export interface HookInput {
  /** e.g. "PreToolUse", "PostToolUse", "Stop", "SessionStart", "PreCompact". */
  readonly hook_event_name?: string;
  /** PreToolUse/PostToolUse. */
  readonly tool_name?: string;
  readonly tool_input?: unknown;
  readonly tool_response?: unknown;
  /** UserPromptSubmit. */
  readonly prompt?: string;
  /** SessionStart. */
  readonly source?: string;
  /** Stop / SubagentStop. */
  readonly stop_hook_active?: boolean;
  /** Any other event-specific fields. */
  readonly [k: string]: unknown;
}

/** The JSON a hook may print on stdout (all fields optional). */
export interface HookOutput {
  readonly decision?: "approve" | "block";
  readonly reason?: string;
  readonly continue?: boolean;
  readonly stopReason?: string;
  readonly suppressOutput?: boolean;
  readonly systemMessage?: string;
  readonly hookSpecificOutput?: {
    readonly hookEventName?: string;
    readonly permissionDecision?: "allow" | "deny" | "ask";
    readonly permissionDecisionReason?: string;
    readonly additionalContext?: string;
  };
  readonly [k: string]: unknown;
}

export interface RunHookOptions {
  /** Working directory for the hook process. Default: a value won't be set. */
  readonly cwd?: string;
  /** Extra env vars (merged over process.env). `{cwd}` in values is left as-is. */
  readonly env?: Record<string, string>;
  /** Per-run timeout ms. Default 10000. */
  readonly timeoutMs?: number;
  /**
   * Provenance of the hook command. `true` (default) means YOU authored it — the
   * usual case at this tier, a command written inline in the test — so it runs
   * directly. `false` marks it foreign (a vendored third-party hook script),
   * which makes confinement the DEFAULT: with no explicit `sandbox`, an untrusted
   * hook behaves as `sandbox: "auto"` — confined under bubblewrap, or refused if
   * none is available — so foreign code is never run unconfined by accident. This
   * mirrors the harness tier, where trust follows `plugin`/`pluginDir`
   * provenance (`specTrusted` in `src/sandbox.ts`); the unit tier takes a raw
   * command string with no provenance signal, so you declare it here.
   *
   * Why this is opt-in (untrusted) and not always-on: the sandbox isn't always
   * available (Linux + working userns only — forcing it would *refuse* a hook you
   * wrote on macOS/hardened CI), it's deliberately hostile (no egress,
   * `--clearenv`, empty HOME, read-only fs — a false failure for trusted code that
   * needs the network or an env var), trust follows provenance (you already
   * vouched for inline code), and direct exec is ms vs. the confined path's
   * setup+spawn. See `docs/sandboxing.md` ("Why confinement is opt-in"). Use
   * `sandbox: "strict"` to force confinement even on trusted code.
   */
  readonly trusted?: boolean;
  /**
   * Confine the hook under bubblewrap (Linux). When unset, the mode follows
   * {@link RunHookOptions.trusted}: a trusted hook runs directly (`false`), an
   * untrusted one is confined-or-refused (`"auto"`). Set it explicitly to
   * override: `"auto"`/`"strict"` force confinement (a no-egress namespace with a
   * cleared environment — your `opts.env` is added back — or a **refusal** if no
   * bwrap is available), and `false` is the opt-out that runs even untrusted code
   * unconfined. macOS/Windows have no bwrap, so `"auto"`/`"strict"` throw there —
   * see `src/sandbox.ts`.
   */
  readonly sandbox?: SandboxMode;
  /**
   * Record the hook's network egress. Implies confinement (the recorder lives in
   * the sandbox netns, so this forces a sandboxed run and refuses if no sandbox is
   * available). A recording proxy on loopback captures every `host:port` a
   * proxy-honoring tool (npm/pip/curl/fetch) tries to reach — surfaced as
   * {@link HookRunResult.egress} — while the netns still **blocks** it (nothing
   * actually leaves). Use it to test what a hook/skill phones home to, or which
   * registry an install would hit. Raw-socket egress is blocked but not recorded
   * (it never reaches the proxy) — the block is the boundary, the record is
   * best-effort observability over it.
   */
  readonly recordEgress?: boolean;
  /**
   * Allowlisted egress: let the hook actually reach the network, but ONLY the
   * listed hosts, with the boundary at the **packet layer** (an `nft` allowlist
   * inside the sandbox netns, fed by `slirp4netns`) — so a raw socket to an
   * off-list host is dropped too, which a `recordEgress`/`HTTP_PROXY` allowlist
   * cannot guarantee. Use it to test a hook/skill whose setup needs a real
   * `npm install` from a registry you expect, and nothing else. Implies
   * confinement (it needs the netns), and **refuses** if bubblewrap + slirp4netns
   * + nft aren't available. The hosts are resolved to IPs at launch; results land
   * in {@link HookRunResult.egress} (the allowlisted hosts that were reached, with
   * `allowed: true`) and {@link HookRunResult.egressDropped} (how much off-list
   * traffic was blocked). See `docs/sandboxing.md`.
   */
  readonly egress?: { readonly allow: readonly string[] };
}

export interface HookRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Parsed stdout JSON if the hook emitted a JSON decision, else null. */
  readonly json: HookOutput | null;
  /**
   * Normalized decision: a deny/block via exit 2, `decision:"block"`, or
   * `permissionDecision:"deny"` all set `blocked = true`.
   */
  readonly blocked: boolean;
  /**
   * Network egress the hook attempted. With {@link RunHookOptions.recordEgress}:
   * every (blocked) attempt the proxy saw. With {@link RunHookOptions.egress}: the
   * allowlisted hosts that were actually reached (`allowed: true`, with packet
   * counts). Empty otherwise.
   */
  readonly egress: readonly EgressAttempt[];
  /**
   * Allowlisted-egress mode only: the aggregate off-allowlist traffic the
   * packet-layer wall dropped. `packets === 0` means the hook stayed entirely
   * within the allowlist. Undefined when {@link RunHookOptions.egress} was unset.
   */
  readonly egressDropped?: { readonly packets: number; readonly bytes: number };
  /**
   * Files the hook wrote to its work dir (relative paths), recorded on confined
   * runs — what a hook touched on disk. Empty on a direct (unconfined) run.
   * Assert over it with `assertNoWrite` / `assertWroteOnly`.
   */
  readonly filesWritten: readonly string[];
  /**
   * The decision the hook expressed, preferring the structured
   * `permissionDecision` ("allow"|"deny"|"ask") then legacy `decision`
   * ("approve"|"block"), else undefined.
   */
  readonly decision:
    | HookOutput["decision"]
    | "allow"
    | "deny"
    | "ask"
    | undefined;
}

/** Parse stdout as a hook JSON decision (pure, testable without a process). */
export function parseHookOutput(stdout: string): HookOutput | null {
  const s = stdout.trim();
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s) as HookOutput;
  } catch {
    return null;
  }
}

/**
 * Decide whether a hook result blocked, and the normalized decision. Pure, so
 * the policy is unit-testable independent of spawning anything.
 */
export function decideHook(
  exitCode: number,
  json: HookOutput | null,
): { blocked: boolean; decision: HookRunResult["decision"] } {
  const permission = json?.hookSpecificOutput?.permissionDecision;
  const decision = permission ?? json?.decision;
  const blocked = exitCode === 2 || decision === "block" || decision === "deny";
  return { blocked, decision };
}

/** The raw fields of a hook spawn that the result parser needs. */
export interface HookSpawnResult {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Egress attempts captured by the in-sandbox recorder (recordEgress only). */
  readonly egress?: readonly EgressAttempt[];
  /** Off-allowlist traffic the packet-layer wall dropped (egress mode only). */
  readonly egressDropped?: { readonly packets: number; readonly bytes: number };
  /** Files the hook wrote to its work dir (confined runs). */
  readonly filesWritten?: readonly string[];
}

/** Spawn a hook (command + piped event) — the injectable seam over the real spawn. */
export type HookSpawner = (
  command: string,
  input: HookInput,
  opts: RunHookOptions,
) => HookSpawnResult;

/** The spawn seams `runHookWith` needs, so its decision logic is testable. */
export interface RunHookDeps {
  /** Whether bubblewrap confinement is available (Linux + bwrap). */
  readonly available: boolean;
  /** Whether allowlisted egress is available (bwrap + slirp4netns + nft). */
  readonly egressAvailable: boolean;
  /** Run the command directly (unconfined). */
  readonly direct: HookSpawner;
  /** Run the command confined under bubblewrap. */
  readonly sandboxed: HookSpawner;
  /** Run the command confined with an allowlisted-egress netns. */
  readonly egress: HookSpawner;
}

/**
 * The hook-run orchestration with injectable spawn seams: pick direct vs.
 * confined via the safe-by-default policy (`decideSandbox`), then parse the exit
 * code + stdout into a normalized decision. Exported so all three branches
 * (direct / sandbox / refuse) are unit-tested with fake spawners — no real
 * bwrap. `runHook` is this with the real seams.
 */
export function runHookWith(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
  deps: RunHookDeps,
): HookRunResult {
  // Allowlisted egress is its own confined path (bwrap netns + slirp4netns + nft);
  // it can't run unconfined, so it refuses outright when the tooling is absent
  // rather than falling back to a direct run that would ignore the allowlist.
  const res = opts.egress
    ? runEgress(command, input, opts, deps)
    : runConfinedOrDirect(command, input, opts, deps);
  const exitCode = res.status ?? (res.signal ? 1 : 0);
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  const json = parseHookOutput(stdout);
  const { blocked, decision: dec } = decideHook(exitCode, json);
  return {
    exitCode,
    stdout,
    stderr,
    json,
    blocked,
    egress: res.egress ?? [],
    egressDropped: res.egressDropped,
    filesWritten: res.filesWritten ?? [],
    decision: dec,
  };
}

/** The allowlisted-egress branch: confine-with-netns, or refuse if unavailable. */
function runEgress(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
  deps: RunHookDeps,
): HookSpawnResult {
  if (!deps.egressAvailable) {
    throw new Error(
      "refusing to run egress: { allow } without the allowlist sandbox: it " +
        "needs Linux + bubblewrap (bwrap) + slirp4netns + nft — install them to " +
        "run with a packet-layer egress allowlist, or use recordEgress to record " +
        "and block instead",
    );
  }
  return deps.egress(command, input, opts);
}

/** The default branch: pick direct vs. confined via the safe-by-default policy. */
function runConfinedOrDirect(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
  deps: RunHookDeps,
): HookSpawnResult {
  // Confinement follows provenance: a trusted hook (the default) runs directly;
  // marking a hook untrusted defaults it to "auto" (confine-or-refuse), so
  // foreign code is never run unconfined by accident. An explicit `sandbox`
  // overrides the default either way. The trust fed to decideSandbox stays
  // `false` at this tier — a raw command has no provenance, so an explicit
  // "auto"/"strict" here is always a request to *confine*, not "trusted→direct".
  // recordEgress needs the netns recorder, so it forces confinement too.
  const mode: SandboxMode =
    opts.sandbox ??
    (opts.trusted === false || opts.recordEgress ? "auto" : false);
  const decision = decideSandbox({
    trusted: false,
    mode,
    available: deps.available,
  });
  if (decision.action === "throw") throw new Error(decision.reason);
  return decision.action === "sandbox"
    ? deps.sandboxed(command, input, opts)
    : deps.direct(command, input, opts);
}

/** Run the hook command directly through a shell (the default, unconfined). */
function directSpawn(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
): HookSpawnResult {
  const res = spawnSync(command, {
    shell: true,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? 10000,
  });
  return {
    status: res.status,
    signal: res.signal,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/* v8 ignore start -- spawns real bwrap; exercised by the bwrap-gated integration
   test (skipped without bwrap). The decision logic is runHookWith (unit-tested
   with fakes); the confinement argv is bwrapArgs/setenvArgs and the egress log
   parse is parseEgressLog (all unit-tested). */

// When recordEgress is on: co-launch the recorder on loopback, point HTTP(S)_PROXY
// at it, run the hook, then stop it. Paths come in via env (no shell escaping).
const EGRESS_WRAPPER = [
  'node "$VIG_EGRESS_ENTRY" "$VIG_EGRESS_LOG" "$VIG_EGRESS_PORT" &',
  "EPID=$!",
  "i=0",
  'while [ ! -s "$VIG_EGRESS_PORT" ] && [ "$i" -lt 100 ]; do sleep 0.05; i=$((i+1)); done',
  'export HTTP_PROXY="http://127.0.0.1:$(cat "$VIG_EGRESS_PORT")"',
  'export HTTPS_PROXY="$HTTP_PROXY" http_proxy="$HTTP_PROXY" https_proxy="$HTTP_PROXY"',
  // Node's fetch (undici) ignores the proxy env unless this is set — without it a
  // hook that uses fetch() (e.g. an update check) would bypass the recorder.
  "export NODE_USE_ENV_PROXY=1",
  'sh -c "$VIG_HOOK_CMD"',
  "code=$?",
  'kill "$EPID" 2>/dev/null',
  'exit "$code"',
].join("\n");

function egressProxyEntry(): string {
  return (
    [
      join(__dirname, "egress-proxy.js"),
      join(__dirname, "..", "dist", "egress-proxy.js"),
    ].find((p) => existsSync(p)) ?? join(__dirname, "egress-proxy.js")
  );
}

/** Map every file under `dir` to a content signature (size:mtime), recursively. */
function snapshotTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, r);
      else out[r] = `${String(st.size)}:${String(st.mtimeMs)}`;
    }
  };
  try {
    walk(dir, "");
  } catch {
    /* dir removed mid-walk — best effort */
  }
  return out;
}

function sandboxedSpawn(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
): HookSpawnResult {
  const ioDir = mkdtempSync(join(tmpdir(), "vigiles-hook-sbx-"));
  const home = join(ioDir, "home");
  mkdirSync(home);
  // The hook's confined writable work dir: the caller's cwd if given, else a
  // dedicated `work/` under the IO dir (kept separate from the egress log/home so
  // those don't pollute the filesWritten diff).
  const work = opts.cwd ?? join(ioDir, "work");
  mkdirSync(work, { recursive: true });
  try {
    const baseArgs = [
      ...bwrapArgs({
        cwd: work,
        ioDir,
        home,
        path: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      }),
      ...setenvArgs(opts.env ?? {}),
    ];
    const spawnOpts = {
      cwd: work,
      env: process.env,
      input: JSON.stringify(input),
      encoding: "utf-8" as const,
      timeout: opts.timeoutMs ?? 10000,
    };
    const before = snapshotTree(work);
    let res;
    let egress: readonly EgressAttempt[] = [];
    if (opts.recordEgress) {
      const egressLog = join(ioDir, "egress.ndjson");
      const portFile = join(ioDir, "egress.port");
      writeFileSync(egressLog, "");
      res = spawnSync(
        "bwrap",
        [
          ...baseArgs,
          "--setenv",
          "VIG_EGRESS_ENTRY",
          egressProxyEntry(),
          "--setenv",
          "VIG_EGRESS_LOG",
          egressLog,
          "--setenv",
          "VIG_EGRESS_PORT",
          portFile,
          "--setenv",
          "VIG_HOOK_CMD",
          command,
          "sh",
          "-c",
          EGRESS_WRAPPER,
        ],
        spawnOpts,
      );
      egress = parseEgressLog(
        existsSync(egressLog) ? readFileSync(egressLog, "utf-8") : "",
      );
    } else {
      res = spawnSync("bwrap", [...baseArgs, "sh", "-c", command], spawnOpts);
    }
    return {
      status: res.status,
      signal: res.signal,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      egress,
      filesWritten: diffTrees(before, snapshotTree(work)),
    };
  } finally {
    rmSync(ioDir, { recursive: true, force: true });
  }
}

function egressEntry(): string {
  return (
    [
      join(__dirname, "egress-entry.js"),
      join(__dirname, "..", "dist", "egress-entry.js"),
    ].find((p) => existsSync(p)) ?? join(__dirname, "egress-entry.js")
  );
}

// Runs INSIDE the bwrap netns: block until the parent has attached slirp4netns
// (the netready file), load the nft allowlist, run the hook with the event on its
// stdin, then dump the nft counters to a bound file BEFORE exiting — the netns
// (and its counters) die with this process, so the read-back must happen here.
const EGRESS_ALLOW_WRAPPER = [
  "i=0",
  'while [ ! -s "$VIG_NETREADY" ] && [ "$i" -lt 400 ]; do sleep 0.05; i=$((i+1)); done',
  'nft -f "$VIG_NFT" > "$VIG_IODIR/nfterr" 2>&1',
  'sh -c "$VIG_HOOK" < "$VIG_EVENT"',
  "code=$?",
  'nft list chain inet vig output > "$VIG_COUNTERS" 2>/dev/null',
  'exit "$code"',
].join("\n");

interface EgressOrchestratorResult {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  counters: string;
}

/** Read the orchestrator's result file, or a failed-run default if it's absent. */
function readEgressResult(resultFile: string): EgressOrchestratorResult {
  return existsSync(resultFile)
    ? (JSON.parse(
        readFileSync(resultFile, "utf-8"),
      ) as EgressOrchestratorResult)
    : { status: 1, signal: null, stdout: "", stderr: "", counters: "" };
}

function egressSpawn(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
): HookSpawnResult {
  const ioDir = mkdtempSync(join(tmpdir(), "vigiles-hook-egr-"));
  const home = join(ioDir, "home");
  mkdirSync(home);
  const work = opts.cwd ?? join(ioDir, "work");
  mkdirSync(work, { recursive: true });
  try {
    // Resolve the allowlist to IPs and the system resolvers, then generate the
    // nft ruleset (pure helpers in src/egress.ts) — the packet-layer wall.
    const files: EgressFiles = {
      ioDir,
      netready: join(ioDir, "netready"),
      nft: join(ioDir, "rules.nft"),
      event: join(ioDir, "event.json"),
      counters: join(ioDir, "counters.txt"),
    };
    const allow = resolveAllow(opts.egress?.allow ?? []);
    const resolvers = parseResolvers(
      existsSync("/etc/resolv.conf")
        ? readFileSync("/etc/resolv.conf", "utf-8")
        : "",
    );
    writeFileSync(files.nft, buildEgressNft({ allow, resolvers }));
    writeFileSync(files.event, JSON.stringify(input));
    // The in-netns resolv.conf: only the routable resolvers (the host's may be a
    // 127.0.0.53 stub the netns can't reach). Bound over /etc/resolv.conf below.
    const resolvConf = join(ioDir, "resolv.conf");
    writeFileSync(
      resolvConf,
      resolvers.map((r) => `nameserver ${r}`).join("\n") + "\n",
    );

    const bwrapArgv = buildEgressBwrapArgv({
      base: bwrapArgs({
        cwd: work,
        ioDir,
        home,
        path: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      }),
      setenv: setenvArgs(opts.env ?? {}),
      files,
      command,
      wrapper: EGRESS_ALLOW_WRAPPER,
      resolvConf,
    });
    const configFile = join(ioDir, "config.json");
    const resultFile = join(ioDir, "result.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        bwrapArgv,
        slirpArgs: ["--configure", "--disable-host-loopback"],
        infoFile: join(ioDir, "info.json"),
        readyFile: join(ioDir, "ready"),
        netreadyFile: files.netready,
        countersFile: files.counters,
        resultFile,
        timeoutMs: opts.timeoutMs ?? 30000,
      }),
    );
    spawnSync("node", [egressEntry(), configFile], {
      encoding: "utf-8",
      timeout: (opts.timeoutMs ?? 30000) + 20000,
    });
    const result = readEgressResult(resultFile);
    const { egress, egressDropped } = countersToResult(
      parseNftCounters(result.counters),
      Date.now(),
    );
    return {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      egress,
      egressDropped,
    };
  } finally {
    rmSync(ioDir, { recursive: true, force: true });
  }
}

const REAL_DEPS: RunHookDeps = {
  available: sandboxAvailable(),
  egressAvailable: egressAvailable(sandboxAvailable()),
  direct: directSpawn,
  sandboxed: sandboxedSpawn,
  egress: egressSpawn,
};
/* v8 ignore stop */

/**
 * Run a hook command, piping `input` as JSON to its stdin, and report the exit
 * code + parsed decision. Synchronous (so it can be used inside an eval's
 * `measure` too). `command` is run through a shell, so the same command string a
 * plugin ships (with args / env refs) works verbatim. Mark a hook you didn't
 * write with `trusted: false` and it is confined by default (or pass `sandbox:
 * "auto"` directly) — see {@link RunHookOptions.trusted}.
 */
export function runHook(
  command: string,
  input: HookInput,
  opts: RunHookOptions = {},
): HookRunResult {
  return runHookWith(command, input, opts, REAL_DEPS);
}
