import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { extractDocRefs, findDocRefs } from "./doc-refs.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

describe("extractDocRefs()", () => {
  it("extracts enforce/file/cmd/ref calls from ts code blocks", () => {
    const md = [
      "# Doc",
      "",
      "```ts",
      'enforce("eslint/no-console", "...")',
      'file("src/foo.ts")',
      'cmd("npm test")',
      'ref("docs/foo.md")',
      "```",
    ].join("\n");

    const result = extractDocRefs(md, "doc.md");
    assert.equal(result.refs.length, 4);
    assert.equal(result.refs[0].kind, "enforce");
    assert.equal(result.refs[0].value, "eslint/no-console");
    assert.equal(result.refs[0].line, 4);
    assert.equal(result.refs[1].kind, "file");
    assert.equal(result.refs[2].kind, "cmd");
    assert.equal(result.refs[3].kind, "ref");
  });

  it("scans typescript/javascript/js fences but not bash/json/text", () => {
    const md = [
      "```typescript",
      'enforce("eslint/a", "x")',
      "```",
      "",
      "```js",
      'enforce("eslint/b", "x")',
      "```",
      "",
      "```javascript",
      'enforce("eslint/c", "x")',
      "```",
      "",
      "```bash",
      'enforce("eslint/skipped", "x")',
      "```",
      "",
      "```json",
      'enforce("eslint/skipped-json", "x")',
      "```",
      "",
      "```",
      'enforce("eslint/skipped-plain", "x")',
      "```",
    ].join("\n");

    const result = extractDocRefs(md, "doc.md");
    const values = result.refs.map((r) => r.value);
    assert.deepEqual(values.sort(), ["eslint/a", "eslint/b", "eslint/c"]);
  });

  it("respects <!-- vigiles:ignore --> on the line before a block", () => {
    const md = [
      '<!-- vigiles:ignore -->',
      "```ts",
      'enforce("eslint/no-consolee", "demo typo")',
      "```",
      "",
      "```ts",
      'enforce("eslint/no-console", "real ref")',
      "```",
    ].join("\n");

    const result = extractDocRefs(md, "doc.md");
    assert.equal(result.blocksIgnored, 1);
    assert.equal(result.refs.length, 1);
    assert.equal(result.refs[0].value, "eslint/no-console");
  });

  it("only ignores the next block (subsequent blocks still scanned)", () => {
    const md = [
      '<!-- vigiles:ignore -->',
      "```ts",
      'enforce("ignored/a", "x")',
      "```",
      "",
      "```ts",
      'enforce("not-ignored/b", "x")',
      "```",
      "",
      "```ts",
      'enforce("not-ignored/c", "x")',
      "```",
    ].join("\n");

    const result = extractDocRefs(md, "doc.md");
    assert.equal(result.blocksIgnored, 1);
    assert.equal(result.refs.length, 2);
  });

  it("does not ignore blocks for unrelated comments", () => {
    const md = [
      "<!-- some unrelated comment -->",
      "```ts",
      'enforce("eslint/no-console", "...")',
      "```",
    ].join("\n");

    const result = extractDocRefs(md, "doc.md");
    assert.equal(result.refs.length, 1);
    assert.equal(result.blocksIgnored, 0);
  });

  it("supports tilde-fenced blocks", () => {
    const md = [
      "~~~typescript",
      'enforce("eslint/no-console", "...")',
      "~~~",
    ].join("\n");

    const result = extractDocRefs(md, "doc.md");
    assert.equal(result.refs.length, 1);
  });
});

describe("findDocRefs() — placeholder + unverifiable handling", () => {
  it("skips refs containing < or > as placeholders", () => {
    const dir = makeTmpDir("doc-refs-placeholder");
    try {
      writeFileSync(
        join(dir, "doc.md"),
        [
          "```ts",
          'enforce("<linter>/<rule-name>", "template")',
          'enforce("eslint/no-console", "real")',
          "```",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "t", devDependencies: { eslint: "*" } }),
      );

      const report = findDocRefs({ basePath: dir });
      assert.equal(report.refs.length, 2);
      assert.equal(report.placeholders, 1);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("counts unverifiable refs (tool unavailable) separately from errors", () => {
    const dir = makeTmpDir("doc-refs-unverified");
    try {
      writeFileSync(
        join(dir, "doc.md"),
        [
          "```ts",
          'enforce("dafny:ESDK/encrypt.dfy#proof", "speculative")',
          "```",
        ].join("\n"),
      );

      const report = findDocRefs({ basePath: dir });
      assert.equal(report.refs.length, 1);
      assert.equal(report.errors.length, 0);
      assert.equal(report.unverified, 1);
    } finally {
      cleanupTmpDir(dir);
    }
  });
});

describe("findDocRefs()", () => {
  it("validates refs across all .md files in a project", () => {
    const dir = makeTmpDir("doc-refs");
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ scripts: { test: "node --test" } }),
      );
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src/foo.ts"), "");
      writeFileSync(
        join(dir, "README.md"),
        [
          "```ts",
          'file("src/foo.ts")',
          'file("src/missing.ts")',
          'cmd("npm test")',
          'cmd("npm run missing-script")',
          "```",
        ].join("\n"),
      );

      const report = findDocRefs({ basePath: dir });
      assert.equal(report.refs.length, 4);
      assert.equal(report.errors.length, 2);
      const errValues = report.errors.map((e) => e.value).sort();
      assert.deepEqual(errValues, ["npm run missing-script", "src/missing.ts"]);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("honors <!-- vigiles:ignore-file --> for entire files", () => {
    const dir = makeTmpDir("doc-refs-file-ignore");
    try {
      writeFileSync(
        join(dir, "speculative.md"),
        [
          "<!-- vigiles:ignore-file -->",
          "",
          "```ts",
          'enforce("hypothetical/foo", "...")',
          'file("nonexistent.ts")',
          "```",
        ].join("\n"),
      );

      const report = findDocRefs({ basePath: dir });
      assert.equal(report.filesIgnored, 1);
      assert.equal(report.refs.length, 0);
      assert.equal(report.errors.length, 0);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("ignores node_modules, dist, and .vigiles", () => {
    const dir = makeTmpDir("doc-refs-noise");
    try {
      mkdirSync(join(dir, "node_modules"), { recursive: true });
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(
        join(dir, "node_modules/README.md"),
        '```ts\nfile("nonexistent.ts")\n```',
      );
      writeFileSync(
        join(dir, "dist/README.md"),
        '```ts\nfile("nonexistent.ts")\n```',
      );
      writeFileSync(join(dir, "README.md"), "no code blocks here");

      const report = findDocRefs({ basePath: dir });
      assert.equal(report.filesScanned, 1);
      assert.equal(report.refs.length, 0);
    } finally {
      cleanupTmpDir(dir);
    }
  });
});
