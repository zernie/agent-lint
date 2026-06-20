import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scaffoldTest,
  formatScaffolds,
  type ScaffoldInput,
} from "./scaffold-test.js";

/** Assert generated content is syntactically valid JS (node --check, parse only). */
function assertValidJs(content: string): void {
  const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
  try {
    const file = join(dir, "gen.mjs");
    writeFileSync(file, content);
    // Throws (non-zero exit) on a syntax error; resolves imports lazily, so the
    // unresolvable `vigiles/*` specifiers don't matter for a parse-only check.
    execFileSync("node", ["--check", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("scaffoldTest — hook (unit tier)", () => {
  const input: ScaffoldInput = {
    kind: "hook",
    name: "pre-edit",
    path: "hooks/pre-edit.sh",
    hookCommand: "bash hooks/pre-edit.sh",
  };

  it("emits a .harness.mjs at the colocated path, unit tier", () => {
    const s = scaffoldTest(input);
    expect(s.path).toBe("hooks/pre-edit.harness.mjs");
    expect(s.tier).toBe("unit");
    expect(s.kind).toBe("hook");
  });

  it("wires runHook from vigiles/unit + the hook command", () => {
    const { content } = scaffoldTest(input);
    expect(content).toContain('from "vigiles/unit"');
    expect(content).toContain("runHook(");
    expect(content).toContain('"bash hooks/pre-edit.sh"');
    expect(content).toContain("assertHookAllowed");
  });

  it("defaults the command to `bash <path>` when none is given", () => {
    const { content } = scaffoldTest({ ...input, hookCommand: undefined });
    expect(content).toContain('"bash hooks/pre-edit.sh"');
  });

  it("produces syntactically valid JS", () => {
    assertValidJs(scaffoldTest(input).content);
  });
});

describe("scaffoldTest — skill (eval tier)", () => {
  const input: ScaffoldInput = {
    kind: "skill",
    name: "strengthen",
    path: "skills/strengthen/SKILL.md",
    pluginName: "vigiles",
  };

  it("emits an .eval.mjs at the colocated path, eval tier", () => {
    const s = scaffoldTest(input);
    expect(s.path).toBe("skills/strengthen/strengthen.eval.mjs");
    expect(s.tier).toBe("eval");
  });

  it("wires measureTriggerRate + the namespaced id + the precision gate", () => {
    const { content } = scaffoldTest(input);
    expect(content).toContain('from "vigiles/testing"');
    expect(content).toContain("measureTriggerRate(");
    expect(content).toContain('"vigiles:strengthen"');
    expect(content).toContain("irrelevantPrompts");
    expect(content).toContain("assertTriggerRate(report, { min: 0.8");
  });

  it("falls back to a <plugin> placeholder when the plugin name is unknown", () => {
    const { content } = scaffoldTest({ ...input, pluginName: undefined });
    expect(content).toContain('"<plugin>:strengthen"');
  });

  it("notes the caveat for a user-invoked skill", () => {
    const plain = scaffoldTest(input).content;
    const userInvoked = scaffoldTest({ ...input, userInvoked: true }).content;
    expect(plain).not.toContain("user-invoked");
    expect(userInvoked).toContain("user-invoked");
  });

  it("produces syntactically valid JS", () => {
    assertValidJs(scaffoldTest(input).content);
    assertValidJs(scaffoldTest({ ...input, userInvoked: true }).content);
  });
});

describe("scaffoldTest — agent (harness tier)", () => {
  const input: ScaffoldInput = {
    kind: "agent",
    name: "reviewer",
    path: "agents/reviewer.md",
    tools: ["Read", "Grep"],
  };

  it("emits a .harness.mjs, harness tier", () => {
    const s = scaffoldTest(input);
    expect(s.path).toBe("agents/reviewer.harness.mjs");
    expect(s.tier).toBe("harness");
  });

  it("asserts the declared tool contract when tools are known", () => {
    const { content } = scaffoldTest(input);
    expect(content).toContain("runHarnessTest(");
    expect(content).toContain('assertToolUsed(r, "Read")');
    expect(content).toContain("Read, Grep");
  });

  it("falls back to asserting Task dispatch when tools are absent", () => {
    const { content } = scaffoldTest({ ...input, tools: null });
    expect(content).toContain('assertToolUsed(r, "Task")');
  });

  it("produces syntactically valid JS", () => {
    assertValidJs(scaffoldTest(input).content);
    assertValidJs(scaffoldTest({ ...input, tools: null }).content);
  });
});

describe("formatScaffolds", () => {
  it("reports the empty case honestly", () => {
    expect(formatScaffolds([])).toContain("Nothing to scaffold");
  });

  it("lists each path with its kind + tier", () => {
    const out = formatScaffolds([
      scaffoldTest({ kind: "hook", name: "h", path: "hooks/h.sh" }),
      scaffoldTest({ kind: "skill", name: "s", path: "skills/s/SKILL.md" }),
    ]);
    expect(out).toContain("hooks/h.harness.mjs");
    expect(out).toContain("skills/s/s.eval.mjs");
    expect(out).toContain("hook → unit");
    expect(out).toContain("skill → eval");
  });
});
