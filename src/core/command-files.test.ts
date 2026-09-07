/**
 * Command-file-reference suite (vitest, unit tier — nothing is spawned).
 *
 * Both directions, because either alone is worthless here: the detector must
 * NAME the script an interpreter runs (or the sweep keeps scoring hooks that
 * cannot start), and must stay SILENT on the eight shapes measured in the wild
 * that merely look path-ish (or it accuses working hooks of being broken).
 */
import { describe, it, expect } from "vitest";
import { commandFileRefs } from "./command-files.js";

describe("commandFileRefs — names the script a command would run", () => {
  it("finds an interpreter's script, relative or absolute", () => {
    expect(commandFileRefs("python3 .claude/hooks/guard.py").refs).toEqual([
      ".claude/hooks/guard.py",
    ]);
    expect(commandFileRefs("bash /opt/hooks/plan-gate.sh").refs).toEqual([
      "/opt/hooks/plan-gate.sh",
    ]);
  });

  it("finds a script by EXTENSION even behind an unknown runner", () => {
    // The interpreter table is not load-bearing on its own: this is the half
    // that keeps a runtime nobody listed from becoming a silent miss.
    expect(commandFileRefs("some-exotic-runner hooks/guard.py").refs).toEqual([
      "hooks/guard.py",
    ]);
  });

  it("finds an interpreter's script with NO extension and no slash", () => {
    expect(commandFileRefs("python3 guard").refs).toEqual(["guard"]);
  });

  it("finds a head that is itself a path", () => {
    expect(commandFileRefs("./hooks/guard.sh --flag").refs).toEqual([
      "./hooks/guard.sh",
    ]);
  });

  it("expands only the variables whose value it was given", () => {
    expect(
      commandFileRefs('node "$ROOT"/scripts/run.cjs', { ROOT: "/plug" }).refs,
    ).toEqual(["/plug/scripts/run.cjs"]);
    // Unknown variable ⇒ the whole word is unresolved, and we invent nothing.
    expect(commandFileRefs('node "$ROOT"/scripts/run.cjs').refs).toEqual([]);
  });

  it("reaches a leaf nested in a pipeline or a compound", () => {
    expect(
      commandFileRefs("cat | python3 hooks/a.py && bash hooks/b.sh").refs,
    ).toEqual(["hooks/a.py", "hooks/b.sh"]);
  });

  it("reports a parse failure rather than pretending the command is clean", () => {
    const r = commandFileRefs("bash -c 'unterminated");
    expect(r.parsed).toBe(false);
    expect(r.refs).toEqual([]);
  });
});

describe("commandFileRefs — silent on everything that only looks path-ish", () => {
  // The eight shapes the WIDE rule got wrong across davila7's 107 real hook
  // registrations. Each is a working hook; flagging any of them is crying wolf.
  it.each([
    ["cat ~/.claude/session_start.tmp"],
    ["rm ~/.claude/bash_start.tmp"],
    ["mv ~/.claude/performance.csv ~/.claude/performance.csv.tmp"],
    ["tail -n 100 ~/.claude/performance.csv"],
    ["echo N/A"],
  ])("stays quiet on %s", (command) => {
    expect(commandFileRefs(command).refs).toEqual([]);
  });

  it("skips a URL, a flag and an env assignment", () => {
    expect(commandFileRefs("curl https://example.com/install.sh").refs).toEqual(
      [],
    );
    expect(commandFileRefs("python3 -m json.tool").refs).toEqual([]);
    expect(commandFileRefs("FOO=a/b.sh true").refs).toEqual([]);
  });

  it("skips the inline program text of -c / -e", () => {
    // Program text, not a path — the shell never looks for it on disk.
    expect(commandFileRefs("bash -c exit").refs).toEqual([]);
    expect(commandFileRefs("node -e process.exit").refs).toEqual([]);
    expect(commandFileRefs(`bash -c 'echo hi; exit 0'`).refs).toEqual([]);
  });

  it("stops at the interpreter's FIRST operand — the rest are its arguments", () => {
    // `production` is an argument to the script, not a second script. Reporting
    // it would accuse a working hook of naming a missing file.
    expect(
      commandFileRefs("bash hooks/deploy.sh production --yes").refs,
    ).toEqual(["hooks/deploy.sh"]);
    expect(commandFileRefs("python3 guard extra").refs).toEqual(["guard"]);
  });

  it("does not descend into a command substitution", () => {
    // `which` PRINTS where a program lives; it does not run it.
    expect(commandFileRefs("bash $(which guard.sh)").refs).toEqual([]);
  });

  it("skips a glob, a substitution and a BARE head", () => {
    expect(commandFileRefs("bash hooks/*.sh").refs).toEqual([]);
    expect(commandFileRefs("bash $(which guard.sh)").refs).toEqual([]);
    // A bare head may be a builtin or a function — `echo` has no file.
    expect(commandFileRefs("echo watching").refs).toEqual([]);
    expect(commandFileRefs("true").refs).toEqual([]);
  });
});
