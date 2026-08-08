/**
 * vigiles — **`runScript`**: run a program and report what it did.
 *
 * This is the PRIMITIVE under the hook unit tier. A program is spawned through a
 * shell, optionally fed stdin, optionally confined under bubblewrap, and what
 * comes back is exit code + both streams + (when confined) the files it wrote
 * and the network it reached. Nothing here knows what a hook is.
 *
 * `runHook` is this plus one thing: it serializes a hook event to stdin and
 * parses the exit code / stdout JSON into an allow-deny decision. The layering
 * used to run the other way — the hook-shaped name owned the general machinery —
 * which meant someone testing an ordinary helper script had no name to look for
 * and hand-rolled an `execFileSync` runner instead. That runner returns stdout
 * ALONE on success, so advisory output (which tools, including vigiles's own
 * compiled-hook `notice()`, write to stderr) vanished and healthy react hooks
 * reported as dead — three times in one repo.
 *
 * These are two questions, not two ways to ask one: a HOOK has a **decision**, a
 * SCRIPT has **effects**. So the result types differ rather than a script result
 * carrying a permanently-meaningless `decision` field, which would teach the
 * reader that the field means nothing.
 *
 * See `src/run-hook.ts` for the hook layer, and `docs/sandboxing.md` for what
 * confinement isolates versus records.
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
import { recordCheck } from "./check-count.js";

export type { EgressAttempt };

export interface RunScriptOptions {
  /**
   * Text piped to the program's stdin. Default: nothing. A program that ignores
   * stdin simply ignores it. (`runHook` uses this to deliver the JSON event.)
   */
  readonly stdin?: string;
  /** Working directory for the process. Default: a value won't be set. */
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

/** What a program did: its exit, its output, and (when confined) its effects. */
export interface ScriptRunResult {
  /** Exit code. A signal-killed run reports 1. */
  readonly exitCode: number;
  readonly stdout: string;
  /**
   * Everything the program wrote to fd 2. Advisory output usually lives HERE —
   * a runner that reads only stdout silently discards it.
   */
  readonly stderr: string;
  /**
   * Network egress the run attempted. With {@link RunScriptOptions.recordEgress}:
   * every (blocked) attempt the proxy saw. With {@link RunScriptOptions.egress}:
   * the allowlisted hosts actually reached, with packet counts. Empty otherwise.
   */
  readonly egress: readonly EgressAttempt[];
  /**
   * Allowlisted-egress mode only: aggregate off-allowlist traffic the packet
   * wall dropped. Undefined when {@link RunScriptOptions.egress} was unset.
   */
  readonly egressDropped?: { readonly packets: number; readonly bytes: number };
  /**
   * Files written to the work dir (relative paths). **`undefined` when writes
   * were never recorded** — a different fact from `[]` ("recorded, wrote
   * nothing"). Recording diffs the work dir before and after, which only a
   * CONFINED run does. `assertNoWrite` / `assertWroteOnly` refuse `undefined`
   * rather than pass having inspected nothing.
   */
  readonly filesWritten?: readonly string[];
}

/** The raw fields of a spawn that the result assembler needs. */
export interface ScriptSpawnResult {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Egress attempts captured by the in-sandbox recorder (recordEgress only). */
  readonly egress?: readonly EgressAttempt[];
  /** Off-allowlist traffic the packet-layer wall dropped (egress mode only). */
  readonly egressDropped?: { readonly packets: number; readonly bytes: number };
  /** Files written to the work dir — present only on a CONFINED run. */
  readonly filesWritten?: readonly string[];
}

/** Spawn a program (command + stdin) — the injectable seam over the real spawn. */
export type ScriptSpawner = (
  command: string,
  stdin: string,
  opts: RunScriptOptions,
) => ScriptSpawnResult;

/** The spawn seams `runScriptWith` needs, so its routing is testable. */
export interface RunScriptDeps {
  /** Whether bubblewrap confinement is available (Linux + bwrap). */
  readonly available: boolean;
  /** Whether allowlisted egress is available (bwrap + slirp4netns + nft). */
  readonly egressAvailable: boolean;
  /** Run the command directly (unconfined). */
  readonly direct: ScriptSpawner;
  /** Run the command confined under bubblewrap. */
  readonly sandboxed: ScriptSpawner;
  /** Run the command confined with an allowlisted-egress netns. */
  readonly egress: ScriptSpawner;
}

/**
 * The run orchestration with injectable spawn seams: pick direct vs. confined
 * via the safe-by-default policy (`decideSandbox`), then assemble the result.
 * Exported so all three branches (direct / sandbox / refuse) are unit-tested
 * with fake spawners — no real bwrap.
 */
export function runScriptWith(
  command: string,
  stdin: string,
  opts: RunScriptOptions,
  deps: RunScriptDeps,
): ScriptRunResult {
  // Tell the CLI runner this script exercised the harness, so a `*.harness.*`
  // file that runs NOTHING can be told apart from one that ran and passed. Here,
  // at the primitive, so `runHook` and a bare `runScript` both count. See
  // check-count.ts.
  recordCheck();
  // Allowlisted egress is its own confined path (bwrap netns + slirp4netns +
  // nft); it can't run unconfined, so it refuses outright when the tooling is
  // absent rather than falling back to a direct run that ignores the allowlist.
  const res = opts.egress
    ? runEgress(command, stdin, opts, deps)
    : runConfinedOrDirect(command, stdin, opts, deps);
  return {
    exitCode: res.status ?? (res.signal ? 1 : 0),
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    egress: res.egress ?? [],
    egressDropped: res.egressDropped,
    // NOT `?? []` — an unconfined spawn records nothing, and flattening that to
    // an empty list would let a write assertion pass having looked at nothing.
    filesWritten: res.filesWritten,
  };
}

/** The allowlisted-egress branch: confine-with-netns, or refuse if unavailable. */
function runEgress(
  command: string,
  stdin: string,
  opts: RunScriptOptions,
  deps: RunScriptDeps,
): ScriptSpawnResult {
  if (!deps.egressAvailable) {
    throw new Error(
      "refusing to run egress: { allow } without the allowlist sandbox: it " +
        "needs Linux + bubblewrap (bwrap) + slirp4netns + nft — install them to " +
        "run with a packet-layer egress allowlist, or use recordEgress to record " +
        "and block instead",
    );
  }
  return deps.egress(command, stdin, opts);
}

/** The default branch: pick direct vs. confined via the safe-by-default policy. */
function runConfinedOrDirect(
  command: string,
  stdin: string,
  opts: RunScriptOptions,
  deps: RunScriptDeps,
): ScriptSpawnResult {
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
    ? deps.sandboxed(command, stdin, opts)
    : deps.direct(command, stdin, opts);
}

/** Run the hook command directly through a shell (the default, unconfined). */
function directSpawn(
  command: string,
  stdin: string,
  opts: RunScriptOptions,
): ScriptSpawnResult {
  const res = spawnSync(command, {
    shell: true,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: stdin,
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
   test (skipped without bwrap). The decision logic is runScriptWith (unit-tested
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
  stdin: string,
  opts: RunScriptOptions,
): ScriptSpawnResult {
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
      input: stdin,
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
  stdin: string,
  opts: RunScriptOptions,
): ScriptSpawnResult {
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
    writeFileSync(files.event, stdin);
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
        // --config-net brings up the interface + host-derived routes in the
        // target netns. The connector is slirp4netns by default (proven local);
        // set VIGILES_EGRESS_CONNECTOR=pasta to use pasta (passt), which routes
        // on hosted runners where slirp4netns's tap-attach fails.
        pastaArgs: ["--config-net"],
        connector:
          process.env.VIGILES_EGRESS_CONNECTOR === "pasta"
            ? "pasta"
            : "slirp4netns",
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

export const REAL_DEPS: RunScriptDeps = {
  available: sandboxAvailable(),
  egressAvailable: egressAvailable(sandboxAvailable()),
  direct: directSpawn,
  sandboxed: sandboxedSpawn,
  egress: egressSpawn,
};

/**
 * Whether allowlisted egress can ACTUALLY route here — not just whether the tools
 * exist. On GitHub-hosted runners bwrap+slirp4netns+nft are all present, yet
 * slirp4netns fails to attach `tap0`: the netns has only `lo`, so nothing leaves
 * and the egress assertions can't be exercised. Run a trivial hook in the egress
 * sandbox and check a non-loopback interface came up; memoized (the capability is
 * fixed per run). Gates the egress e2e tests so they run for real where egress
 * works and SKIP — honestly — where it provably can't, instead of failing red.
 * (slirp4netns → pasta is the fix that makes it route in CI too; see
 * research/egress-sandbox-tooling.md.)
 */
let egressRoutesMemo: boolean | undefined;
export function egressRoutes(): boolean {
  if (egressRoutesMemo !== undefined) return egressRoutesMemo;
  if (!egressAvailable(sandboxAvailable())) return (egressRoutesMemo = false);
  try {
    // The only reliable signal is the egress path itself: try to reach an
    // allowlisted host and check a packet actually got out. Filesystem probes
    // (/proc/net/dev) and `ip` are unreliable here — bwrap may bind the host
    // /proc (so /proc/net shows host interfaces, a false positive) and `ip` isn't
    // on the sandbox PATH. A real reach is namespace-accurate by construction.
    const r = egressSpawn(
      "curl -s -m 8 -o /dev/null https://example.com/ || true",
      "",
      { egress: { allow: ["example.com"] }, timeoutMs: 20000 },
    );
    egressRoutesMemo = (r.egress ?? []).some(
      (e) => e.host === "example.com" && (e.packets ?? 0) > 0,
    );
  } catch {
    egressRoutesMemo = false;
  }
  return egressRoutesMemo;
}
/* v8 ignore stop */

/**
 * Run a program and report what it did — exit code, **both** streams, and (when
 * confined) its writes and egress. Synchronous, so it composes inside an eval's
 * `measure`. `command` goes through a shell, so the exact string a project
 * ships (args, env refs, pipes) works verbatim.
 *
 * This is the right tier for a plain helper script — a bash/node/python program
 * that isn't a hook. It has no decision to report, so the result carries none.
 *
 * ```ts
 * const r = runScript("bash scripts/check-links.sh", { cwd: repo });
 * assert.equal(r.exitCode, 0);
 * assert.match(r.stderr, /0 broken links/); // advisory output lives here
 * ```
 *
 * Running something you didn't write? Pass `trusted: false` (or `sandbox:
 * "auto"`) to confine it — which is also what records `filesWritten`.
 */
export function runScript(
  command: string,
  opts: RunScriptOptions = {},
): ScriptRunResult {
  return runScriptWith(command, opts.stdin ?? "", opts, REAL_DEPS);
}
