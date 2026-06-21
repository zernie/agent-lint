// Helper for run.mjs: strip the @ts-expect-error from monadic-loss-fails.ts and
// type-check the result, proving the rejection of an under-stated monadic
// surface claim is a REAL tsc error (not a vacuous expect-error). Prints the
// tsc diagnostic; exits 0 if a TS error was produced (the expected outcome).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "monadic-loss-fails.ts"), "utf8");
const stripped = src.replace(
  /^\s*\/\/ @ts-expect-error.*$/m,
  "// (directive removed)",
);
const probe = join(dir, "_strip-probe.tmp.ts");
writeFileSync(probe, stripped);

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "--noEmit",
      "--strict",
      "--target",
      "es2022",
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      probe,
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
  // No error => the rejection was NOT real. Fail loudly.
  console.log("NO TS ERROR — unexpected; the under-stated claim was accepted");
  process.exit(1);
} catch (e) {
  const out = (e.stdout ?? "") + (e.stderr ?? "");
  console.log(out.trim());
  process.exit(0);
} finally {
  rmSync(probe, { force: true });
}
