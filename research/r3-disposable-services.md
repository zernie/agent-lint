---
status: idea
topic: eval
---

# R3 disposable-service tier — real side-effect testing (build spec)

> Status: **idea / experimental surface drafted** (2026-07). The build spec for
> the R3 apex named in [`eval-coverage-and-isolation.md`](eval-coverage-and-isolation.md):
> letting a skill actually PERFORM a side effect against a real disposable
> service and verify the resulting state. The type surface + the
> `ContainerRuntime` port ship today (experimental) in `src/services.ts`
> (`vigiles/experimental`); the Docker backend + `runEval`/`measureArms` wiring
> are the increment this doc scopes. Prompted by teams running complex CC skill
> suites on promptfoo's metered API who need to execute-and-verify real side
> effects — the strongest signal to pull R3 forward.

## Why now (the pull)

The free tiers cover a skill's **output** and its **side-effect safety** (did it
call / not call a tool, write / not write a file). The one thing they do **not**
do turnkey is **execute a real side effect against a real backend and check the
world changed** — apply a migration to a real Postgres, verify the row landed.
That is exactly the slice a backend-heavy skill library (migrations, data tools,
browser/a11y) lives in, and it is the slice teams pay metered-API money to test.

Crucially, promptfoo does **not** solve this either — it has **no sandbox at all**
(prompt → provider → assert; `exec`/custom/agent-SDK providers run unconfined on
the host). So the honest framing is not "promptfoo does side-effect isolation and
we don't" — it's "nobody gives you a repeatable, confined side-effecting run;
vigiles already has the confinement primitives and just hasn't wired the
disposable-**service** provisioning on top."

## The insight: the hard part is already built

R3 is a **container-lifecycle module + threading one handle** — not a new
isolation stack — because the load-bearing plumbing exists:

| Concern                                                         | Reused as-is                                                                          | R3 adds                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Host protection** (foreign skill can't read secrets / escape) | `decideSandbox` + `bwrapArgs` + `specTrusted` (`src/sandbox.ts`)                      | nothing                                             |
| **Egress** (agent reaches the DB, nothing else)                 | the allowlist netns path (`buildEgressNft` / `buildEgressBwrapArgv`, `src/egress.ts`) | pin the allowlist to `{ each service's host:port }` |
| **State protection** (repeatable)                               | the ephemeral throwaway CWD/HOME                                                      | a **fresh container per trial**                     |
| **Irreversible externals**                                      | `interceptTools` (git push, paid API)                                                 | still applies                                       |

Key composition: today `runSandboxed` uses `--unshare-all` = loopback-only (no
route out) for untrusted code. **R3 is that same netns with the egress allowlist
pinned to the disposable services** — so a poisoned skill can hit only the
throwaway Postgres and nothing on the internet. That path (`slirp4netns`/`pasta` +
`nft`) is done; R3 threads the container endpoint into it.

## Placement (architecture)

- **`src/services.ts`** — composition/library layer, beside `sandbox.ts` /
  `egress.ts`. NOT `core/` (a Postgres container has nothing to do with the
  reference-verification domain), NOT an adapter (identical for CC and Codex — no
  per-harness fact). Same pure-policy / real-executor split as sandbox: the
  orchestration (`experimental_startServices`) is pure over the injected port and
  unit-testable with a fake; the `docker` calls live in the port impl.
- **`ContainerRuntime` port** — the backend seam. Default v0 = raw `docker`;
  podman / testcontainers / the macOS os-isolation backend swap in by injection,
  never a conditional (the port + injection principle, so backend #2 is a new
  object).
- **No new CLI verb.** It's an additive `services` option on `runEval` /
  `measureArms` (respects high-bar-for-new-commands) surfaced through the existing
  `test`/`eval` scripts.
- **Experimental subpath.** The surface ships under `vigiles/experimental` with an
  `experimental_` name prefix, so the import signals instability and it stays out
  of the stable `vigiles/testing` contract until it settles.

## The surface (shipped experimental)

```ts
import { experimental_startServices } from "vigiles/experimental";
import type { ServiceSpec, ContainerRuntime } from "vigiles/experimental";
```

- `ServiceSpec` — `{ image, env?, port?, ports?, ready?, seed?, reset? }`.
- `ServiceReady` — `{ tcp } | { log } | { exec }`; `start()` resolves only once it passes.
- `ServiceReset` — `"per-trial"` (default; repeatability) | `"per-arm"` (faster, idempotent-only).
- `ServiceHandle` — `{ host, port, url, exec(cmd) }`. `exec` is **sync** (the eval
  `measure` callback is sync) and is the **only** state-inspection primitive — it
  shells the service's own CLI (`psql`/`redis-cli`) so vigiles takes no per-service
  client dependency.
- `ServiceSession` — `{ handles, endpoints, teardown() }`. `endpoints` pins the
  egress allowlist; `teardown` disposes every container.
- `ContainerRuntime` — the port (`name`, `available`, `start`, `stop`); `start`
  honours `ready` + runs `seed`.
- `experimental_startServices(services, runtime)` — pure orchestration; tears down
  the already-started services if any fail.

## The intended (deferred) eval wiring

The `runEval` / `measureArms` additive shape, once the Docker runtime lands:

```ts
const report = await measureArms({
  name: "liquibase-migrator: applies the migration cleanly",
  services: {
    db: {
      image: "postgres:16",
      env: { POSTGRES_PASSWORD: "test", POSTGRES_DB: "app" },
      port: 5432,
      ready: { exec: "pg_isready -U postgres" },
      seed: "psql -U postgres -d app -f references/schema.sql",
      reset: "per-trial",
    },
  },
  env: (svc) => ({ DATABASE_URL: svc.db.url }), // injected into the agent's run env
  fixture: { "migration.sql": "ALTER TABLE users ADD COLUMN age int;" },
  task: "Apply migration.sql to $DATABASE_URL using the skill. Stop.",
  arms: { baseline: {}, skill: { pluginDir: "./skills/liquibase-migrator" } },
  measure: (ctx) => {
    const cols = ctx
      .service("db")
      .exec(
        "psql -U postgres -d app -tAc " +
          "\"select column_name from information_schema.columns where table_name='users'\"",
      ).stdout;
    return { cost: ctx.usage.costUsd, migrated: /\bage\b/.test(cols) ? 1 : 0 };
  },
  trials: 5,
  model: "sonnet",
});
```

Threads to build: (1) accept `services` on the arm/spec; (2) call
`experimental_startServices` before the run and `teardown` after (per-trial reset =
fresh session per trial); (3) map handles → run env via the `env` mapper; (4) set
the run's `egress: { allow: session.endpoints }`; (5) expose `ctx.service(name)` in
`measure`.

## Honest constraints (state, don't relitigate)

- **Docker required.** Linux-first; macOS via Docker Desktop until the
  os-isolation port lands. This is the one hard dep R1/R2 avoid → keep R3 thin,
  explicit-opt-in, and **never in `vigiles audit`** (audit stays side-effect-free).
- **Not free-replayable.** Real side effects can't be shadow-on-PATH replayed like
  R2. The eval-lock still records observed metrics for CI to re-check without a
  model, but a fresh `--update` re-runs the container → the cache key must mark a
  `services`-bearing run non-cacheable-for-free.
- **Service deterministic; model not.** Fresh schema per trial removes infra
  flakiness; trials × Welch significance still govern the behavioral verdict.
- **Not a container orchestrator.** vigiles composes with Docker/the OS-isolation
  backends; it does not build a new sandbox (the standing non-goal).

## Build increments

1. **v0 — generic container service** (`image`/`env`/`port`/`ready`/`seed` +
   `ctx.service().exec` + per-trial reset + egress auto-pin, backed by a `docker`
   `ContainerRuntime`). Covers Postgres/redis/mysql/clickhouse — most of the finite
   R3 shortlist. This is the whole "test a skill's real side effects" story for
   backend skills. Scope: days, not weeks (confinement + egress are done).
2. **v1 — a `browser` preset** (Chromium is already in the env via Playwright) for
   the DOM/accessibility class.
3. **v2 — `compose` backend** (multi-service `docker-compose.yml`) for skills that
   need DB + redis together.

Build v0 first; the surface here is the target it lands against.

## See also

- [`eval-coverage-and-isolation.md`](eval-coverage-and-isolation.md) — the R1/R2/R3
  model this is the R3 build of; the coverage distribution (R3 ≈ 0–9%) that says
  keep it thin.
- [`cross-platform-sandboxing.md`](cross-platform-sandboxing.md) — the ephemeral run
  env + the os-isolation port the macOS path depends on.
- [`sandbox-network.md`](sandbox-network.md) — the egress allowlist R3 pins to the
  services.
