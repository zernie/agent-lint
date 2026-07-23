/**
 * Prevention gate for the dogfood A/I3 bug class — a command that resolves the
 * harness by RAW auto-detection alone silently ignores the `.vigilesrc.json`
 * `harness` key (it honours only `--harness=`). The fix routes every command
 * through `resolveCommandHarness` / `resolveHarnessSelection`, which reads the
 * config. This test makes the OLD path irrepresentable in `cli.ts`: the CLI must
 * not call `detectAdapterResult(` directly (only `resolveHarnessSelection` may,
 * inside `adapter-registry.ts`). A future command that reaches for the raw
 * detector re-introduces the bug and fails here, without needing to run it.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLI_SRC = readFileSync(join(__dirname, "cli.ts"), "utf-8");

test("cli.ts resolves the harness through resolveHarnessSelection, never raw detect (dogfood A/I3)", () => {
  // A direct call — `detectAdapterResult(` — bypasses config.harness. Strip
  // line comments first so the doc comment on `resolveCommandHarness` (which
  // names the anti-pattern in prose) doesn't count as a call.
  const code = CLI_SRC.split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .filter((l) => !l.trimStart().startsWith("*"))
    .join("\n");
  assert.ok(
    !/\bdetectAdapterResult\s*\(/.test(code),
    "cli.ts must not call detectAdapterResult() directly — use resolveCommandHarness (honours --harness / config.harness / auto-detect). See dogfood A/I3.",
  );
});
