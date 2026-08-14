/**
 * Tests for `runMutations` (src/mutations.ts).
 *
 * The subject here is a thing that judges tests, so every case builds a REAL checker and a REAL
 * test in a temp dir and runs them — a mocked runner would be judging a mock. They are tiny (a
 * dozen lines each) and there is no model, so the whole file is fast and free.
 *
 * Each property gets BOTH halves: it fires on the defect it is for, and it stays quiet otherwise.
 * A guard proven only in the firing direction is indistinguishable from one that always fires.
 */
import { test, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runMutations,
  formatMutationReport,
  type MutationCase,
} from "./mutations.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * A checker that reports two independent defects, and a test that names each one distinctly.
 * `YEAR_RULE` and `TITLE_RULE` are the mutation targets.
 */
function fixture(): { cwd: string; checker: string; testFile: string } {
  const cwd = mkdtempSync(join(tmpdir(), "vigiles-mut-"));
  dirs.push(cwd);
  mkdirSync(join(cwd, "src"), { recursive: true });

  const checker = join(cwd, "src", "checker.mjs");
  writeFileSync(
    checker,
    [
      "export function check(rec) {",
      "  const out = [];",
      "  if (rec.year !== 2026) out.push('wrong year');",
      "  if (rec.title !== 'ok') out.push('wrong title');",
      "  return out;",
      "}",
    ].join("\n"),
  );

  const testFile = join(cwd, "src", "checker.harness.mjs");
  writeFileSync(
    testFile,
    [
      "import assert from 'node:assert/strict';",
      "import { check } from './checker.mjs';",
      "assert.ok(check({ year: 1999, title: 'ok' }).includes('wrong year'), 'the year rule is not watched');",
      "assert.ok(check({ year: 2026, title: 'no' }).includes('wrong title'), 'the title rule is not watched');",
      "console.log('ok');",
    ].join("\n"),
  );
  return { cwd, checker, testFile };
}

const kase = (
  over: Partial<MutationCase> & Pick<MutationCase, "edits" | "test" | "expect">,
): MutationCase => ({
  name: "case",
  disables: "something",
  ...over,
});

test("a planted defect the test names is KILLED, and the source is restored byte for byte", () => {
  const { cwd, checker, testFile } = fixture();
  const before = readFileSync(checker, "utf8");

  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "year",
        edits: [[checker, "rec.year !== 2026", "false"]],
        test: testFile,
        expect: "the year rule is not watched",
      }),
    ],
  });

  assert.equal(r.outcomes[0]?.verdict, "killed");
  assert.equal(r.killed, 1);
  assert.equal(r.restored, true);
  assert.equal(
    readFileSync(checker, "utf8"),
    before,
    "the checker was not restored",
  );
});

test("a defect caught by a NEIGHBOUR's assertion is wrong-assertion, not a kill", () => {
  // The mutation breaks the TITLE rule while the case claims the YEAR message. The test does go
  // red — so a runner that only looked at the exit code would call this proven.
  const { cwd, checker, testFile } = fixture();
  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "mislabelled",
        edits: [[checker, "rec.title !== 'ok'", "false"]],
        test: testFile,
        expect: "the year rule is not watched",
      }),
    ],
  });
  assert.equal(r.outcomes[0]?.verdict, "wrong-assertion");
  assert.equal(r.killed, 0);
  assert.match(r.outcomes[0]?.detail ?? "", /never printed/);
});

test("a defect nothing watches SURVIVES", () => {
  const { cwd, checker, testFile } = fixture();
  writeFileSync(
    checker,
    `${readFileSync(checker, "utf8")}\nexport const UNWATCHED = 1;\n`,
  );
  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "unwatched",
        edits: [
          [
            checker,
            "export const UNWATCHED = 1;",
            "export const UNWATCHED = 2;",
          ],
        ],
        test: testFile,
        expect: "anything",
      }),
    ],
  });
  assert.equal(r.outcomes[0]?.verdict, "survived");
});

test("a replacement equal to the original is NOT-APPLIED, never a kill", () => {
  // The no-op mutation: it leaves a green test that reads exactly like a passing one. Four of ten
  // hand-written copies of this driver lacked the guard.
  const { cwd, checker, testFile } = fixture();
  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "noop",
        edits: [[checker, "rec.year !== 2026", "rec.year !== 2026"]],
        test: testFile,
        expect: "the year rule is not watched",
      }),
    ],
  });
  assert.equal(r.outcomes[0]?.verdict, "not-applied");
  assert.match(r.outcomes[0]?.detail ?? "", /replacement equals the original/);
});

test("a `find` that matches zero or several times is NOT-APPLIED, and says which", () => {
  const { cwd, checker, testFile } = fixture();
  const zero = runMutations({
    cwd,
    cases: [
      kase({
        name: "gone",
        edits: [[checker, "moved away", "x"]],
        test: testFile,
        expect: "x",
      }),
    ],
  });
  assert.equal(zero.outcomes[0]?.verdict, "not-applied");
  assert.match(zero.outcomes[0]?.detail ?? "", /matched nothing/);

  const many = runMutations({
    cwd,
    cases: [
      kase({
        name: "ambiguous",
        edits: [[checker, "out.push", "x"]],
        test: testFile,
        expect: "x",
      }),
    ],
  });
  assert.equal(many.outcomes[0]?.verdict, "not-applied");
  assert.match(many.outcomes[0]?.detail ?? "", /matched 2 times/);
});

test("a test file that does not exist is REFUSED before any file is touched", () => {
  // The defect this API was extracted to make impossible: a runner that exits 0 on a path matching
  // nothing turns every case naming it into a silent SURVIVED.
  const { cwd, checker } = fixture();
  const before = readFileSync(checker, "utf8");
  assert.throws(
    () =>
      runMutations({
        cwd,
        cases: [
          kase({
            edits: [[checker, "rec.year !== 2026", "false"]],
            test: join(cwd, "gone.mjs"),
            expect: "x",
          }),
        ],
      }),
    /test file\(s\) do not exist/,
  );
  assert.equal(
    readFileSync(checker, "utf8"),
    before,
    "a refused run must not have touched anything",
  );
});

test("an empty case list throws rather than reporting success", () => {
  const { cwd } = fixture();
  assert.throws(() => runMutations({ cwd, cases: [] }), /no cases/);
});

test("a test that was ALREADY red judges nothing, and is excluded from the restore check", () => {
  // A test can be red on purpose — an open finding it exists to report. Counting it made a real
  // runner announce "the restore failed" about a working restore on every single run.
  const { cwd, checker, testFile } = fixture();
  writeFileSync(
    testFile,
    "import assert from 'node:assert/strict';\nassert.fail('an open finding');\n",
  );
  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "against-a-red-test",
        edits: [[checker, "rec.year !== 2026", "false"]],
        test: testFile,
        expect: "the year rule is not watched",
      }),
    ],
  });
  assert.equal(r.outcomes[0]?.verdict, "unjudgeable");
  assert.deepEqual(r.alreadyRed, [testFile]);
  assert.equal(
    r.restored,
    true,
    "a test that was red before must not be read as a failed restore",
  );
});

test("multi-file cases: every edit lands, and all of them are restored", () => {
  const { cwd, checker, testFile } = fixture();
  const second = join(cwd, "src", "other.mjs");
  writeFileSync(second, "export const GUARD = true;\n");
  const beforeChecker = readFileSync(checker, "utf8");

  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "both",
        edits: [
          [checker, "rec.year !== 2026", "false"],
          [second, "export const GUARD = true;", "export const GUARD = false;"],
        ],
        test: testFile,
        expect: "the year rule is not watched",
      }),
    ],
  });
  assert.equal(r.outcomes[0]?.verdict, "killed");
  assert.equal(readFileSync(checker, "utf8"), beforeChecker);
  assert.equal(readFileSync(second, "utf8"), "export const GUARD = true;\n");
});

test("formatMutationReport names every non-kill and states the restore in words", () => {
  const { cwd, checker, testFile } = fixture();
  const r = runMutations({
    cwd,
    cases: [
      kase({
        name: "kills",
        edits: [[checker, "rec.year !== 2026", "false"]],
        test: testFile,
        expect: "the year rule is not watched",
      }),
      kase({
        name: "noop",
        edits: [[checker, "rec.title !== 'ok'", "rec.title !== 'ok'"]],
        test: testFile,
        expect: "x",
      }),
    ],
  });
  const text = formatMutationReport(r);
  assert.match(text, /kills.*✓ killed/);
  assert.match(text, /noop.*not applied/s);
  assert.match(text, /1 of 2 not killed as named: noop/);
  assert.match(text, /restored: every test that was green/);
});
