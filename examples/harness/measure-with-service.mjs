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
import { runEval } from "../../dist/testing.js";

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
      // Postgres opens TCP only after init creates the DB — race-free readiness
      // (pg_isready reports ready on the socket-only init server, too early).
      ready: { tcp: 5432 },
      seed: "psql -U postgres -d app -c 'create table users (id int)'",
    },
  },
  experimental_dockerRuntime,
  async (svc) =>
    // runEval — takes a measure(ctx) callback + supports ephemeralEnv
    runEval({
      name: "migrator: applies the migration to a real Postgres",
      fixture: { "migration.sql": "ALTER TABLE users ADD COLUMN age int;" },
      // The task carries the FULL connection string incl. the password — with
      // ephemeralEnv there is no ambient PGPASSWORD, so the agent needs it here.
      task:
        `Apply migration.sql to the Postgres at ` +
        `postgresql://postgres:test@${svc.endpoints[0]}/app . Then stop.`,
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
      // trials: 1 — the container lives for the whole run (per-RUN lifecycle), so a
      // persistent side effect (the added column) would make later trials pass for
      // free. Keep it 1 until per-trial reset exists. See docs § Experimental.
      trials: 1,
      model: "sonnet",
    }),
);

console.log(JSON.stringify(report.arms, null, 2));
