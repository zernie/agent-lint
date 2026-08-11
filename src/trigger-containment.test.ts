/**
 * `compareContainment` — the four buckets, and the two ways a naive version lies.
 *
 * Pure: synthesized reports, no model, no filesystem.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  compareContainment,
  formatContainment,
} from "./trigger-containment.js";

const rep = (subject: string, pairs: [string, number][]) => [
  { subject, perPrompt: pairs.map(([prompt, rate]) => ({ prompt, rate })) },
];

test("classifies every prompt into exactly one bucket", () => {
  const weak = rep("foo", [
    ["a", 1],
    ["b", 1],
    ["c", 0],
    ["d", 0],
  ]);
  const strong = rep("foo", [
    ["a", 1],
    ["b", 0],
    ["c", 1],
    ["d", 0],
  ]);
  const v = compareContainment(weak, strong);
  assert.equal(v.compared, 4);
  assert.deepEqual(v.both, ["foo: a"]);
  assert.deepEqual(v.weakOnly, ["foo: b"]); // the counterexample
  assert.deepEqual(v.strongOnly, ["foo: c"]); // expected, not a failure
  assert.deepEqual(v.neither, ["foo: d"]);
  assert.equal(v.holds, false);
});

test("containment HOLDS when the weak model never fires alone", () => {
  const weak = rep("foo", [
    ["a", 1],
    ["b", 0],
  ]);
  const strong = rep("foo", [
    ["a", 1],
    ["b", 1],
  ]);
  const v = compareContainment(weak, strong);
  assert.equal(v.holds, true);
  assert.deepEqual(v.weakOnly, []);
  // The strong-only prompt must NOT count against containment — it is the weak
  // model under-selecting, which is the documented reason for the model floor.
  assert.deepEqual(v.strongOnly, ["foo: b"]);
});

test("compares only prompts the two runs SHARE", () => {
  // A partial re-run must not silently count missing prompts as not-fired, which
  // would manufacture `strongOnly` entries out of absence.
  const weak = rep("foo", [["a", 1]]);
  const strong = rep("foo", [
    ["a", 1],
    ["b", 1],
  ]);
  const v = compareContainment(weak, strong);
  assert.equal(v.compared, 1);
  assert.deepEqual(v.strongOnly, []);
});

test("a prompt containing spaces and punctuation survives keying", () => {
  // The key is subject + prompt; splitting it on a space would cut inside the
  // sentence. Every real prompt is a sentence, so this is the normal case.
  const p = "оцени как написано — читается как стена жаргона";
  const v = compareContainment(rep("grade", [[p, 1]]), rep("grade", [[p, 0]]));
  assert.deepEqual(v.weakOnly, [`grade: ${p}`]);
  assert.match(formatContainment(v), /стена жаргона/);
});

test("same prompt text under DIFFERENT subjects is not conflated", () => {
  const p = "проверь это";
  const weak = [...rep("a", [[p, 1]]), ...rep("b", [[p, 0]])];
  const strong = [...rep("a", [[p, 0]]), ...rep("b", [[p, 0]])];
  const v = compareContainment(weak, strong);
  assert.equal(v.compared, 2);
  assert.deepEqual(v.weakOnly, ["a: проверь это"]);
});

test("no shared prompts is reported as such, not as a passing verdict", () => {
  const v = compareContainment(rep("a", [["x", 1]]), rep("b", [["y", 1]]));
  assert.equal(v.compared, 0);
  // `holds` is vacuously true with nothing compared — the formatter must not let
  // that read as a result.
  assert.match(formatContainment(v), /no prompts in common/);
});
