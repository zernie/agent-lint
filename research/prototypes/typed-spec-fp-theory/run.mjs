// One-shot reproducer for research/typed-spec-fp-theory.md.
//
// Asserts:
//   T1  selective-applicative.ts COMPILES (all Expect<> proofs hold: applicative
//       surface exact, selective surface = exact JOIN, monadic surface WIDENED).
//   T1- monadic-loss-fails.ts COMPILES ONLY because a single @ts-expect-error
//       consumes the rejection of an under-stated surface claim; removing it
//       surfaces a real TS error (proving the monadic surface can't be narrowed).
//   T2  abstract-interpreters.mjs runs green (one AST, ≥2 interpreters, static
//       effect/capability/cost surface + the capability diff).
//   T3  monoid-laws.mjs runs green (join-semilattice laws + proofs.ts connection).
//   T4  capability-lens.mjs runs green (optics evaluated honestly).
//
// Run: `node research/prototypes/typed-spec-fp-theory/run.mjs` — exits 0 on success.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const TSC = [
  "--noEmit",
  "--strict",
  "--target",
  "es2022",
  "--module",
  "nodenext",
  "--moduleResolution",
  "nodenext",
];

function tsc(file) {
  try {
    execFileSync("npx", ["tsc", ...TSC, join(dir, file)], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, out: "" };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

function node(file) {
  try {
    const out = execFileSync("node", [join(dir, file)], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

let failed = false;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, detail) => {
  failed = true;
  console.log(`  ✗ ${label}\n${detail}`);
};

console.log(
  "T1 — the Applicative/Selective/Monad static-analyzability boundary:",
);
{
  const r = tsc("selective-applicative.ts");
  if (r.ok)
    ok("selective-applicative.ts compiles — all Expect<> surface proofs hold");
  else bad("selective-applicative.ts should compile", r.out);
}
{
  // The fails file compiles BECAUSE the single @ts-expect-error consumes the
  // rejection of the under-stated claim.
  const r = tsc("monadic-loss-fails.ts");
  if (r.ok)
    ok(
      "monadic-loss-fails.ts: under-stated monadic surface rejected (consumed by @ts-expect-error)",
    );
  else
    bad(
      "monadic-loss-fails.ts should compile (the ts-expect-error consumes the error)",
      r.out,
    );

  // And prove the rejection is REAL: strip the directive, expect a hard error.
  const stripped = node("strip-probe.mjs");
  if (stripped.ok && /TS2554|TS2345/.test(stripped.out))
    ok(
      `without @ts-expect-error tsc errors (${(stripped.out.match(/TS25\d\d/) ?? ["?"])[0]}) — the surface loss is enforced`,
    );
  else
    bad(
      "stripping @ts-expect-error should surface a real TS error",
      stripped.out,
    );
}

console.log("T2 — one AST, multiple abstract interpreters:");
{
  const r = node("abstract-interpreters.mjs");
  if (r.ok)
    ok(
      "abstract-interpreters.mjs runs green (effect/capability/cost surfaces + diff)",
    );
  else bad("abstract-interpreters.mjs should run green", r.out);
}

console.log("T3 — join-semilattice monoid laws:");
{
  const r = node("monoid-laws.mjs");
  if (r.ok)
    ok("monoid-laws.mjs runs green (4 laws + monotonicity + proofs.ts link)");
  else bad("monoid-laws.mjs should run green", r.out);
}

console.log("T4 — optics for the capability diff (honest eval):");
{
  const r = node("capability-lens.mjs");
  if (r.ok)
    ok(
      "capability-lens.mjs runs green (getter-diff = repackaged fold; set = a separate win)",
    );
  else bad("capability-lens.mjs should run green", r.out);
}

console.log(
  failed ? "\nFAILED" : "\nAll typed-spec-fp-theory prototypes verified ✓",
);
process.exit(failed ? 1 : 0);
