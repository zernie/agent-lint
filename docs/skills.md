# Skills

<!-- vigiles:ignore-file -->

> 🔴 **The import paths below do not exist yet.** Measured 2026-08-16 against the
> published package: `vigiles/skill` and `vigiles/skill-test` both raise
> `ERR_PACKAGE_PATH_NOT_EXPORTED`, and `genSkill` / `act` / `checkpoint` /
> `finish` / `runSkill` are reachable from **no** subpath at all — the generator
> API is compiled from source by `vigiles compile`, and was never given an entry
> point. Everything about the SHAPE of a skill below is accurate; the `import`
> lines are aspirational. Read them as the intended surface, not as working code,
> until an entry point ships.

vigiles treats an agent **skill** (a `SKILL.md` procedure) the way it treats a `CLAUDE.md`: verify the deterministic parts at author time, enforce them at run time, and leave prose as prose.

A skill has two kinds of content:

- **Prose** the model executes — probabilistic, never asserted by vigiles.
- **Gates** — deterministic checks (a command, a file, a linter rule, a project role) that vigiles **verifies exist at compile time** and the harness **runs at run time**. A skill is not "done" until its result gate passes.

This is the same probabilistic-vs-deterministic split vigiles applies to rule references, now applied to a skill's _procedure_.

## Authoring a skill

Three on-ramps, increasing in power. Pick the lowest one that fits.

### 1. Markdown mode (no code)

**Write `SKILL.md` prose and drop deterministic gates in as markers.** No spec, no TypeScript. Best for prose authors and the shallow majority of skills.

```md
## Step: Run the tests

Fix failures until the suite is green.

<!-- vigiles:gate "npm test" retry:3 -->

## Result

<!-- vigiles:result "npm test" -->
```

`vigiles lint` verifies each marker's reference against the project, exactly as in inline/frontmatter mode for `CLAUDE.md`. See `docs/markdown-mode.md`.

### 2. Declarative typed spec — `skill({ … })`

**For a linear skill**, a `SKILL.md.spec.ts` gives typed inputs, a knowledge body, and gated steps that compile to a verified `SKILL.md`:

```ts
import { skill, step, input, cmd, project } from "vigiles/spec";

export default skill({
  name: "ship-pr",
  description: "Run the checks and open a PR once they pass",
  inputs: [input("branch", "branch to open the PR from")],
  body: instructions`## Reference\n\n…domain knowledge the model reads…`,
  steps: [
    step("Run the linter and fix issues.", { gate: cmd("npm run lint") }),
    step("Run the tests; fix until green.", {
      gate: project("test"),
      retry: 3,
    }),
  ],
  result: project("test"),
});
```

What each field does:

- **`inputs`** compile to the `argument-hint` frontmatter and an `## Arguments` section (`$1`, `$2`, …).
- **`body`** (knowledge) and **`steps`** (procedure) compose — the body renders as a reference section before the gated steps.
- Each step's **`gate`** + optional **`retry`** renders a `vigiles:gate` marker. **`result`** renders the terminal `vigiles:result` marker.
- Every gate reference is **verified at compile time** (see below).

### 3. Generator spec — `function* () { … }`

**For branching, looping, and stateful skills**, write the skill as a **generator** that `yield`s effects. The harness drives it.

```ts
import { act, checkpoint, finish } from "vigiles/skill";
import { cmd, project } from "vigiles/spec";

export default function* () {
  const lang = yield act("Detect the project language");
  if (lang === "python") yield checkpoint(cmd("pytest"));
  else yield checkpoint(project("test"));
  for (;;) {
    if ((yield act("Fix the next failure, or 'done'")) === "done") break;
  }
  yield finish(project("test"));
}
```

The three yield types:

- **`act(prose)`** — a prose step the model performs. Its answer is `yield`ed back, so `if`/`for`/`while` are real control flow.
- **`checkpoint(gate)`** — a deterministic checkpoint between steps.
- **`finish(gate)`** — the terminal result gate.

The generator is the **single typed representation** for non-trivial skills. It scales from a linear list of `yield`s down to a deep state machine.

Why a generator and not a declarative graph? A graph rich enough to express deep skills needs data-dependent routing. Deep static analysis of that routing (reachability, soundness, termination) is undecidable anyway — so a graph buys clunkier authoring with no analysis win.

**Compiling a generator → `SKILL.md`** (`src/compile-generator.ts`): the generator's _source_ is parsed with the TypeScript compiler API and rendered to markdown. `act` becomes a prose step; `checkpoint`/`finish` become gate/result markers; `if/else` becomes `### If <cond>` / `### Otherwise`; `for/while` becomes `### Repeat (…)`. The emitted `SKILL.md` is what the agent reads (branches flattened to prose). The harness drives the real generator at run time. Gate references with literal arguments are collected and verified, so the cross-referencing engine works on generators too.

## Gates and what is verified

A gate is one of:

| Gate                               | Author-time check                   | Run-time                                                                           |
| ---------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `cmd("npm test")`                  | npm script exists in `package.json` | run, exit 0 = pass                                                                 |
| `cmd("python scripts/x.py")`       | the script **file** exists          | run, exit 0 = pass                                                                 |
| `file("scripts/validate.py")`      | the path exists                     | exists = pass                                                                      |
| `project("test"\|"build"\|"lint")` | always valid (portable)             | resolves to the **host** project's command (npm / pytest / cargo / go) and runs it |

ℹ️ **`project()` gates are portable.** A skill that runs in many repos should prefer `project("test")` over a hard-coded `npm test`. Missing scripts and files are caught at compile time — the exact "skill silently references a script that doesn't exist" rot that breaks real skills.

**`maxInlineCodeLines`** (default 20): an inline fenced code block longer than this raises a non-blocking **warning** nudging you to move the script into a file referenced by `file()`. This keeps big scripts out of the body for token budget and progressive disclosure. It's advisory, not an error — so adopting a code-heavy skill always compiles.

## Running and enforcing a skill

- **`vigiles hook-runtime run-skill <SKILL.md>`** parses the `vigiles:gate`/`vigiles:result` markers and **runs the gate ladder**: each gate in order, short-circuiting on the first failure (Railway), then the result gate. Exit 0 = all passed, exit 2 = blocked. (`src/adapters/claude-code/skill-runtime.ts`)
- **Stop-hook enforcement** makes the result gate enforce in a live session: `vigiles hook-runtime skill-start <SKILL.md>` marks a skill active; the `Stop` hook (`vigiles hook-runtime skill`) runs its result gate and **blocks completion until it passes** (exit 2 feeds the reason back to the model); `vigiles hook-runtime skill-done` clears it. Proven end-to-end against real Claude Code in `test/e2e`.
- **Edit protection**: the Claude Code plugin (installed via the marketplace — `/plugin marketplace add zernie/vigiles` then `/plugin install vigiles@vigiles`, or via `vigiles init`) ships a `PreToolUse` hook that blocks edits to any vigiles-compiled file (one carrying a `vigiles:sha256:` header — including a compiled `SKILL.md`) and redirects to its spec, and a `PostToolUse` hook that recompiles on `*.spec.ts` edits. Hand-written markdown is untouched.

## Testing skills deterministically — `vigiles/skill-test`

**You can write deterministic tests for a skill's action sequence** — not the LLM's prose, but the control flow and gates, which _are_ deterministic. Script the model (the non-deterministic seam) and assert the rest, inside an ordinary `node:test` / Vitest `test()`:

```ts
import { runSkill, scriptModel } from "vigiles/skill-test";
import test from "node:test";
import assert from "node:assert/strict";

test("review loop exits on a clean round, else hits the ceiling", () => {
  const r = runSkill(prReviewLoop, {
    model: scriptModel({
      "next p1/p2 finding": ["finding-A", "done", "done"],
      "run ci": "pass",
      actionable: ["yes", "no"], // round 1 has more; round 2 is clean → exit
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.acts.filter((a) => a.prose.includes("Collect")).length, 2);
});
```

`scriptModel` takes an ordered array, or a map keyed by a prose substring. The map's value is a single answer or a per-key sequence, so a loop's prompt can answer differently each iteration. `runSkill` returns `{ ok, blockedAt, acts, gates }` to assert on.

Real community skills (pr-review-loop, TDD, subagent-driven) are ported and tested this way in `src/community-skills.ts` — proof the generator form covers the deep tail.

**Live E2E** (`test/e2e`, `npm run test:cli-e2e`): drives the _real_ `claude` CLI against a scripted mock Anthropic endpoint (`ANTHROPIC_BASE_URL`), asserting the tool-use loop and Stop-hook enforcement with no real model.

## Status / pending

- Generator skills compile via `compileGenerator` programmatically; wiring it into `vigiles compile` (and how a generator skill declares its name/description for the frontmatter) is the next integration step.
- The declarative `step()` and generator `act/checkpoint/finish` vocabularies will be unified.
