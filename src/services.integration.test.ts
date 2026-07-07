/**
 * R3 disposable-service tier — REAL Docker integration (⚠️ experimental).
 *
 * Runs the actual R3 scenario against a real container: start a throwaway
 * Postgres, wait for readiness, seed a schema, run the side effect a migration
 * skill would (add a column) via `exec`, verify the REAL resulting DB state, and
 * tear it down. Model-free (the skill's side effect is stood in by a direct
 * `exec`), so this is an INTEGRATION test, not e2e — it proves the container
 * lifecycle + state verification the eval tier composes on top of.
 *
 * GATED: skips loudly when no Docker daemon is reachable (local dev without
 * Docker), and runs for real on Linux CI (`ubuntu-latest` ships Docker) — the
 * same pattern as the bwrap/claude/codex-gated tests.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

import { experimental_withServices } from "./services.js";
import { experimental_dockerRuntime } from "./services-docker.js";

const dockerUp =
  spawnSync("docker", ["info"], { stdio: "ignore", timeout: 20_000 }).status ===
  0;

describe.skipIf(!dockerUp)("R3 real Docker (integration)", () => {
  it("applies a migration to a real Postgres and verifies the column landed", async () => {
    const migrated = await experimental_withServices(
      {
        db: {
          image: "postgres:16-alpine",
          env: { POSTGRES_PASSWORD: "test", POSTGRES_DB: "app" },
          port: 5432,
          ready: { exec: "pg_isready -U postgres -d app" },
          seed: "psql -U postgres -d app -c 'create table users (id int)'",
        },
      },
      experimental_dockerRuntime,
      (svc) => {
        // the side effect a migration skill would perform (stood in by exec)
        const applied = svc.handles.db.exec(
          "psql -U postgres -d app -c 'alter table users add column age int'",
        );
        expect(applied.code).toBe(0);
        // verify the REAL resulting state
        const cols = svc.handles.db
          .exec(
            "psql -U postgres -d app -tAc " +
              "\"select column_name from information_schema.columns where table_name='users'\"",
          )
          .stdout.split("\n")
          .map((s) => s.trim());
        expect(svc.endpoints[0]).toMatch(/^127\.0\.0\.1:\d+$/);
        return Promise.resolve(cols.includes("age"));
      },
    );
    expect(migrated).toBe(true);
  }, 120_000);

  it("readiness via a real tcp probe (redis), state round-trips", async () => {
    const got = await experimental_withServices(
      {
        cache: {
          image: "redis:7-alpine",
          port: 6379,
          ready: { tcp: 6379 }, // the real netProbe seam, end to end
          seed: "redis-cli set greeting hello",
        },
      },
      experimental_dockerRuntime,
      (svc) =>
        Promise.resolve(
          svc.handles.cache.exec("redis-cli get greeting").stdout.trim(),
        ),
    );
    expect(got).toBe("hello");
  }, 90_000);
});
