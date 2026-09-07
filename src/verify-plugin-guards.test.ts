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
 *
 * The last block covers the RENDERER over the same fixtures. Its contract is
 * that the union's honesty survives being turned into text — so the load-bearing
 * assertion there is two-directional: a sweep that measured nothing must contain
 * NO score-shaped string and MUST contain the words saying nothing was measured.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  experimental_verifyPluginGuards,
  experimental_formatPluginGuardReport,
  type PluginGuardReport,
} from "./verify-plugin-guards.js";
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

// ---------------------------------------------------------------------------
// The RENDERER. Its whole contract is that the union's honesty survives being
// turned into text: a measured hook shows numbers, an unmeasured one shows a
// REASON and no number, and a sweep that measured nothing says so in words.
// A `0/7` printed beside a hook the battery never reached would reintroduce —
// one layer above the type system — the exact false confidence the union exists
// to make unrepresentable, so that is asserted directly.
// ---------------------------------------------------------------------------

/** Any `n/m` — what a score looks like, whatever the numbers are. */
const SCORE_SHAPED = /\d+\s*\/\s*\d+/;

/** The output with the swept path masked, so a tmpdir can't look like a score. */
const rendered = (report: PluginGuardReport): string =>
  experimental_formatPluginGuardReport(report).replaceAll(report.dir, "<dir>");

describe("experimental_formatPluginGuardReport", () => {
  it("renders the MIXED case: numbers for measured, reasons for the rest", () => {
    // The mixed report is where a formatter usually leaks a misleading total —
    // one number summed over hooks that were never asked the question.
    const out = rendered(experimental_verifyPluginGuards(dir));

    // The census is a census, not a score: no `n/m` on it.
    expect(out).toContain(
      "5 hooks declared: 2 measured, 1 unresolved, 2 not applicable.",
    );

    // Measured hooks carry their own count, and ONLY they do.
    expect(out).toContain("blocks 1/7");
    expect(out).toContain("blocks 7/7");
    expect(out.match(/blocks \d+\/\d+/g)).toHaveLength(2);

    // …and their rows are the same vocabulary formatGuardrailReport prints.
    expect(out).toContain("✅ blocks  git push --force to a protected branch");
    expect(out).toContain("⊘ not run  rm -rf of a broad path");

    // The unmeasured half names each hook and its reason, and never a count.
    expect(out).toContain("⊘ unresolved — 1 hook");
    expect(out).toContain("⊘ not applicable — 2 hooks");
    expect(out).toContain("$SOME_UNSET_GUARD_HOME");
    expect(out).toContain("registered on Stop");
    expect(out).toContain("selects none of the tools this battery calls");
  });

  it("gives each unmeasured hook its own index, so two are told apart", () => {
    const out = rendered(experimental_verifyPluginGuards(dir));
    // The fixture's two n/a hooks share nothing but their status; the index is
    // what a reader follows back to the config.
    expect(out).toContain("#3  `echo watching`");
    expect(out).toMatch(/#4\s+`echo watching`/);
  });

  it("names the selection facts the sweep actually read", () => {
    const out = rendered(experimental_verifyPluginGuards(dir));
    // The conditional guard's `if` is the whole reason its score is 1/7 — a
    // report showing the number without the condition invites the wrong reading.
    expect(out).toContain(
      "PreToolUse · matcher `Bash` · if `Bash(git push *--force*)`",
    );
    // The unconditional one shows no `if` clause at all.
    expect(out).toMatch(/blocks 7\/7[\s\S]*?PreToolUse · matcher `Bash`\n/);
  });

  it("🔴 NOTHING MEASURED: no score-shaped string, and it says so in words", () => {
    // The load-bearing assertion, in BOTH directions. A renderer that dropped
    // `notes` would print an empty-looking report that reads as a clean bill of
    // health; one that printed `0/7` per hook would invent a verdict.
    const stopOnly = mkdtempSync(join(tmpdir(), "vigiles-fmt-stop-"));
    mkdirSync(join(stopOnly, ".claude"), { recursive: true });
    writeFileSync(
      join(stopOnly, ".claude", "settings.json"),
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ command: ALLOW_ALL }] }] },
      }),
    );
    try {
      const out = rendered(experimental_verifyPluginGuards(stopOnly));
      expect(out).not.toMatch(SCORE_SHAPED);
      expect(out).toContain("Nothing was measured");
      expect(out).toContain("none of them reachable");
      // The hook is still accounted for, by reason.
      expect(out).toContain("registered on Stop");
    } finally {
      rmSync(stopOnly, { recursive: true, force: true });
    }
  });

  it("🔴 NO HOOKS AT ALL: the same two directions, with the absence named", () => {
    const empty = mkdtempSync(join(tmpdir(), "vigiles-fmt-empty-"));
    writeFileSync(join(empty, "CLAUDE.md"), "# nothing here\n");
    try {
      const out = rendered(experimental_verifyPluginGuards(empty));
      expect(out).not.toMatch(SCORE_SHAPED);
      expect(out).toContain("Nothing was measured");
      expect(out).toContain("not a clean bill of health");
      // No census row of zeroes — that reads as a scoreboard.
      expect(out).not.toContain("0 measured");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("a harness with no shell hooks renders its n/a note, not an empty pass", () => {
    const out = rendered(
      experimental_verifyPluginGuards(dir, { adapter: opencodeAdapter }),
    );
    expect(out).not.toMatch(SCORE_SHAPED);
    expect(out).toContain("n/a");
    expect(out).toContain("Nothing was measured");
  });

  it("MANY unmeasured hooks stay readable: grouped by reason, then counted", () => {
    // A repo can register dozens of hooks that a Bash battery never reaches.
    // Listing all of them buries the two lines that mattered, so the reason is
    // printed once per group and the tail is counted — nothing is dropped
    // silently, and the section stays bounded however many hooks there are.
    const many = mkdtempSync(join(tmpdir(), "vigiles-fmt-many-"));
    mkdirSync(join(many, ".claude"), { recursive: true });
    writeFileSync(
      join(many, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: DENY_ALL }],
            },
          ],
          Stop: Array.from({ length: 12 }, (_, i) => ({
            hooks: [{ type: "command", command: `echo notify-${i}` }],
          })),
        },
      }),
    );
    try {
      const out = rendered(experimental_verifyPluginGuards(many));
      // Every hook is COUNTED, exactly.
      expect(out).toContain("⊘ not applicable — 12 hooks");
      // The reason is printed ONCE for the whole group, not twelve times.
      const reasons = out.match(/registered on Stop/g) ?? [];
      expect(reasons).toHaveLength(1);
      // Three are named, the remaining nine are counted.
      expect(out).toContain("#1  `echo notify-0`");
      expect(out).toContain("#3  `echo notify-2`");
      expect(out).not.toContain("echo notify-3");
      expect(out).toContain("…and 9 more hooks for this reason");
      // The whole not-measured section stays small however many hooks there are.
      const section = out.slice(out.indexOf("NOT MEASURED"));
      expect(section.split("\n").length).toBeLessThan(12);
      // And the measured hook is NOT collapsed — it is what you came for.
      expect(out).toContain("blocks 7/7");
    } finally {
      rmSync(many, { recursive: true, force: true });
    }
  });

  it("a long or multi-line command is elided to one line", () => {
    const out = rendered(experimental_verifyPluginGuards(dir));
    expect(out).toContain("…`");
    // No rendered command spills a newline into the layout.
    for (const line of out.split("\n")) expect(line).not.toContain(DENY_ALL);
  });
});
