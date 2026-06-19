/**
 * Lenient frontmatter-reader suite (vitest). Asserts the "real parser, regex
 * safety net" contract: valid YAML parses correctly (block scalars, quoted
 * multi-line, flow arrays), malformed YAML sets `malformed` AND still salvages
 * the requested field, and the list semantics the PreToolUse rail depends on
 * (absent → null, empty → []) hold.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  readFrontmatter,
  frontmatterScalar,
  frontmatterList,
} from "./frontmatter-read.js";

test("valid YAML parses; scalars and a flow array read back", () => {
  const fm = readFrontmatter(
    '---\nname: a\ndescription: does things\ntools: [Read, "Bash"]\n---\nbody\n',
  );
  assert.equal(fm.malformed, false);
  assert.equal(frontmatterScalar(fm, "name"), "a");
  assert.equal(frontmatterScalar(fm, "description"), "does things");
  assert.deepEqual(frontmatterList(fm, "tools"), ["Read", "Bash"]);
});

test("a comma-list tool value splits", () => {
  const fm = readFrontmatter("---\nname: a\ntools: Read, Grep, Bash\n---\n");
  assert.deepEqual(frontmatterList(fm, "tools"), ["Read", "Grep", "Bash"]);
});

test("absent list key → null (inherits all); present-but-empty → [] (no tools)", () => {
  const none = readFrontmatter("---\nname: a\n---\n");
  assert.equal(frontmatterList(none, "tools"), null);
  const empty = readFrontmatter("---\nname: a\ntools:\n---\n");
  assert.deepEqual(frontmatterList(empty, "tools"), []);
});

test("a block scalar (>) and a next-line quoted scalar both read", () => {
  const folded = readFrontmatter(
    "---\nname: a\ndescription: >\n  a folded multi-line\n  description here\n---\n",
  );
  assert.match(
    frontmatterScalar(folded, "description") ?? "",
    /folded multi-line/,
  );
  const quoted = readFrontmatter(
    '---\nname: a\ndescription:\n  "value on the next line"\n---\n',
  );
  assert.equal(
    frontmatterScalar(quoted, "description"),
    "value on the next line",
  );
});

test("malformed YAML → malformed:true AND still salvages a column-0 field", () => {
  // An unescaped colon-space mid-value is invalid YAML ("mapping values not
  // allowed"), but the fields are still recoverable by the regex salvage.
  const fm = readFrontmatter(
    "---\nname: a\ndescription: Use the foo: bar tool\n---\n",
  );
  assert.equal(fm.malformed, true);
  assert.equal(frontmatterScalar(fm, "name"), "a");
  assert.equal(frontmatterScalar(fm, "description"), "Use the foo: bar tool");
});

test("a leading vigiles integrity comment before --- is tolerated", () => {
  const fm = readFrontmatter(
    "<!-- vigiles:sha256:abc compiled from x.spec.ts -->\n\n---\nname: a\n---\nbody\n",
  );
  assert.equal(frontmatterScalar(fm, "name"), "a");
});

test("a body --- horizontal rule is NOT read as frontmatter", () => {
  const fm = readFrontmatter("# Title\n\nsome text\n\n---\n\nmore\n\n---\n");
  assert.equal(fm.block, null);
  assert.equal(fm.malformed, false);
});

test("no frontmatter block at all", () => {
  const fm = readFrontmatter("# just a heading\n\nbody\n");
  assert.deepEqual(fm, { data: null, block: null, malformed: false });
});
