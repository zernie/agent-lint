#!/usr/bin/env node
/**
 * check.mjs — every command CI's `check` job runs, runnable in one line locally.
 *
 * WHY THIS EXISTS, and it is not "convenience". On 2026-08-16 three PRs went to
 * `main` red. The author had run a five-command list from memory; the `check` job
 * runs thirteen. The one that failed — `tsc -p test/types/tsconfig.json` — sits in
 * a SEPARATE tsconfig excluded from the root one, so the root type-check could not
 * see it, and three `@ts-expect-error` assertions had silently stopped failing.
 *
 * The fix is not a longer list to remember. It is that CI now INVOKES this file
 * (`run: npm run check`) instead of restating the commands, so there is one list
 * and it cannot drift from itself. That is the pre-commit / just / mise pattern:
 * the task definition is the source of truth and CI calls it.
 *
 * WHAT STAYS IN ci.yml, deliberately: the two `uses: ./` steps that dogfood this
 * repo's own composite Action (`command: lint`, `command: eval-check`). They
 * exercise the ACTION WRAPPER, which has no shell equivalent — running
 * `vigiles lint` here would test the CLI, which the `cli-lint` entry below
 * already does, and would prove nothing about the wrapper. They are the only
 * things in that job this file does not cover, and that is a property of what
 * they test, not an omission.
 *
 * THE STAGES ARE LOAD-BEARING, not decoration. Some of these commands WRITE the
 * files the others READ — `generate types` rewrites `.vigiles/generated.d.ts`,
 * `api-extractor` rewrites `api-surface/*.api.md`, `build` rewrites `dist/`.
 * Running a writer beside a reader is a race whose outcome depends on timing, so
 * writers are serialized and only the read-only group runs in parallel.
 *
 * On failure it names the command that failed. That is the one thing the old
 * per-step CI names bought, and it is cheap to keep.
 *
 *   node scripts/check.mjs            # everything
 *   node scripts/check.mjs --list     # print the commands, run nothing
 */
import { spawn } from "node:child_process";
import { cpus } from "node:os";

/** Stage 1 — everything downstream reads `dist/`. */
const BUILD = { name: "build", cmd: "npm run build" };

/** Stage 2 — read-only. Safe to run together; none of these writes a tracked file. */
const PARALLEL = [
  { name: "types:root", cmd: "npx tsc --noEmit" },
  { name: "types:test", cmd: "npx tsc --noEmit -p test/types/tsconfig.json" },
  { name: "types:site", cmd: "npx tsc --noEmit -p site/tsconfig.json" },
  { name: "jest", cmd: "npx jest" },
  { name: "cli-lint", cmd: "node dist/cli.js lint" },
  { name: "lint", cmd: "npm run lint" },
  { name: "format", cmd: "npm run fmt:check" },
  {
    name: "docs-imports",
    cmd: "node scripts/check-doc-imports.mjs . docs README.md",
  },
  { name: "export-prefixes", cmd: "node scripts/check-export-prefixes.mjs ." },
  {
    name: "experimental-naming",
    cmd: "node scripts/check-experimental-naming.mjs",
  },
  { name: "typedoc", cmd: "npx typedoc" },
  {
    name: "corpus-guards",
    cmd: "node bench/corpus/verify.mjs && node bench/corpus/verify-headroom.mjs",
  },
  { name: "text-sources", cmd: "node scripts/check-text-sources.mjs" },
  {
    name: "rule-enforcer",
    cmd: "npm ci --prefix rule-enforcer && node rule-enforcer/gate.js",
  },
];

/** Stage 3 — these WRITE. Serialized after the readers have finished. */
const WRITERS = [
  { name: "api-surface", cmd: "node scripts/api-extractor.mjs" },
  {
    name: "generated-types",
    cmd: "node dist/cli.js generate types && npx tsc --noEmit",
  },
  {
    name: "generated-types:committed",
    cmd: "git diff --exit-code .vigiles/generated.d.ts",
  },
];

const ALL = [BUILD, ...PARALLEL, ...WRITERS];

if (process.argv.includes("--list")) {
  for (const s of ALL) console.log(`${s.name.padEnd(26)} ${s.cmd}`);
  process.exit(0);
}

function run({ name, cmd }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) =>
      resolve({ name, cmd, code, out, ms: Date.now() - started }),
    );
  });
}

/** Bounded concurrency — 13 `tsc`/`jest` processes at once thrashes a laptop. */
async function pool(items, limit) {
  const results = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        const r = await run(items[i]);
        results[i] = r;
        console.log(
          `${r.code === 0 ? "✓" : "✗"} ${r.name} (${(r.ms / 1000).toFixed(1)}s)`,
        );
      }
    },
  );
  await Promise.all(workers);
  return results;
}

const failures = [];
const t0 = Date.now();

const build = await run(BUILD);
console.log(
  `${build.code === 0 ? "✓" : "✗"} ${build.name} (${(build.ms / 1000).toFixed(1)}s)`,
);
if (build.code !== 0) {
  // Nothing downstream can be trusted without dist/, so stop rather than emit
  // twelve derived failures that all say the same thing.
  console.error(`\n${build.out}\n✗ build failed — the rest cannot run.`);
  process.exit(1);
}

failures.push(
  ...(await pool(PARALLEL, Math.max(2, Math.min(6, cpus().length - 1)))).filter(
    (r) => r.code !== 0,
  ),
);

for (const w of WRITERS) {
  const r = await run(w);
  console.log(
    `${r.code === 0 ? "✓" : "✗"} ${r.name} (${(r.ms / 1000).toFixed(1)}s)`,
  );
  if (r.code !== 0) failures.push(r);
}

console.log(
  `\n${ALL.length - failures.length}/${ALL.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
);

if (failures.length) {
  for (const f of failures) {
    console.error(
      `\n──────── ✗ ${f.name} ────────\n$ ${f.cmd}\n${f.out.trimEnd()}`,
    );
  }
  console.error(`\nFAILED: ${failures.map((f) => f.name).join(", ")}`);
  process.exit(1);
}
