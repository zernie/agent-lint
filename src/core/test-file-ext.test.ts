/** Which extension a generated test gets. Pure: signals in, extension out. */
import { test } from "vitest";
import assert from "node:assert/strict";

import { testFileExt } from "./test-file-ext.js";

const pkg = (o: unknown) => JSON.stringify(o);

test("a plain project gets .mjs — ESM regardless of the package's `type`", () => {
  assert.equal(testFileExt({ hasTsconfig: false }), "mjs");
});

test("a tsconfig.json is enough to write TypeScript, with no configuration", () => {
  assert.equal(testFileExt({ hasTsconfig: true }), "ts");
});

test("…so is a typescript dependency, in any of the three dep maps", () => {
  for (const key of ["dependencies", "devDependencies", "peerDependencies"])
    assert.equal(
      testFileExt({
        hasTsconfig: false,
        packageJson: pkg({ [key]: { typescript: "^5" } }),
      }),
      "ts",
      key,
    );
});

test("a dependency merely NAMED like typescript does not count", () => {
  assert.equal(
    testFileExt({
      hasTsconfig: false,
      packageJson: pkg({ devDependencies: { "typescript-eslint": "^8" } }),
    }),
    "mjs",
  );
});

test("the config field wins over detection — that is the whole reason it exists", () => {
  assert.equal(testFileExt({ hasTsconfig: true, configured: "mjs" }), "mjs");
  assert.equal(testFileExt({ hasTsconfig: false, configured: "ts" }), "ts");
  assert.equal(testFileExt({ hasTsconfig: false, configured: ".ts" }), "ts");
});

test("a nonsense config value is IGNORED, not honoured and not thrown on", () => {
  // Writing `foo.harness.rb` because somebody typed `rb` produces a file no runner
  // executes — and the untested finding would then point at a path that can never
  // satisfy it.
  assert.equal(testFileExt({ hasTsconfig: true, configured: "rb" }), "ts");
  assert.equal(testFileExt({ hasTsconfig: false, configured: "" }), "mjs");
});

test("a malformed package.json decides nothing rather than throwing", () => {
  // It is another rule's finding. This decision must survive it.
  assert.equal(
    testFileExt({ hasTsconfig: false, packageJson: "{ not json" }),
    "mjs",
  );
});

test("the finding and the generator must not contradict each other", () => {
  // A generator that writes `foo.harness.ts` while the finding says to add
  // `foo.harness.mjs` teaches the reader that the tool disagrees with itself. Both
  // sides take the extension from this one function; this pins that they do.
  const ts = testFileExt({ hasTsconfig: true });
  const js = testFileExt({ hasTsconfig: false });
  assert.equal(ts, "ts");
  assert.equal(js, "mjs");
  assert.notEqual(ts, js);
});
