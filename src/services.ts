/**
 * vigiles — R3 disposable-service tier (⚠️ EXPERIMENTAL / UNSTABLE).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *   EXPERIMENTAL: this surface is a DRAFT. Import it from `vigiles/experimental`,
 *   NOT from a stable subpath. It is NOT covered by the stability guarantee and
 *   may change shape or be removed WITHOUT a major-version bump. Do not build a
 *   production workflow on it yet. See docs/measuring-skills.md § Experimental.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS. The free tiers (`runHook`, `measureTriggerRate`, `runEval`)
 * cover a skill's OUTPUT and its side-effect SAFETY (did it call / not call a
 * tool, write / not write a file) with no container. What they do NOT do is let
 * a skill actually PERFORM a side effect against a real service and verify the
 * resulting state — apply a migration to a real Postgres and check the row
 * landed. That is the R3 rung (see research/eval-coverage-and-isolation.md): the
 * REAL system's semantics are the thing under test, so it can't be faked.
 *
 * THE POSTURE. vigiles COMPOSES with a throwaway container; it does not reinvent
 * the sandbox. A {@link ServiceSpec} declares a disposable service; the injected
 * {@link ContainerRuntime} port starts/stops it. Repeatability comes from a fresh
 * container per trial (`reset: "per-trial"`, the default), and the agent's egress
 * is pinned to the service endpoints and nothing else (composing with
 * `src/egress.ts`), so even a poisoned skill can reach only the throwaway DB.
 *
 * WHAT SHIPS TODAY vs LATER. Today: the TYPES, the {@link ContainerRuntime} port,
 * and the pure {@link experimental_startServices} orchestration (testable with a
 * fake runtime — the same pure-policy / injected-executor split as
 * `decideSandbox` vs `runSandboxed`). Deferred to the v0 build increment: a
 * Docker-backed `ContainerRuntime` impl and the `runEval` / `measureArms` wiring
 * (an additive `services` option + `ctx.service(name)`). Requires Docker
 * (Linux-first). It is an explicit opt-in and NEVER part of `vigiles audit`
 * (audit stays side-effect-free).
 *
 * @experimental
 * @module vigiles/experimental (services)
 */

/**
 * How a service signals it is ready to accept work — polled by the
 * {@link ContainerRuntime} before {@link ContainerRuntime.start} resolves, so a
 * consumer never races a half-booted service.
 *
 * @experimental
 */
export type ServiceReady =
  | { readonly tcp: number } // a port accepts a TCP connection
  | { readonly log: RegExp } // a line matches in the container's stdout/stderr
  | { readonly exec: string }; // a command exits 0 inside the container (e.g. `pg_isready`)

/**
 * When a fresh container is provisioned. `"per-trial"` (the DEFAULT) gives each
 * eval trial a clean service so trial N can never observe trial N-1's writes —
 * the repeatability property that makes a side-effecting eval trustworthy.
 * `"per-arm"` shares one container across an arm's trials: faster, but only sound
 * when the task is idempotent or reads only.
 *
 * @experimental
 */
export type ServiceReset = "per-trial" | "per-arm";

/**
 * A disposable service the agent's task may act against — declared per arm/spec
 * on the (future) `services` eval option.
 *
 * @experimental
 */
export interface ServiceSpec {
  /** Container image, e.g. `"postgres:16"` or `"redis:7"`. */
  readonly image: string;
  /** Environment for the container (e.g. `POSTGRES_PASSWORD`). */
  readonly env?: Readonly<Record<string, string>>;
  /** The primary port to expose + reach (the one `ServiceHandle.port` reports). */
  readonly port?: number;
  /** Additional ports to expose, if the service needs more than one. */
  readonly ports?: readonly number[];
  /** Readiness gate — start() resolves only once this passes. */
  readonly ready?: ServiceReady;
  /**
   * A one-shot command run INSIDE the fresh container after it is ready and
   * before the agent runs — e.g. `"psql -U postgres -d app -f schema.sql"`. Its
   * output is recorded once; it is NOT model-synthesized.
   */
  readonly seed?: string;
  /** Provisioning cadence — {@link ServiceReset}. Defaults to `"per-trial"`. */
  readonly reset?: ServiceReset;
}

/**
 * A started service, handed to `measure((ctx) => …)` as `ctx.service(name)` so a
 * check can inspect the REAL resulting state.
 *
 * NOTE: {@link ServiceHandle.exec} is SYNCHRONOUS on purpose — the eval `measure`
 * callback is synchronous (it blocks via `spawnSync`, like `judge()`), so state
 * inspection must be sync too. `exec` is the ONLY inspection primitive by design:
 * it shells the service's own CLI (`psql`, `redis-cli`, …) so vigiles never takes
 * a per-service client dependency.
 *
 * @experimental
 */
export interface ServiceHandle {
  /** Host the agent reaches the service on (from inside the run environment). */
  readonly host: string;
  /** The primary port (mirrors {@link ServiceSpec.port}). */
  readonly port: number;
  /** A convenience connection URL when the runtime can form one (else `""`). */
  readonly url: string;
  /** Run a command inside the container and read its result (synchronous). */
  exec(command: string): {
    readonly stdout: string;
    readonly stderr: string;
    readonly code: number;
  };
}

/**
 * A live set of started services + the teardown that disposes them. Returned by
 * {@link experimental_startServices}; the caller wires `endpoints` into the run's
 * egress allowlist and maps `handles` into the agent's env / into `measure`.
 *
 * @experimental
 */
export interface ServiceSession {
  /** The started services, keyed by the name declared in the `services` map. */
  readonly handles: Readonly<Record<string, ServiceHandle>>;
  /**
   * `host:port` endpoints to pin the run's egress allowlist to (and NOTHING
   * else), so the confined agent can reach these disposable services but cannot
   * phone home. Composes with `src/egress.ts` (`egress: { allow }`).
   */
  readonly endpoints: readonly string[];
  /** Stop + remove every started container. Always await this in a `finally`. */
  teardown(): Promise<void>;
}

/**
 * The container-lifecycle PORT — the seam a concrete backend implements (raw
 * `docker` is the planned v0 default; podman / testcontainers / the macOS
 * os-isolation backend swap in by injection, never a conditional). Kept
 * harness-agnostic and dependency-free at the core, exactly like the five
 * harness ports: the abstraction exists so a second backend is a NEW OBJECT, not
 * an edit threaded through the orchestrator.
 *
 * `start` is responsible for HONOURING {@link ServiceSpec.ready} + running
 * {@link ServiceSpec.seed}, so it resolves only with a ready, seeded service.
 *
 * @experimental
 */
export interface ContainerRuntime {
  /** Backend name for diagnostics, e.g. `"docker"`. */
  readonly name: string;
  /** Whether this backend can actually run here (e.g. `docker info` succeeds). */
  available(): boolean | Promise<boolean>;
  /** Provision + ready + seed one service, returning its handle. */
  start(name: string, spec: ServiceSpec): Promise<ServiceHandle>;
  /** Stop + remove a started service. */
  stop(handle: ServiceHandle): Promise<void>;
}

/**
 * Start every declared service against an injected {@link ContainerRuntime},
 * returning a {@link ServiceSession}. Pure orchestration over the port — no
 * `docker` is imported here, so this is fully unit-testable with a fake runtime
 * (the `decideSandbox`-is-pure / `runSandboxed`-is-real split). If any service
 * fails to start, the ones already up are torn down before the error propagates,
 * so a partial failure never leaks a container.
 *
 * A Docker-backed `ContainerRuntime` and the `runEval` / `measureArms` wiring are
 * the next increment — until then this is the primitive you compose by hand:
 * start → pin egress to `session.endpoints` → run → read `session.handles` in
 * `measure` → `await session.teardown()`.
 *
 * @experimental — surface may change without a major-version bump.
 */
export async function experimental_startServices(
  services: Readonly<Record<string, ServiceSpec>>,
  runtime: ContainerRuntime,
): Promise<ServiceSession> {
  const handles: Record<string, ServiceHandle> = {};
  const endpoints: string[] = [];
  const started: ServiceHandle[] = [];
  const stopAll = async (): Promise<void> => {
    await Promise.allSettled(started.map((h) => runtime.stop(h)));
  };
  try {
    for (const [name, spec] of Object.entries(services)) {
      const handle = await runtime.start(name, spec);
      handles[name] = handle;
      started.push(handle);
      endpoints.push(`${handle.host}:${handle.port}`);
    }
  } catch (err) {
    await stopAll();
    throw err;
  }
  return { handles, endpoints, teardown: stopAll };
}
