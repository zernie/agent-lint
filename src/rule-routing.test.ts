import { describe, it, expect } from "vitest";
import { routeRules } from "./rule-routing.js";

describe("routeRules", () => {
  it("routes an off-the-shelf rule mention to reuse (config-line)", () => {
    const r = routeRules("- Never use `console.log` in shipped code.");
    const reuse = r.rules.filter((x) => x.category === "reuse");
    expect(reuse).toHaveLength(1);
    expect(reuse[0].rule).toBe("no-console");
    expect(reuse[0].mechanism).toBe("config-line");
    expect(r.counts.reuse).toBe(1);
  });

  it("routes an action rule to hook (a linter can't see git push)", () => {
    const r = routeRules("- Never force-push to main.");
    const hook = r.rules.filter((x) => x.category === "hook");
    expect(hook).toHaveLength(1);
    expect(hook[0].mechanism).toBe("hook");
  });

  it("action cue wins over a rule-name mention (never commit console.log → hook)", () => {
    const r = routeRules(
      "- Never commit `console.log` — run tests before you commit.",
    );
    expect(r.rules[0]?.category).toBe("hook");
  });

  it("routes a judgment call to semantic (stays prose)", () => {
    const r = routeRules(
      "## Rules\n\n- Keep names readable and code idiomatic.",
    );
    const semantic = r.rules.filter((x) => x.category === "semantic");
    expect(semantic.length).toBeGreaterThanOrEqual(1);
    expect(semantic[0].mechanism).toBe("prose");
  });

  it("routes an un-cued mechanizable rule to unrouted (compile to find out), never 'synthesize'", () => {
    // A real imperative with no off-the-shelf rule, no action cue, no judgment cue.
    const r = routeRules("- Always wrap fetch calls in a retry with backoff.");
    const unrouted = r.rules.filter((x) => x.category === "unrouted");
    expect(unrouted.length).toBeGreaterThanOrEqual(1);
    expect(unrouted[0].mechanism).toBe("compile");
    // The deterministic tier must not promise synthesis — every mechanism is one
    // of the four honest rungs (compile is as far as it commits), never a
    // "custom-rule will be written" claim.
    const RUNGS = new Set(["config-line", "hook", "prose", "compile"]);
    expect(r.rules.every((x) => RUNGS.has(x.mechanism))).toBe(true);
  });

  it("routes an agent-instruction to meta (not a code rule), never unrouted", () => {
    // "read X first" is guidance to the agent, not an enforceable code norm — it
    // must NOT read as "compilable but hard".
    const r = routeRules("## Rules\n\n- Always read the root CLAUDE.md first.");
    const meta = r.rules.filter((x) => x.category === "meta");
    expect(meta.length).toBeGreaterThanOrEqual(1);
    expect(meta[0].mechanism).toBe("prose");
    // and it did not leak into the "hard to compile" bucket
    expect(r.rules.some((x) => x.category === "unrouted")).toBe(false);
  });

  it("routes an agent-attention norm (never re-read a file) to meta, not unrouted", () => {
    // Fable's H5: nothing reliably gates "don't re-read/re-run" — it's agent
    // guidance (meta), never a compilable rule.
    const r = routeRules(
      "## Rules\n\n- Never re-read the same section of a file without code changes in between.",
    );
    expect(r.rules.some((x) => x.category === "meta")).toBe(true);
    expect(r.rules.some((x) => x.category === "unrouted")).toBe(false);
  });

  it("dynamic catalog: a bullet naming ANY repo rule → reuse with enabled state", () => {
    const availableRules = {
      linter: "eslint" as const,
      available: 2,
      enabled: 1,
      rules: [
        {
          id: "no-only-tests/no-only-tests",
          plugin: "no-only-tests",
          enabled: false,
        },
        { id: "boundaries/dependencies", plugin: "boundaries", enabled: true },
      ],
    };
    const md = [
      "## Rules",
      "",
      "- No `.only()` in tests (`no-only-tests/no-only-tests`)",
      "- Never import an adapter from the core layer (`boundaries/dependencies`)",
    ].join("\n");

    // WITHOUT a catalog, the first bullet is unrouted (its `/` breaks the static
    // INTENT_MAP whole-token match) — the exact named-but-hard case.
    const bare = routeRules(md);
    expect(bare.rules[0]?.category).toBe("unrouted");
    expect(bare.rules[0]?.enabled).toBeUndefined();

    // WITH the catalog, both route to reuse; the disabled one carries the
    // "documented but OFF" nudge, and architecture (boundaries) is enforceable.
    const r = routeRules(md, undefined, { availableRules });
    const only = r.rules.find((x) => x.rule === "no-only-tests/no-only-tests");
    expect(only?.category).toBe("reuse");
    expect(only?.enabled).toBe(false);
    const arch = r.rules.find((x) => x.rule === "boundaries/dependencies");
    expect(arch?.category).toBe("reuse");
    expect(arch?.enabled).toBe(true);
  });

  it("carries provenance (line span + verbatim quote) from the segmenter", () => {
    const md = "# Style\n\n- Use `eqeqeq` everywhere.\n";
    const r = routeRules(md, "CLAUDE.md");
    const rule = r.rules.find((x) => x.rule === "eqeqeq");
    expect(rule?.file).toBe("CLAUDE.md");
    expect(rule?.lineStart).toBe(3);
    expect(rule?.quote).toContain("eqeqeq");
    expect(rule?.confidence === "high" || rule?.confidence === "medium").toBe(
      true,
    );
  });

  it("counts add up to the number of segmented rules", () => {
    const md = [
      "## Conventions",
      "",
      "- Never use `console.log`.",
      "- Never force-push to main.",
      "- Keep code readable.",
      "- Always validate user input.",
    ].join("\n");
    const r = routeRules(md);
    const sum =
      r.counts.reuse +
      r.counts.hook +
      r.counts.meta +
      r.counts.semantic +
      r.counts.unrouted;
    expect(sum).toBe(r.segmented);
    expect(r.segmented).toBeGreaterThanOrEqual(4);
  });

  it("returns an empty routing for prose with no rules", () => {
    const r = routeRules("This project is a knowledge base. It has notes.");
    expect(r.segmented).toBe(0);
    expect(r.rules).toEqual([]);
  });
});
