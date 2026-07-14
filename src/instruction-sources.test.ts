import { describe, it, expect } from "vitest";
import { isFixturePath } from "./instruction-sources.js";

describe("isFixturePath", () => {
  it("keeps a repo's real subdirectory memory", () => {
    expect(isFixturePath("CLAUDE.md")).toBe(false);
    expect(isFixturePath("src/CLAUDE.md")).toBe(false);
    expect(isFixturePath("src/core/CLAUDE.md")).toBe(false);
    expect(isFixturePath("research/CLAUDE.md")).toBe(false);
    expect(isFixturePath("packages/app/AGENTS.md")).toBe(false);
  });

  it("skips build / deps / test dirs (exact segment match)", () => {
    expect(isFixturePath("node_modules/x/CLAUDE.md")).toBe(true);
    expect(isFixturePath("dist/CLAUDE.md")).toBe(true);
    expect(isFixturePath("coverage/CLAUDE.md")).toBe(true);
    expect(isFixturePath("test/dogfood/plugin/CLAUDE.md")).toBe(true);
    expect(isFixturePath("src/__tests__/CLAUDE.md")).toBe(true);
    expect(isFixturePath("vendor/lib/AGENTS.md")).toBe(true);
  });

  it("skips demo / example / sample / fixture / bench dirs (prefix match)", () => {
    expect(isFixturePath("examples/CLAUDE.md")).toBe(true);
    expect(isFixturePath("examples/harness/fixture-plugin/CLAUDE.md")).toBe(
      true,
    );
    expect(isFixturePath("fixtures/example-project/CLAUDE.md")).toBe(true);
    expect(isFixturePath("compiler/demo-project/CLAUDE.md")).toBe(true);
    expect(isFixturePath("bench/ecosystem/skills/x/CLAUDE.md")).toBe(true);
    expect(isFixturePath("mocks/server/CLAUDE.md")).toBe(true);
    expect(isFixturePath(".tmp-genh-1/CLAUDE.md")).toBe(true);
  });

  it("matches on a DIRECTORY segment only, never the filename", () => {
    // A file literally named for a fixture prefix at the root is NOT a fixture
    // path (only directory segments are inspected).
    expect(isFixturePath("example.md")).toBe(false);
    // A prefix must START the segment — a legit dir that merely CONTAINS the word
    // is kept ("documentation" contains no fixture prefix).
    expect(isFixturePath("documentation/CLAUDE.md")).toBe(false);
    expect(isFixturePath("src/utilities/CLAUDE.md")).toBe(false);
    // Precision tradeoff (documented): a dir that STARTS with a fixture prefix is
    // skipped even if it's legit — "benchmarking-notes" starts with "bench".
    expect(isFixturePath("src/benchmarking-notes/CLAUDE.md")).toBe(true);
  });

  it("handles a bare filename with no directory", () => {
    expect(isFixturePath("AGENTS.md")).toBe(false);
  });

  it("handles Windows-style separators", () => {
    expect(isFixturePath("test\\dogfood\\CLAUDE.md")).toBe(true);
    expect(isFixturePath("src\\core\\CLAUDE.md")).toBe(false);
  });
});
