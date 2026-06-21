// perf.mjs — measure the TS-scaling of the whole-harness registry.
//
// For each N it generates N synthetic specs (each a realistic agent() with an
// ok/err shape + a delegate edge to the next), folds them into ONE registry,
// and times `tsc --noEmit`. It runs TWO encodings of the cross-checks so we can
// see exactly where TypeScript scales and where it walls:
//
//   "scalable" — O(N) checks only: the dangling-delegate type check
//                (NoDanglingDelegates) + duplicate-name detected in the GENERATOR
//                (JS, free). This is the design the prototype ships.
//   "naive"    — adds the O(N²) injective-name MAPPED TYPE for duplicate names —
//                included ONLY to show the wall it hits (TS2589 ≈ N=1000).
//
// Usage: node perf.mjs [N1 N2 ...]   (default sweep)

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIM = resolve(HERE, "spec-shim.ts");
const TSC = resolve(HERE, "../../../node_modules/.bin/tsc");

const FIELD_TYPES = ["string", "number", "boolean", "string[]"];

function genSpec(i, total) {
  const next = `agent${(i + 1) % total}`;
  const okFields = [0, 1, 2, 3]
    .map((j) => `    f${j}: ${JSON.stringify(FIELD_TYPES[(i + j) % 4])},`)
    .join("\n");
  return `import { agent, result } from "../spec-shim.js";
export default agent({
  name: "agent${i}",
  description: "Synthetic worker ${i}.",
  tools: ["Read", "Grep", "Write"],
  delegatesTo: ["${next}"],
  output: result(
    {
${okFields}
    },
    { reason: "string", retryable: "boolean" },
  ),
});
`;
}

function timeOne(N, mode) {
  const dir = mkdtempSync(join(tmpdir(), `harness-perf-${mode}-${N}-`));
  try {
    const sd = join(dir, "specs");
    mkdirSync(sd);
    for (let i = 0; i < N; i++)
      writeFileSync(join(sd, `agent${i}.spec.ts`), genSpec(i, N));
    execSync(
      `cp ${JSON.stringify(SHIM)} ${JSON.stringify(join(dir, "spec-shim.ts"))}`,
    );

    const L = [`import type { NoDanglingDelegates } from "./spec-shim";`];
    for (let i = 0; i < N; i++)
      L.push(`import agent${i} from "./specs/agent${i}.spec.ts";`);
    L.push("export const registry = {");
    for (let i = 0; i < N; i++) L.push(`  "agent${i}": agent${i},`);
    L.push("} as const;");
    // O(N) dangling check — present in BOTH modes (it's the scalable one).
    L.push(
      "const _nd: true = null as unknown as NoDanglingDelegates<typeof registry>; void _nd;",
    );
    if (mode === "naive") {
      // The O(N²) injective-name map — the encoding that hits TS2589.
      L.push("type _Reg = typeof registry;");
      L.push('type _NameOf<K extends keyof _Reg> = _Reg[K]["__name"];');
      L.push(
        "type _KeyForName<N extends string> = { [K in keyof _Reg]: _NameOf<K> extends N ? K : never }[keyof _Reg];",
      );
      L.push(
        "type _NU = { [K in keyof _Reg]: [_KeyForName<_NameOf<K> & string>] extends [K] ? true : { __dup: _NameOf<K> } }[keyof _Reg];",
      );
      L.push("const _nu: true = null as unknown as _NU; void _nu;");
    }
    // ("scalable" mode detects duplicate names in the GENERATOR, JS-side — not here.)
    writeFileSync(join(dir, "harness.gen.ts"), L.join("\n") + "\n");
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "Node16",
          moduleResolution: "Node16",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
        },
        include: ["harness.gen.ts"],
      }),
    );
    const t0 = process.hrtime.bigint();
    const r = spawnSync(TSC, ["--noEmit", "-p", "tsconfig.json"], {
      cwd: dir,
      encoding: "utf8",
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const out = (r.stdout || "") + (r.stderr || "");
    return { N, mode, ms, ts2589: /TS2589/.test(out), errored: r.status !== 0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const Ns = sizes.length ? sizes : [5, 20, 50, 100, 200, 500, 1000];

const results = { scalable: [], naive: [] };
for (const mode of ["scalable", "naive"]) {
  console.log(`\n  --- ${mode} encoding ---`);
  for (const N of Ns) {
    const r = timeOne(N, mode);
    results[mode].push(r);
    console.log(
      `  N=${String(N).padStart(4)}  tsc=${r.ms.toFixed(0).padStart(6)}ms  ` +
        `TS2589=${r.ts2589 ? "YES <-- WALL" : "no "}  ${r.errored ? "errored" : "clean"}`,
    );
  }
}

export { results };
