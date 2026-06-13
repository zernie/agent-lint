/**
 * vigiles — the allowlisted-egress orchestrator (in-process subprocess entry).
 *
 * `runHook` is synchronous (`spawnSync`), but allowlisted egress needs TWO
 * processes alive at once: `bwrap` (which creates the netns and runs the hook)
 * and `slirp4netns` (which, from the PARENT netns, attaches a tap to bwrap's netns
 * to give it controlled egress). So the parent `spawnSync`s THIS entry, which runs
 * the concurrent dance and writes a result file the parent reads back — keeping
 * `runHook` synchronous while the handoff happens here.
 *
 * The dance (proven in `research/spikes/sandbox-network-allowlist.sh`):
 *   1. spawn bwrap with `--info-fd` → learn the sandboxed child's PID;
 *   2. `slirp4netns --configure --ready-fd N <pid> tap0` → tap up inside the netns;
 *   3. touch the netready file → the in-sandbox wrapper (blocked on it) proceeds:
 *      it loads the nft allowlist, runs the hook, then dumps the nft counters to a
 *      bound file BEFORE exiting (the netns dies with the child, so the read-back
 *      must happen inside);
 *   4. capture bwrap's stdout/stderr/exit + the counters → write the result file.
 *
 * Run as: `node dist/egress-entry.js <config.json>`. v8-ignored: it spawns real
 * bwrap + slirp4netns and is exercised only by the bwrap/slirp-gated integration
 * test; the testable logic (ruleset, counter parse) lives in `src/egress.ts`.
 */
/* v8 ignore start */
import { spawn, spawnSync } from "node:child_process";
import {
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";

interface EgressConfig {
  /** Full bwrap argv (incl. `--info-fd 3` and the `sh -c <wrapper>` payload). */
  readonly bwrapArgv: string[];
  /** Base slirp4netns args; the child PID and `tap0` are appended at runtime. */
  readonly slirpArgs: string[];
  /** Base pasta (passt) args; the child PID is appended at runtime. */
  readonly pastaArgs: string[];
  /** Which rootless egress connector to use: "pasta" or "slirp4netns" (default). */
  readonly connector: "pasta" | "slirp4netns";
  readonly infoFile: string;
  readonly readyFile: string;
  readonly netreadyFile: string;
  readonly countersFile: string;
  readonly resultFile: string;
  readonly timeoutMs: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Is a binary on PATH? (probe via `--version`; ENOENT sets `.error`.) */
function hasBinary(name: string): boolean {
  return !spawnSync(name, ["--version"], { stdio: "ignore" }).error;
}

/** Poll a file until it has content (the info / ready fd targets), or time out. */
async function waitForFile(path: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (readFileSync(path, "utf-8").trim().length > 0) return true;
    } catch {
      /* not written yet */
    }
    await sleep(50);
  }
  return false;
}

async function main(): Promise<void> {
  const cfg = JSON.parse(
    readFileSync(process.argv[2], "utf-8"),
  ) as EgressConfig;

  // bwrap writes the sandboxed child's PID (init-namespace view) to fd 3.
  const infoFd = openSync(cfg.infoFile, "w");
  const bwrap = spawn("bwrap", cfg.bwrapArgv, {
    stdio: ["ignore", "pipe", "pipe", infoFd],
  });
  closeSync(infoFd);
  let stdout = "";
  let stderr = "";
  bwrap.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
  bwrap.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));

  let connector: ReturnType<typeof spawn> | undefined;
  const timer = setTimeout(() => bwrap.kill("SIGKILL"), cfg.timeoutMs);

  const exit = new Promise<{ status: number | null; signal: string | null }>(
    (resolve) => {
      bwrap.on("close", (status, signal) => {
        resolve({ status, signal });
      });
    },
  );

  // Learn the child PID, attach a rootless egress connector to its netns, release
  // the wrapper. Prefer pasta (passt): it routes on hosted runners where
  // slirp4netns's tap-attach silently fails (the netns ends up with only `lo`).
  // Fall back to slirp4netns where pasta isn't installed. nft (the allowlist wall)
  // matches on destination, not interface name, so it's connector-agnostic. See
  // research/egress-sandbox-tooling.md.
  if (await waitForFile(cfg.infoFile, 5_000)) {
    const info = readFileSync(cfg.infoFile, "utf-8");
    const m = /"child-pid":\s*(\d+)/.exec(info);
    if (m) {
      if (cfg.connector === "pasta" && hasBinary("pasta")) {
        // pasta configures the netns then forks to background; no ready-fd, so
        // give it a moment to bring the interface + routes up.
        connector = spawn("pasta", [...cfg.pastaArgs, m[1]], {
          stdio: "ignore",
        });
        await sleep(800);
      } else {
        const readyFd = openSync(cfg.readyFile, "w");
        connector = spawn(
          "slirp4netns",
          [...cfg.slirpArgs, "--ready-fd", "4", m[1], "tap0"],
          { stdio: ["ignore", "ignore", "ignore", "ignore", readyFd] },
        );
        closeSync(readyFd);
        // slirp writes "1" to the ready fd once tap0 is configured; fall back to a
        // short sleep if it never signals (older builds).
        if (!(await waitForFile(cfg.readyFile, 4_000))) await sleep(800);
      }
    }
  }
  writeFileSync(cfg.netreadyFile, "1");

  const { status, signal } = await exit;
  clearTimeout(timer);
  connector?.kill("SIGKILL");

  const counters = existsSync(cfg.countersFile)
    ? readFileSync(cfg.countersFile, "utf-8")
    : "";
  writeFileSync(
    cfg.resultFile,
    JSON.stringify({ status, signal, stdout, stderr, counters }),
  );
}

main().catch((e: unknown) => {
  writeFileSync(
    process.argv[2] + ".error",
    e instanceof Error ? (e.stack ?? e.message) : String(e),
  );
  process.exit(1);
});
/* v8 ignore stop */
