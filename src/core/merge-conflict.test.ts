import { test } from "vitest";
import assert from "node:assert/strict";

import {
  hasMergeConflictMarkers,
  conflictedHarnessConfigs,
  mergeConflictWarning,
  HARNESS_CONFIG_FILES,
} from "./merge-conflict.js";

// The shape git actually leaves behind — the one observed 2026-08-10, where a
// `dependencies` block present on one side and absent on the other took the whole
// compiled-hook layer down with it.
const CONFLICTED_PACKAGE_JSON = `{
  "name": "repo",
  "type": "module",
<<<<<<< HEAD
  "dependencies": { "vigiles": "*", "markdown-it": "^14.0.0" }
=======
  "dependencies": { "vigiles": "*" }
>>>>>>> origin/main
}
`;

test("hasMergeConflictMarkers: a real conflicted package.json is detected", () => {
  assert.equal(hasMergeConflictMarkers(CONFLICTED_PACKAGE_JSON), true);
  // diff3 style carries an extra base section; the outer pair is unchanged.
  assert.equal(
    hasMergeConflictMarkers(
      "<<<<<<< ours\na\n||||||| base\nb\n=======\nc\n>>>>>>> theirs\n",
    ),
    true,
  );
});

test("hasMergeConflictMarkers: half a marker set is NOT a conflict", () => {
  // This is the false positive that matters: the predicate feeds a message
  // telling the author their file is broken, and `=======` alone is a Markdown
  // heading underline in every other file in the repo.
  assert.equal(hasMergeConflictMarkers("Title\n=======\n\nbody\n"), false);
  assert.equal(hasMergeConflictMarkers("cat <<<<<<<EOF\n"), false);
  // Both ENDS are required. One marker alone is not a state git produces, and
  // the ones that do occur alone occur in prose about conflicts — including the
  // documentation of this very check.
  assert.equal(hasMergeConflictMarkers("<<<<<<< HEAD\nmine\n"), false);
  assert.equal(hasMergeConflictMarkers(">>>>>>> theirs\n"), false);
  // Order matters too: a close before an open is not a conflict hunk.
  assert.equal(hasMergeConflictMarkers(">>>>>>> a\n<<<<<<< b\n"), false);
  assert.equal(hasMergeConflictMarkers('{ "name": "repo" }\n'), false);
  assert.equal(hasMergeConflictMarkers(""), false);
  // Markers must start the line — quoted inside a JSON string they are content.
  assert.equal(
    hasMergeConflictMarkers('{ "doc": "<<<<<<< then >>>>>>> " }'),
    false,
  );
});

test("conflictedHarnessConfigs: names only the files that are actually broken", () => {
  const read = (p: string): string | undefined =>
    p === "package.json" ? CONFLICTED_PACKAGE_JSON : undefined;
  assert.deepEqual(conflictedHarnessConfigs(read), ["package.json"]);
  // Missing file (`undefined`) is not a finding, and neither is a clean one.
  assert.deepEqual(
    conflictedHarnessConfigs(() => '{ "harness": "claude-code" }'),
    [],
  );
  assert.deepEqual(
    conflictedHarnessConfigs(() => undefined),
    [],
  );
});

test("the two harness configs fail DIFFERENTLY, and the wording says so", () => {
  // `package.json` is the measured wedge — it stops `vigiles/hook` resolving.
  // `.vigilesrc.json` fails quieter: settings silently revert to defaults.
  // Reporting both with one sentence would make the loud one look survivable.
  assert.match(mergeConflictWarning("package.json"), /vigiles\/hook/);
  assert.match(
    mergeConflictWarning(".vigilesrc.json"),
    /falls back to the default/,
  );
  assert.notEqual(
    mergeConflictWarning("package.json"),
    mergeConflictWarning(".vigilesrc.json"),
  );
  assert.deepEqual(
    [...HARNESS_CONFIG_FILES],
    ["package.json", ".vigilesrc.json"],
  );
});
