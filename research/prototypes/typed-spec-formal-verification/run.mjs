/**
 * run.mjs — orchestrates the formal-verification prototype. Exits 0.
 *
 * Always runs the two Node bounded checkers (no toolchain needed). If a TLA+
 * tools jar is reachable (env TLA_JAR or /tmp/tla2tools.jar), it ALSO runs TLC
 * on the generated model so you see the real model checker confirm the same
 * counterexample. TLC absence is reported LOUDLY (no-silent-skips), not faked.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(cmd, args, label) {
  console.log(`\n########## ${label} ##########`);
  const r = spawnSync(cmd, args, { cwd: here, stdio: "inherit" });
  return r.status ?? 1;
}

// 1) Node safety checker — finds the flat-model contract-escape counterexample.
run(
  node,
  ["mini-checker.mjs"],
  "Node mini-checker (safety, all interleavings)",
);

// 2) Node liveness checker — stale window + railway termination.
run(
  node,
  ["liveness-checker.mjs"],
  "Node liveness checker (temporal fragment)",
);

// 3) TLC, if available — the real model checker on the generated TLA+ model.
const jar = process.env.TLA_JAR ?? "/tmp/tla2tools.jar";
if (existsSync(jar)) {
  run(
    "java",
    ["-jar", jar, "AgentWindow.tla", "-config", "AgentWindow.cfg"],
    "TLC on AgentWindow.tla (flat model — EXPECT a counterexample)",
  );
  run(
    "java",
    ["-jar", jar, "AgentWindowStack.tla", "-config", "AgentWindowStack.cfg"],
    "TLC on AgentWindowStack.tla (stack fix — EXPECT no error)",
  );
} else {
  console.log(
    `\n########## TLC ##########\n⊘ SKIPPED: no TLA+ tools jar at ${jar} ` +
      `(set TLA_JAR or drop tla2tools.jar there). The Node checkers above are ` +
      `the runnable evidence; captured TLC output is in tlc-output.txt / ` +
      `tlc-output-stack-fix.txt.`,
  );
}

console.log(
  "\nDone. (checkers completed; a found counterexample is a RESULT.)",
);
process.exit(0);
