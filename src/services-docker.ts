/**
 * vigiles — a Docker-backed {@link ContainerRuntime} for the R3 disposable-service
 * tier (⚠️ EXPERIMENTAL / UNSTABLE — see src/services.ts and `vigiles/experimental`).
 *
 * This is the v0 backend the R3 build spec (research/r3-disposable-services.md)
 * scopes: `docker run` a throwaway service, wait for it to be ready, run its seed,
 * hand back a {@link ServiceHandle} whose `exec` shells into the container, and
 * `docker rm -f` it on teardown.
 *
 * The design mirrors `src/sandbox.ts` / `src/egress.ts`: the COMMAND BUILDERS and
 * output parsers are pure (unit-tested), and the two real-IO seams — the
 * synchronous docker CLI (`exec`) and the TCP readiness probe (`netProbe`) — are
 * INJECTED, so the orchestration is fully testable with fakes and only the
 * end-to-end integration test needs a live daemon (it skips when absent).
 *
 * @experimental
 * @module vigiles/experimental (docker backend)
 */
import { spawnSync } from "node:child_process";
import { connect } from "node:net";

import type {
  ContainerRuntime,
  ServiceHandle,
  ServiceReady,
  ServiceSpec,
} from "./services.js";

/** A synchronous docker CLI call — the injected real-IO seam. */
export type DockerExec = (args: readonly string[]) => {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
};

/** A TCP readiness probe against a published host port — the second IO seam. */
export type NetProbe = (port: number) => Promise<boolean>;

/** How long to wait for a service to become ready before giving up. */
const DEFAULT_READY_TIMEOUT_MS = 30_000;
/** Delay between readiness polls. */
const READY_POLL_MS = 250;

let containerCounter = 0;

/**
 * A docker-safe, collision-free container name for a declared service. Sanitises
 * the service name to docker's `[a-zA-Z0-9_.-]` charset and appends the process
 * id + a monotonic counter so parallel/repeated runs never clash. Pure given the
 * injected suffix, so it's unit-tested.
 */
export function containerNameFor(name: string, suffix: string): string {
  const safe =
    name.replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^[-.]+/, "") || "svc";
  return `vigiles-${safe}-${suffix}`;
}

/** The `docker run -d …` argv for a service. Pure. */
export function dockerRunArgs(
  spec: ServiceSpec,
  containerName: string,
): string[] {
  const args = ["run", "-d", "--rm", "--name", containerName];
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    args.push("-e", `${k}=${v}`);
  }
  for (const port of primaryPorts(spec)) {
    // Publish to an ephemeral loopback host port; `docker port` discovers it.
    args.push("-p", `127.0.0.1::${port}`);
  }
  args.push(spec.image);
  return args;
}

/** The `docker exec <c> sh -c <cmd>` argv. Pure. */
export function dockerExecArgs(
  containerName: string,
  command: string,
): string[] {
  return ["exec", containerName, "sh", "-c", command];
}

/** The full ordered port list (primary first), de-duplicated. Pure. */
export function primaryPorts(spec: ServiceSpec): number[] {
  const all = [
    ...(spec.port === undefined ? [] : [spec.port]),
    ...(spec.ports ?? []),
  ];
  return [...new Set(all)];
}

/**
 * Parse the published host port out of `docker port <c> <containerPort>` output,
 * e.g. `0.0.0.0:49153` or `127.0.0.1:49153\n[::]:49153` → `49153`. Returns `0`
 * when nothing is published (no port mapping). Pure.
 */
export function parseDockerPort(output: string): number {
  for (const line of output.split("\n")) {
    const m = /:(\d+)\s*$/.exec(line.trim());
    if (m) return Number(m[1]);
  }
  return 0;
}

/* v8 ignore start -- the real-daemon IO seams: they spawn the real `docker` CLI /
   open a real socket / sleep, and are exercised by the gated integration test
   (skipped without a daemon) + the real-socket unit test — not the coverage gate,
   which the pure builders + the fake-injected orchestration below carry. Same
   pattern as sandbox.ts's `runSandboxed`. */
/** Default real docker CLI seam (synchronous). */
const realDockerExec: DockerExec = (args) => {
  const r = spawnSync("docker", args as string[], { encoding: "utf-8" });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    code: r.status ?? 1,
  };
};

/** Default TCP probe: resolve true if a connection to 127.0.0.1:port succeeds. */
const realNetProbe: NetProbe = (port) =>
  new Promise((resolve) => {
    const sock = connect({ host: "127.0.0.1", port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.setTimeout(1000, () => {
      sock.destroy();
      resolve(false);
    });
  });

const delay = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
/* v8 ignore stop */

/** The IO seams + target a readiness poll needs, bundled to stay under max-params. */
interface ReadyCtx {
  readonly exec: DockerExec;
  readonly netProbe: NetProbe;
  readonly sleep: (ms: number) => Promise<void>;
  readonly containerName: string;
  readonly hostPort: number;
}

/** One readiness attempt for the declared gate. */
function probeReady(ctx: ReadyCtx, ready: ServiceReady): Promise<boolean> {
  if ("exec" in ready) {
    return Promise.resolve(
      ctx.exec(dockerExecArgs(ctx.containerName, ready.exec)).code === 0,
    );
  }
  if ("log" in ready) {
    const r = ctx.exec(["logs", ctx.containerName]);
    return Promise.resolve(ready.log.test(r.stdout + r.stderr));
  }
  return ctx.netProbe(ctx.hostPort);
}

/** Poll {@link probeReady} until it passes or the deadline elapses. */
async function waitReady(
  ctx: ReadyCtx,
  ready: ServiceReady | undefined,
  timeoutMs: number,
): Promise<void> {
  if (!ready) return;
  const started = numericNow();
  for (;;) {
    if (await probeReady(ctx, ready)) return;
    if (numericNow() - started >= timeoutMs) {
      throw new Error(
        `service "${ctx.containerName}" did not become ready within ${timeoutMs}ms`,
      );
    }
    await ctx.sleep(READY_POLL_MS);
  }
}

// Isolated so the deadline math is injectable-free but still centralised.
function numericNow(): number {
  return Date.now();
}

/**
 * Build a Docker-backed {@link ContainerRuntime}. The two real-IO seams default
 * to the real docker CLI + a real TCP probe, but both are injectable so the
 * lifecycle is unit-testable with fakes.
 *
 * @experimental
 */
export function makeDockerRuntime(
  deps: {
    exec?: DockerExec;
    netProbe?: NetProbe;
    sleep?: (ms: number) => Promise<void>;
    /** Readiness deadline; injectable so a test can cover the timeout path. */
    readyTimeoutMs?: number;
  } = {},
): ContainerRuntime {
  const exec = deps.exec ?? realDockerExec;
  const netProbe = deps.netProbe ?? realNetProbe;
  const sleep = deps.sleep ?? delay;
  const readyTimeoutMs = deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

  return {
    name: "docker",
    available() {
      return exec(["info"]).code === 0;
    },
    async start(name, spec) {
      const containerName = containerNameFor(
        name,
        `${process.pid}-${containerCounter++}`,
      );
      const run = exec(dockerRunArgs(spec, containerName));
      if (run.code !== 0) {
        throw new Error(
          `docker run failed for service "${name}" (${spec.image}): ${run.stderr.trim()}`,
        );
      }
      const primary = primaryPorts(spec)[0];
      const hostPort =
        primary === undefined
          ? 0
          : parseDockerPort(
              exec(["port", containerName, String(primary)]).stdout,
            );

      const handle: ServiceHandle = {
        host: "127.0.0.1",
        port: hostPort,
        url: "",
        exec(command) {
          const r = exec(dockerExecArgs(containerName, command));
          return { stdout: r.stdout, stderr: r.stderr, code: r.code };
        },
      };

      try {
        await waitReady(
          { exec, netProbe, sleep, containerName, hostPort },
          spec.ready,
          readyTimeoutMs,
        );
        if (spec.seed) {
          const s = exec(dockerExecArgs(containerName, spec.seed));
          if (s.code !== 0) {
            throw new Error(
              `seed failed for service "${name}": ${s.stderr.trim()}`,
            );
          }
        }
      } catch (err) {
        exec(["rm", "-f", containerName]);
        throw err;
      }

      // Carry the container name for stop() via a non-enumerable back-reference.
      containerNames.set(handle, containerName);
      return handle;
    },
    async stop(handle) {
      const containerName = containerNames.get(handle);
      if (containerName) {
        exec(["rm", "-f", containerName]);
        containerNames.delete(handle);
      }
      return Promise.resolve();
    },
  };
}

/** Maps a returned handle → its container name, so stop() needs no public field. */
const containerNames = new WeakMap<ServiceHandle, string>();

/**
 * The default Docker-backed runtime — pass to `experimental_startServices`.
 *
 * @experimental
 */
export const experimental_dockerRuntime: ContainerRuntime = makeDockerRuntime();
