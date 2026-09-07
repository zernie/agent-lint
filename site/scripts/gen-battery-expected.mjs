/**
 * Regenerate the disaster-battery fixture the Guard section is pinned to.
 *
 * The landing page shows the seven commands of the engine's DISASTER_CATALOG
 * (src/guardrail-check.ts) and the 2-of-7 / 7-of-7 result measured against them.
 * The site CANNOT import that module: it pulls in `run-hook.js`, which needs
 * node:child_process — there is no browser shim for spawning a process. So the
 * table is retyped in Guard.tsx, and a retyped list is a list that drifts.
 *
 * This writes the catalog's ids + commands to a JSON fixture; the browser test
 * (Guard.browser.test.tsx) asserts the section's rows still match it. Same shape
 * as gen-parity-expected.mjs, for the same reason.
 *
 * It runs as `pretest:browser`, not only by hand — a fixture that is only
 * regenerated when someone remembers can go stale, and a stale fixture makes the
 * test agree with the page about something the engine no longer says. Because CI
 * regenerates first, a catalog change fails the test instead of passing quietly.
 *
 *   node scripts/gen-battery-expected.mjs      # or: npm run gen:battery
 */
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const engine = here("../../dist/guardrail-check.js");
if (!existsSync(engine)) {
  console.error(
    `no built engine at ${engine} — run \`npm run build\` at the repo root first ` +
      `(the site's @engine/* aliases need it too).`,
  );
  process.exit(1);
}

const { DISASTER_CATALOG } = await import(engine);

const fixture = {
  // Provenance, so the next reader knows this file is generated and from where.
  source: "src/guardrail-check.ts — DISASTER_CATALOG",
  regenerate: "npm --prefix site run gen:battery",
  events: DISASTER_CATALOG.map((e) => ({
    id: e.id,
    label: e.label,
    command: e.input.command,
  })),
};

const out = here(
  "../src/components/sections/__fixtures__/disaster-battery.json",
);
writeFileSync(
  out,
  await format(JSON.stringify(fixture, null, 2), {
    parser: "json",
    filepath: out,
  }),
);
console.log(`wrote ${out} (${String(fixture.events.length)} events)`);
