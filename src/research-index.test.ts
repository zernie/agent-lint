/**
 * Research-index completeness — unit tests for the detector PLUS the repo
 * DOGFOOD: every `research/*.md` (except `README.md`) is indexed in
 * `research/CLAUDE.md.spec.ts`. With the compiler already verifying the reverse
 * (each indexed path exists), this closes the loop — a doc added without an
 * index entry fails CI here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  unindexedResearchDocs,
  deadIndexEntries,
  INDEX_EXEMPT,
} from "./research-index.js";

describe("unindexedResearchDocs", () => {
  it("flags a doc not referenced in the index", () => {
    const index = `"research/a.md": "...", "research/b.md": "..."`;
    expect(unindexedResearchDocs(["a.md", "b.md", "c.md"], index)).toEqual([
      "c.md",
    ]);
  });

  it("treats a doc as indexed when its research/ path appears", () => {
    const index = `"research/roadmap.md": "the front door"`;
    expect(unindexedResearchDocs(["roadmap.md"], index)).toEqual([]);
  });

  it("exempts README.md by default", () => {
    expect(unindexedResearchDocs(["README.md"], "")).toEqual([]);
    expect(INDEX_EXEMPT).toContain("README.md");
  });
});

describe("deadIndexEntries", () => {
  it("flags an indexed path that no longer exists on disk", () => {
    const index = `"research/gone.md": "x", "research/here.md": "y"`;
    expect(deadIndexEntries(["here.md"], index)).toEqual(["gone.md"]);
  });

  it("is quiet when every indexed path exists", () => {
    const index = `"research/here.md": "y"`;
    expect(deadIndexEntries(["here.md"], index)).toEqual([]);
  });
});

// --- The repo dogfood -------------------------------------------------------

const ROOT = resolve(__dirname, "..");

function researchDocs(): string[] {
  return readdirSync(join(ROOT, "research"))
    .filter((n) => n.endsWith(".md"))
    .sort();
}

const INDEX_SPEC = "research/CLAUDE.md.spec.ts";

describe("repo dogfood: the research index is complete", () => {
  const index = readFileSync(join(ROOT, INDEX_SPEC), "utf-8");

  it("indexes every research/*.md (add a doc → add its line)", () => {
    const missing = unindexedResearchDocs(researchDocs(), index);
    expect(
      missing,
      `research docs missing from ${INDEX_SPEC}: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("has no index entry pointing at a deleted doc", () => {
    const dead = deadIndexEntries(researchDocs(), index);
    expect(
      dead,
      `stale index entries in ${INDEX_SPEC}: ${dead.join(", ")}`,
    ).toEqual([]);
  });
});
