/**
 * vigiles — safe-by-default confinement for executing untrusted harness code.
 *
 * `runHarnessTest` runs the real `claude` CLI, which runs the real hooks of
 * whatever plugin you load. For code YOU authored (inline `settings`/`files`)
 * that's fine — trust is implicit. But pointing it at someone else's `plugin` /
 * `pluginDir` executes THEIR hooks with your privileges. This module makes that
 * safe by default: untrusted code is confined under bubblewrap, or — if no
 * sandbox is available — the run refuses rather than executing unconfined.
 *
 * Confinement (proven on bwrap 0.9): `--unshare-all` gives a fresh network
 * namespace whose loopback is auto-up but has NO external route — so the
 * scripted mock, co-launched INSIDE the namespace, is reachable over 127.0.0.1
 * while a malicious hook cannot phone home. The filesystem is `--ro-bind`
 * read-only except the throwaway work dir, a fresh empty `$HOME`, and an IO dir
 * used to hand the script in and stream captured requests back out.
 *
 * The policy (`decideSandbox`), trust test (`specTrusted`), and bwrap argv
 * (`bwrapArgs`) are pure and unit-tested; the executor (`runSandboxed`) needs a
 * real bwrap and is covered by the integration test, which skips where bwrap is
 * absent — the same pattern as the real-`claude` paths.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ModelTurn, type ModelRequest } from "./mock-model.js";

/**
 * How to treat code execution. `"auto"` (default) is safe-by-default: trusted
 * code runs directly, untrusted code is sandboxed if possible and otherwise
 * refuses. `false` is the dangerous opt-out — run unconfined (you audited it, or
 * you trust the outer container). `"strict"` forces confinement even for trusted
 * code and throws if no sandbox is available.
 */
export type SandboxMode = "auto" | "strict" | false;

/** Whether bubblewrap is available to confine untrusted code. */
export function sandboxAvailable(): boolean {
  try {
    return spawnSync("bwrap", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    /* v8 ignore next -- defensive: spawnSync only throws on a fork failure */
    return false;
  }
}

/**
 * Is this spec's executed code trusted? Inline `settings`/`files` you authored
 * are trusted; any external `plugin` / `pluginDir` brings in third-party hooks
 * and is NOT — committing it to your repo is the same trust decision as a
 * dependency, so the trust boundary follows provenance: foreign = confined.
 */
export function specTrusted(spec: {
  plugin?: string;
  pluginDir?: string;
}): boolean {
  return spec.plugin === undefined && spec.pluginDir === undefined;
}

/** The chosen action for a run: execute directly, confine it, or refuse. */
export type SandboxDecision =
  | { readonly action: "direct" }
  | { readonly action: "sandbox" }
  | { readonly action: "throw"; readonly reason: string };

/**
 * The pure safe-by-default policy. Untrusted code NEVER runs unconfined unless
 * the caller explicitly opted out (`mode: false`). This is the whole security
 * contract, isolated as a pure function so it is exhaustively unit-tested.
 */
export function decideSandbox(opts: {
  trusted: boolean;
  mode: SandboxMode;
  available: boolean;
}): SandboxDecision {
  // Explicit dangerous opt-out: run unconfined, trusted or not.
  if (opts.mode === false) return { action: "direct" };
  // Force confinement regardless of trust; refuse if we can't.
  if (opts.mode === "strict") {
    return opts.available
      ? { action: "sandbox" }
      : {
          action: "throw",
          reason:
            "sandbox: 'strict' requires bubblewrap (bwrap), which was not found on PATH",
        };
  }
  // auto: trusted code runs directly; untrusted must be confined or refused.
  if (opts.trusted) return { action: "direct" };
  return opts.available
    ? { action: "sandbox" }
    : {
        action: "throw",
        reason:
          "refusing to execute an untrusted plugin's hooks without a sandbox: " +
          "install bubblewrap (bwrap) to run confined, or pass sandbox: false " +
          "to run unconfined if you trust this code / the outer container",
      };
}

/**
 * The bubblewrap confinement argv (everything before the command): a fresh
 * network namespace (`--unshare-all`, loopback-only, no egress), a read-only
 * system, and writable mounts limited to the work dir, the IO dir, and a fresh
 * empty HOME (kept inside the IO dir so it needs no mountpoint on the read-only
 * root, and so no host credentials/config leak in). Pure, so the confinement
 * shape is asserted in a unit test.
 */
export function bwrapArgs(opts: {
  cwd: string;
  ioDir: string;
  home: string;
}): string[] {
  return [
    // New user/net/pid/ipc/uts/cgroup namespaces. The net namespace has only a
    // loopback route, so the in-sandbox mock is reachable but egress is blocked.
    "--unshare-all",
    "--ro-bind",
    "/",
    "/",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    // Writable: the work dir and the IO dir (later binds override the ro-bind).
    "--bind",
    opts.cwd,
    opts.cwd,
    "--bind",
    opts.ioDir,
    opts.ioDir,
    // A fresh empty HOME so no host credentials/config are visible.
    "--setenv",
    "HOME",
    opts.home,
    "--setenv",
    "TMPDIR",
    opts.ioDir,
    "--chdir",
    opts.cwd,
    "--die-with-parent",
    "--new-session",
  ];
}

/** Parse the in-sandbox mock's ndjson request log into {@link ModelRequest}s. */
export function parseRequestLog(ndjson: string): ModelRequest[] {
  const out: ModelRequest[] = [];
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as ModelRequest);
    } catch {
      /* a partially-written final line — skip */
    }
  }
  return out;
}

/** The raw output of a sandboxed run: exit code, captured stdout, and requests. */
export interface SandboxRunOut {
  readonly code: number;
  readonly stdout: string;
  readonly requests: readonly ModelRequest[];
}

/**
 * Co-launch the scripted mock and `claude` inside ONE bubblewrap network
 * namespace: the mock serves on the sandbox's loopback (reachable), egress is
 * blocked, and captured requests stream out through the bound IO dir. Paths come
 * in via env so the wrapper needs no escaping; `claude`'s args are the wrapper's
 * positional params (`"$@"`).
 */
const WRAPPER = [
  // start the in-sandbox mock; it writes its port to $VIG_PORT when ready
  'node "$VIG_MOCKENTRY" "$VIG_SCRIPT" "$VIG_REQS" "$VIG_PORT" &',
  "MOCKPID=$!",
  "i=0",
  'while [ ! -s "$VIG_PORT" ] && [ "$i" -lt 200 ]; do sleep 0.05; i=$((i+1)); done',
  'export ANTHROPIC_BASE_URL="http://127.0.0.1:$(cat "$VIG_PORT")"',
  "export ANTHROPIC_API_KEY=sk-vigiles-mock",
  'claude "$@"',
  "code=$?",
  'kill "$MOCKPID" 2>/dev/null',
  'exit "$code"',
].join("\n");

/* v8 ignore start -- spawns bwrap + the real claude CLI; exercised by the
   bwrap-backed integration test (skipped without bwrap), not the unit gate —
   the pure policy/args/parse helpers above carry the testable logic. */
export function runSandboxed(opts: {
  cwd: string;
  claudeArgs: readonly string[];
  script: readonly ModelTurn[];
  timeoutMs: number;
}): Promise<SandboxRunOut> {
  const ioDir = mkdtempSync(join(tmpdir(), "vigiles-sbx-"));
  const home = join(ioDir, "home");
  mkdirSync(home);
  const scriptF = join(ioDir, "script.json");
  const reqsF = join(ioDir, "requests.ndjson");
  const portF = join(ioDir, "port");
  writeFileSync(scriptF, JSON.stringify(opts.script));
  writeFileSync(reqsF, "");
  // The mock entry is only runnable as built JS. In production __dirname is
  // dist/ (sibling); under vitest the source runs from src/, so fall back to
  // the built dist/ copy.
  const mockEntry =
    [
      join(__dirname, "mock-entry.js"),
      join(__dirname, "..", "dist", "mock-entry.js"),
    ].find((p) => existsSync(p)) ?? join(__dirname, "mock-entry.js");
  const args = [
    ...bwrapArgs({ cwd: opts.cwd, ioDir, home }),
    "--setenv",
    "VIG_MOCKENTRY",
    mockEntry,
    "--setenv",
    "VIG_SCRIPT",
    scriptF,
    "--setenv",
    "VIG_REQS",
    reqsF,
    "--setenv",
    "VIG_PORT",
    portF,
    "sh",
    "-c",
    WRAPPER,
    "sh",
    ...opts.claudeArgs,
  ];
  return new Promise((resolvePromise) => {
    const child = spawn("bwrap", args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", () => {
      /* hook diagnostics — not needed for the captured result */
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const requests = parseRequestLog(
        existsSync(reqsF) ? readFileSync(reqsF, "utf-8") : "",
      );
      rmSync(ioDir, { recursive: true, force: true });
      resolvePromise({ code: code ?? 0, stdout, requests });
    });
  });
}
/* v8 ignore stop */
