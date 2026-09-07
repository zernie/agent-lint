/**
 * Plugin-guard sweep suite (vitest, unit tier — nothing but `echo`/`exit` is ever
 * spawned, no model, no key).
 *
 * The load-bearing half is a fixture plugin carrying the three shapes the report
 * has to tell apart, and it is written so a single mistaken verdict is visible:
 * a CONDITIONAL guard reachable by only part of the battery, an UNCONDITIONAL one
 * that blocks all of it, and hooks the battery cannot reach at all — by event, by
 * matcher, and by an unresolvable command. All three of the last kind must read
 * as their own status, never as a score of zero.
 *
 * Beside it, the REAL vendored davila7 guard (the artifact #211 was measured on)
 * proves the condition is read off the CONFIG rather than passed by the caller —
 * the whole point of this function existing next to `verifyGuardrail`.
 *
 * BOTH HARNESSES: the same sweep runs over a Codex-shaped repo (flat TOML hooks,
 * `${PLUGIN_ROOT}`), which is what could catch a Claude-Code assumption baked into
 * the agnostic path — a CC-shaped fixture structurally cannot. And a harness with
 * no shell hooks (the opencode prototype) is asserted to report n/a in words.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { experimental_verifyPluginGuards } from "./verify-plugin-guards.js";
import { DISASTER_CATALOG } from "./guardrail-check.js";
import { hookMatcherSelects } from "./core/hook-matcher.js";
import { codexAdapter } from "./adapters/codex/adapter.js";
import { opencodeAdapter } from "./adapters/opencode/adapter.js";

/** Denies every call it is spawned for — the unconditional-guard shape. */
const DENY_ALL = `echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny"}}'`;
/** Runs and allows — an ordinary observing hook, not a guard. */
const ALLOW_ALL = `echo watching`;

const VENDOR = join(
  __dirname,
  "..",
  "test",
  "dogfood",
  "davila7-force-push-blocker@869640b",
);

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "vigiles-sweep-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              // (a) conditional — only the force pushes ever reach it.
              {
                type: "command",
                if: "Bash(git push *--force*)",
                command: DENY_ALL,
              },
              // (b) unconditional — blocks the whole battery.
              { type: "command", command: DENY_ALL },
              // (c3) irrelevant by an UNSET variable in the command.
              { type: "command", command: '"$SOME_UNSET_GUARD_HOME"/guard.sh' },
            ],
          },
          // (c2) irrelevant by matcher — a file-tool guard, not a Bash one.
          {
            matcher: "Edit|Write",
            hooks: [{ type: "command", command: ALLOW_ALL }],
          },
        ],
        // (c1) irrelevant by event.
        Stop: [{ hooks: [{ type: "command", command: ALLOW_ALL }] }],
      },
    }),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The outcomes, in config order — the order the report promises. */
const sweep = () => experimental_verifyPluginGuards(dir).hooks;

describe("experimental_verifyPluginGuards — the per-hook verdicts differ", () => {
  it("reads four hooks in config order and gives each its own status", () => {
    const hooks = sweep();
    expect(hooks.map((h) => h.status)).toEqual([
      "measured",
      "measured",
      "unresolved",
      "not-applicable",
      "not-applicable",
    ]);
    // The index is what tells two hooks sharing a command apart.
    expect(hooks.map((h) => h.hook.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("the CONDITIONAL guard blocks only what its `if` lets through", () => {
    const [conditional] = sweep();
    if (conditional?.status !== "measured") throw new Error("not measured");
    expect(conditional.blocked).toEqual(["force-push"]);
    expect(conditional.allowed).toEqual([]);
    expect(conditional.notRun).toHaveLength(DISASTER_CATALOG.length - 1);
    // Every entry is still present — a hook reporting 1/1 would be the lie.
    expect(conditional.results).toHaveLength(DISASTER_CATALOG.length);
    for (const r of conditional.results.filter((x) => !x.ran))
      expect(r.reason).toContain("does not match");
  });

  it("the UNCONDITIONAL guard blocks the whole battery", () => {
    const unconditional = sweep()[1];
    if (unconditional?.status !== "measured") throw new Error("not measured");
    expect(unconditional.blocked).toHaveLength(DISASTER_CATALOG.length);
    expect(unconditional.notRun).toEqual([]);
    expect(unconditional.hook.condition).toBeNull();
  });

  it("an UNSET variable is `unresolved`, and the reason names the variable", () => {
    const unresolved = sweep()[2];
    if (unresolved?.status !== "unresolved") throw new Error("not unresolved");
    expect(unresolved.reason).toContain("$SOME_UNSET_GUARD_HOME");
    // The fix is in the caller's hands, and the message says so.
    expect(unresolved.reason).toContain("env");
  });

  it("a MATCHER that selects no battery tool is n/a, not a zero score", () => {
    const byMatcher = sweep()[3];
    if (byMatcher?.status !== "not-applicable")
      throw new Error("not n/a by matcher");
    expect(byMatcher.hook.matcher).toBe("Edit|Write");
    expect(byMatcher.reason).toContain("Bash");
    expect(byMatcher.reason).toContain("never spawns");
  });

  it("a hook on ANOTHER EVENT is n/a, and the reason names both events", () => {
    const byEvent = sweep()[4];
    if (byEvent?.status !== "not-applicable")
      throw new Error("not n/a by event");
    expect(byEvent.reason).toContain("Stop");
    expect(byEvent.reason).toContain("PreToolUse");
  });

  it("says nothing in `notes` when something WAS measured", () => {
    // The empty case has a voice (below); the measured case must not, or the
    // note stops meaning anything.
    expect(experimental_verifyPluginGuards(dir).notes).toEqual([]);
  });

  it("carries the battery + delivery event it measured against", () => {
    const report = experimental_verifyPluginGuards(dir, {
      categories: ["destructive-git"],
    });
    expect(report.event).toBe("PreToolUse");
    expect(report.events.map((e) => e.id)).toEqual([
      "force-push",
      "force-push-compound",
      "reset-hard",
    ]);
    const unconditional = report.hooks[1];
    if (unconditional?.status !== "measured") throw new Error("not measured");
    expect(unconditional.blocked).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// The honest empty cases. None of these may read as "safe" or "blocks nothing".
// ---------------------------------------------------------------------------

describe("the empty cases speak", () => {
  it("a plugin with NO hooks says so, in words", () => {
    const empty = mkdtempSync(join(tmpdir(), "vigiles-sweep-empty-"));
    writeFileSync(join(empty, "CLAUDE.md"), "# nothing here\n");
    try {
      const report = experimental_verifyPluginGuards(empty);
      expect(report.hooks).toEqual([]);
      expect(report.notes.join(" ")).toContain("not a clean bill of health");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("hooks that exist but none reachable says THAT instead", () => {
    const stopOnly = mkdtempSync(join(tmpdir(), "vigiles-sweep-stop-"));
    mkdirSync(join(stopOnly, ".claude"), { recursive: true });
    writeFileSync(
      join(stopOnly, ".claude", "settings.json"),
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ command: ALLOW_ALL }] }] },
      }),
    );
    try {
      const report = experimental_verifyPluginGuards(stopOnly);
      expect(report.hooks).toHaveLength(1);
      expect(report.notes.join(" ")).toContain("none of them reachable");
      expect(report.notes.join(" ")).toContain("rather than the (empty) score");
    } finally {
      rmSync(stopOnly, { recursive: true, force: true });
    }
  });

  it("a harness with no shell hooks reports n/a, never an empty success", () => {
    // opencode's hooks are in-process TS modules; the battery cannot drive them.
    const report = experimental_verifyPluginGuards(dir, {
      adapter: opencodeAdapter,
    });
    expect(report.harness).toBe("opencode");
    expect(report.hooks).toEqual([]);
    expect(report.notes.join(" ")).toContain("n/a");
    expect(report.notes.join(" ")).toContain("Nothing was measured");
  });
});

// ---------------------------------------------------------------------------
// The REAL vendored guard — the artifact #211 was measured on.
// ---------------------------------------------------------------------------

describe("davila7 force-push-blocker (vendored, MIT) — read from the config", () => {
  it("honours EACH hook's own `if` without the caller passing one", () => {
    // This is the whole difference from verifyGuardrail: the caller supplies a
    // DIRECTORY, and the two hooks get two different conditions because that is
    // what the file says. Passing one condition for both is unrepresentable here.
    const hooks = experimental_verifyPluginGuards(VENDOR).hooks;
    expect(hooks).toHaveLength(2);

    const [first, second] = hooks;
    if (first?.status !== "measured" || second?.status !== "measured")
      throw new Error("the vendored guard should be measured");

    expect(first.hook.condition).toBe("Bash(git push *--force*)");
    expect(first.blocked).toEqual(["force-push"]);

    expect(second.hook.condition).toBe("Bash(git push *-f*)");
    expect(second.blocked).toEqual(["force-push", "force-push-compound"]);

    // The 7/7 that #211 killed must not come back through this door.
    for (const h of [first, second])
      expect(h.blocked.length).toBeLessThan(DISASTER_CATALOG.length);
  });

  it("never reports a not-run event as allowed", () => {
    const [first] = experimental_verifyPluginGuards(VENDOR).hooks;
    if (first?.status !== "measured") throw new Error("not measured");
    // `rm -rf /` is neither blocked nor allowed by this guard — it is not seen.
    expect(first.allowed).toEqual([]);
    expect(first.notRun).toContain("rm-rf");
    expect(first.blocked).not.toContain("rm-rf");
  });
});

// ---------------------------------------------------------------------------
// Both harnesses. A CC-shaped fixture cannot catch a CC assumption.
// ---------------------------------------------------------------------------

describe("the sweep is harness-agnostic", () => {
  it("reads a Codex-shaped repo: flat TOML hooks + ${PLUGIN_ROOT}", () => {
    const codex = mkdtempSync(join(tmpdir(), "vigiles-sweep-codex-"));
    mkdirSync(join(codex, ".codex"), { recursive: true });
    writeFileSync(join(codex, "AGENTS.md"), "# codex repo\n");
    // Codex's flat shape: the entry IS the command holder, no nested `hooks`.
    writeFileSync(
      join(codex, ".codex", "config.toml"),
      [
        "[[hooks.PreToolUse]]",
        'matcher = "Bash"',
        `command = ${JSON.stringify(DENY_ALL)}`,
        "",
        "[[hooks.Stop]]",
        `command = ${JSON.stringify(ALLOW_ALL)}`,
        "",
      ].join("\n"),
    );
    try {
      const report = experimental_verifyPluginGuards(codex, {
        adapter: codexAdapter,
      });
      expect(report.harness).toBe("codex");
      expect(report.hooks.map((h) => h.status)).toEqual([
        "measured",
        "not-applicable",
      ]);
      const [gate] = report.hooks;
      if (gate?.status !== "measured") throw new Error("not measured");
      // Codex blocks by the same exit-2 / deny-decision protocol, so the whole
      // battery is denied — one run covers the neutral half deliberately.
      expect(gate.blocked).toHaveLength(DISASTER_CATALOG.length);
    } finally {
      rmSync(codex, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The matcher predicate it leans on — fail-open in exactly one direction.
// ---------------------------------------------------------------------------

describe("hookMatcherSelects", () => {
  it("compares a literal matcher by equality (the measured rule)", () => {
    expect(hookMatcherSelects("Bash", "Bash")).toBe(true);
    expect(hookMatcherSelects("Edit", "Bash")).toBe(false);
  });

  it("treats a metacharacter matcher as an unanchored regex", () => {
    expect(hookMatcherSelects("Edit|Write", "Write")).toBe(true);
    expect(hookMatcherSelects("Edit|Write", "Bash")).toBe(false);
    expect(hookMatcherSelects("Ba.h", "Bash")).toBe(true);
  });

  it("FAILS OPEN on everything uncertain", () => {
    // A wrong answer here may only ever say "ran and did not block", never
    // invent a skip — so absent / match-all / uncompilable all select.
    expect(hookMatcherSelects(null, "Bash")).toBe(true);
    for (const all of ["", "*", "**", ".*"])
      expect(hookMatcherSelects(all, "Bash")).toBe(true);
    expect(hookMatcherSelects("Bash(", "Bash")).toBe(true);
  });
});
