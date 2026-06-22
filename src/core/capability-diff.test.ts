/**
 * Capability-diff test suite (vitest): pure over two hand-built capability
 * lattices (no fs/model). Asserts the widened verdict fires only on a new
 * side-effecting/unknown tool or a loosened purity — never on a benign read-only
 * add or a narrowing — and that the report leads with the verdict.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  diffCapabilities,
  isNoOpDiff,
  formatCapabilityDiff,
} from "./capability-diff.js";
import type { HarnessCapabilities } from "./generate-harness.js";

const cap = (over: Partial<HarnessCapabilities> = {}): HarnessCapabilities => ({
  readOnly: [],
  sideEffecting: [],
  unknown: [],
  purity: "pure",
  ...over,
});

test("a new side-effecting tool WIDENS the blast radius", () => {
  const d = diffCapabilities(
    cap({ readOnly: ["Read"] }),
    cap({ readOnly: ["Read"], sideEffecting: ["Bash"], purity: "bounded" }),
  );
  assert.equal(d.widened, true);
  assert.deepEqual(d.addedSideEffecting, ["Bash"]);
  assert.equal(d.purity?.direction, "widened");
  assert.match(formatCapabilityDiff(d), /WIDENED/);
  assert.match(formatCapabilityDiff(d), /side-effecting: Bash/);
});

test("a new unknown/MCP tool WIDENS the blast radius", () => {
  const d = diffCapabilities(cap(), cap({ unknown: ["mcp__db__query"] }));
  assert.equal(d.widened, true);
  assert.deepEqual(d.addedUnknown, ["mcp__db__query"]);
});

test("a new read-only tool is benign — reported but NOT a widening", () => {
  const d = diffCapabilities(cap(), cap({ readOnly: ["Grep"] }));
  assert.equal(d.widened, false);
  assert.deepEqual(d.addedReadOnly, ["Grep"]);
  assert.match(formatCapabilityDiff(d), /no widening/);
  assert.match(formatCapabilityDiff(d), /read-only added \(benign\): Grep/);
});

test("removing a tool NARROWS — reported, not a widening", () => {
  const d = diffCapabilities(
    cap({ sideEffecting: ["Bash", "Write"], purity: "bounded" }),
    cap({ sideEffecting: ["Bash"], purity: "bounded" }),
  );
  assert.equal(d.widened, false);
  assert.deepEqual(d.removed, ["Write"]);
  assert.match(formatCapabilityDiff(d), /narrowed \(removed\): Write/);
});

test("purity tightening alone is a narrowing, not a widening", () => {
  const d = diffCapabilities(
    cap({ purity: "unrestricted" }),
    cap({ purity: "bounded" }),
  );
  assert.equal(d.widened, false);
  assert.equal(d.purity?.direction, "narrowed");
  assert.match(
    formatCapabilityDiff(d),
    /purity tightened: unrestricted → bounded/,
  );
});

test("an identical lattice is a no-op", () => {
  const before = cap({
    readOnly: ["Read"],
    sideEffecting: ["Bash"],
    purity: "bounded",
  });
  const d = diffCapabilities(
    before,
    cap({ readOnly: ["Read"], sideEffecting: ["Bash"], purity: "bounded" }),
  );
  assert.equal(isNoOpDiff(d), true);
  assert.equal(d.widened, false);
  assert.match(formatCapabilityDiff(d), /unchanged/);
});
