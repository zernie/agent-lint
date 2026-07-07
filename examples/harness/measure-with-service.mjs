/**
 * ⚠️ EXPERIMENTAL — A/B a skill against a REAL disposable service (R3), end to end.
 *
 * Wraps a `measureArms` A/B (baseline vs the migrator skill) in a throwaway
 * Postgres: run the skill for real, then verify the REAL resulting DB state — the
 * question promptfoo can't answer cheaply. See docs/measuring-skills.md § Experimental.
 *
 * ⚠️ SAFETY — R3 runs a model-driven skill FOR REAL. The disposable container is
 * the ONLY isolation. Run this in a DISPOSABLE environment (CI job / throwaway VM /
 * a dev box with no production access), point the task at the disposable DB ONLY,
 * and keep real credentials out of the run — `ephemeralEnv: true` below scrubs them.
 * Do NOT run it where DATABASE_URL / AWS_* / ~/.ssh reach real systems.
 *
 *   node examples/harness/measure-with-service.mjs   # needs Docker + claude + model auth
 *
 * Real model → real work ($0 beyond your subscription). Write-don't-run without both.
 */
import {
  experimental_withServices,
  experimental_dockerRuntime,
} from "../../dist/experimental.js";
import { measureArms } from "../../dist/testing.js";

if (!experimental_dockerRuntime.available()) {
  console.log("⊘ SKIPPED — no Docker daemon reachable (this tier needs one)");
  process.exit(77); // vigiles SKIP_EXIT_CODE — a loud skip, never a false pass
}

const report = await experimental_withServices(
  {
    db: {
      image: "postgres:16-alpine",
      env: { POSTGRES_PASSWORD: "test", POSTGRES_DB: "app" },
      port: 5432,
      ready: { exec: "pg_isready -U postgres" },
      // self-contained seed: idempotent so the shared-per-run container is clean
      // for every trial (per-trial reset is a later increment).
      seed: "psql -U postgres -d app -c 'drop table if exists users; create table users (id int)'",
    },
  },
  experimental_dockerRuntime,
  async (svc) =>
    measureArms({
      name: "migrator: applies the migration to a real Postgres",
      fixture: { "migration.sql": "ALTER TABLE users ADD COLUMN age int;" },
      task:
        `Apply migration.sql to the Postgres at ${svc.endpoints[0]} ` +
        `(db "app", user "postgres"). Then stop.`,
      arms: { baseline: {}, skill: { pluginDir: "./skills/migrator" } },
      ephemeralEnv: true, // scrub real credentials from the run (recommended)
      measure: () => {
        // verify the REAL resulting DB state — the whole point of R3
        const cols = svc.handles.db
          .exec(
            "psql -U postgres -d app -tAc " +
              "\"select column_name from information_schema.columns where table_name='users'\"",
          )
          .stdout.split("\n")
          .map((s) => s.trim());
        return { migrated: cols.includes("age") ? 1 : 0 };
      },
      trials: 3,
      model: "sonnet",
    }),
);

console.log(JSON.stringify(report.arms, null, 2));
