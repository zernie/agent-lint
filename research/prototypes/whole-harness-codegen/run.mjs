// run.mjs — one-shot reproducer for the whole-harness-codegen prototype.
//
// 1. Generates the GOOD registry over specs/ and asserts `tsc --noEmit` is clean.
// 2. Generates each BROKEN fixture and asserts `tsc` REJECTS it with the precise
//    cross-spec diagnostic (dangling delegate / duplicate name / handoff mismatch).
// 3. Asserts the GENERATOR itself rejects a duplicate name at codegen time (the
//    scalable O(N) path).
// 4. Runs the perf harness and prints the N -> tsc-time curve + the ceiling.
//
// Exits 0 iff every assertion holds.

import { execSync, spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TSC = resolve(HERE, "../../../node_modules/.bin/tsc");
const node = process.execPath;

let failures = 0;
const ok = (label) => console.log(`  PASS  ${label}`);
const bad = (label, detail) => {
  console.log(`  FAIL  ${label}\n        ${detail}`);
  failures++;
};

function gen(args) {
  const r = spawnSync(node, [join(HERE, "generate.mjs"), ...args], {
    cwd: HERE,
    encoding: "utf8",
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function tsc(tsconfigRel) {
  const r = spawnSync(TSC, ["--noEmit", "-p", tsconfigRel], {
    cwd: HERE,
    encoding: "utf8",
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

console.log("\n[1] GOOD registry compiles clean");
gen([
  "specs",
  "harness.gen.ts",
  "--handoffs",
  "planner:implementer",
  "--needs",
  "implementer=plan:string|files:string[]",
]);
{
  const r = tsc("tsconfig.json");
  if (r.status === 0) ok("good registry: tsc exit 0, no errors");
  else bad("good registry should compile", r.out.slice(0, 400));
}

console.log("\n[2] BROKEN registries are rejected by tsc with the right field");

// dangling delegate
gen(["fails/dangling", "fails/dangling/harness.gen.ts"]);
{
  const r = tsc("fails/dangling/tsconfig.json");
  if (r.status !== 0 && /__dangling_delegate: "ghost"/.test(r.out))
    ok('dangling: tsc names __dangling_delegate "ghost" from "orphan"');
  else bad("dangling should be rejected naming ghost", r.out.slice(0, 500));
}

// duplicate name (TYPE-LEVEL check, demonstrated on small N where it's precise;
// --no-dup-guard lets the generator emit the O(N²) type check instead of failing
// at codegen, so we can show BOTH the type-level catch AND the JS guard [step 3]).
gen(["fails/duplicate", "fails/duplicate/harness.gen.ts", "--no-dup-guard"]);
{
  const r = tsc("fails/duplicate/tsconfig.json");
  if (r.status !== 0 && /__duplicate_name: "reviewer"/.test(r.out))
    ok('duplicate (type-level): tsc names __duplicate_name "reviewer"');
  else bad("duplicate should be rejected naming reviewer", r.out.slice(0, 500));
}

// handoff mismatch (diff: string vs needs string[])
gen([
  "fails/handoff",
  "fails/handoff/harness.gen.ts",
  "--handoffs",
  "producer:consumer",
  "--needs",
  "consumer=diff:string[]",
]);
{
  const r = tsc("fails/handoff/tsconfig.json");
  if (
    r.status !== 0 &&
    /__mismatch: "diff"/.test(r.out) &&
    /expected: "string\[\]"/.test(r.out) &&
    /got: "string"/.test(r.out)
  )
    ok('handoff: tsc names __mismatch "diff" expected string[] got string');
  else bad("handoff should be rejected naming diff", r.out.slice(0, 500));
}

console.log(
  "\n[3] GENERATOR rejects a duplicate name at codegen (scalable O(N) path)",
);
{
  // Same fixture (alpha.spec.ts + beta.spec.ts both declare name "reviewer"),
  // now WITH the JS guard on: it reads each spec's declared `name:` and collides.
  const r = gen(["fails/duplicate", "fails/duplicate/harness.gen.ts"]);
  if (r.status === 2 && /DUPLICATE agent name "reviewer"/.test(r.out))
    ok(
      'generator exits 2 on duplicate agent name "reviewer" (O(N), no type cost)',
    );
  else
    bad(
      "generator should exit 2 on a duplicate declared name",
      r.out.slice(0, 300),
    );
}

console.log(
  "\n[4] PERF CURVE — tsc time vs N specs (the make-or-break question)",
);
{
  const r = spawnSync(
    node,
    [join(HERE, "perf.mjs"), "5", "20", "50", "100", "200", "500", "1000"],
    {
      cwd: HERE,
      encoding: "utf8",
    },
  );
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) process.stderr.write(r.stderr || "");
}

console.log(
  `\n${failures === 0 ? "ALL CROSS-SPEC ASSERTIONS PASSED" : failures + " ASSERTION(S) FAILED"}`,
);
process.exit(failures === 0 ? 0 : 1);
