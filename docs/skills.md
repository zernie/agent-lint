# Skills

<!-- vigiles:ignore-file -->

> ⚠️ **`skill()` is experimental.** It compiles, and every gate it emits is
> verified — but it has not been adopted across a real skill corpus yet, and the
> spec shape may change without a major bump. [Status](#status--pending) lists the
> measured gaps, including one that blocks adoption today. Hand-written `SKILL.md`
> (markdown mode, below) is the stable path.

vigiles treats an agent **skill** (a `SKILL.md` procedure) the way it treats a `CLAUDE.md`: verify the deterministic parts at author time, enforce them at run time, and leave prose as prose.

A skill has two kinds of content:

- **Prose** the model executes — probabilistic, never asserted by vigiles.
- **Gates** — deterministic checks (a command, a file, a linter rule, a project role) that vigiles **verifies exist at compile time** and the harness **runs at run time**. A skill is not "done" until its result gate passes.

This is the same probabilistic-vs-deterministic split vigiles applies to rule references, now applied to a skill's _procedure_.

## Authoring a skill

Two on-ramps. They differ by **who owns the file**, not by power: in markdown mode you own `SKILL.md` and vigiles only checks the markers in it; with `skill()` the compiler owns `SKILL.md` and you own the spec it is generated from.

### 1. Markdown mode (no code) — stable

**Write `SKILL.md` prose and drop deterministic gates in as markers.** No spec, no TypeScript. Best for prose authors and the shallow majority of skills.

```md
## Step: Run the tests

Fix failures until the suite is green.

<!-- vigiles:gate "npm test" retry:3 -->

## Result

<!-- vigiles:result "npm test" -->
```

`vigiles lint` verifies each marker's reference against the project, exactly as in inline/frontmatter mode for `CLAUDE.md`. See `docs/markdown-mode.md`.

### 2. Declarative typed spec — `skill({ … })` — experimental

**For a linear skill**, a `SKILL.md.spec.ts` gives typed inputs, a knowledge body, and gated steps that compile to a verified `SKILL.md`:

```ts
import {
  experimental_skill as skill,
  cmd,
  project,
  instructions,
} from "vigiles/spec";

export default skill({
  name: "ship-pr",
  description: "Run the checks and open a PR once they pass",
  inputs: [skill.input("branch", "branch to open the PR from")],
  body: instructions`## Reference\n\n…domain knowledge the model reads…`,
  steps: [
    skill.step("Run the linter and fix issues.", { gate: cmd("npm run lint") }),
    skill.step("Run the tests; fix until green.", {
      gate: project("test"),
      retry: 3,
    }),
  ],
  result: project("test"),
});
```

**Why `skill.input` and `skill.step` instead of two more imports.** Both are used only by skill specs; `cmd`, `file`, `project` and `result` are shared with subagents and stay top-level. Hanging the skill-only pair off the builder makes the experimental marking structural for the whole family — you cannot reach `input()` without naming `experimental_skill` first, which a per-name prefix convention could not guarantee. Aliasing at the import, as above, keeps the prefix on the one line that crosses the package boundary and keeps the body readable.

What each field does:

- **`inputs`** compile to the `argument-hint` frontmatter and an `## Arguments` section (`$1`, `$2`, …).
- **`body`** (knowledge) and **`steps`** (procedure) compose — the body renders as a reference section before the gated steps.
- Each step's **`gate`** + optional **`retry`** renders a `vigiles:gate` marker. **`result`** renders the terminal `vigiles:result` marker.
- Every gate reference is **verified at compile time** (see below).

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

## Testing a skill

A skill's **firing** and its **gates** are testable without a spec, from the public testing API — see [`docs/harness-testing.md`](harness-testing.md) and [`docs/testing-api.md`](testing-api.md):

- **Does the description actually fire?** `measureTriggerRate` (`vigiles/testing`) reports recall and precision against prompts that should and should not reach the skill.
- **Does the gate ladder behave?** `vigiles hook-runtime run-skill <SKILL.md>` runs the markers directly, so a test can assert the exit code.
- **Live E2E** (`test/e2e`, `npm run test:cli-e2e`): drives the _real_ `claude` CLI against a scripted mock Anthropic endpoint (`ANTHROPIC_BASE_URL`), asserting the tool-use loop and Stop-hook enforcement with no real model.

## Status / pending

`skill()` is experimental, and these are the measured reasons:

- **A compiled `SKILL.md` has never been exercised as an installed skill.** Every `SKILL.md` in this repo that a harness actually loads — all of vigiles's own — is hand-written; the only two carrying the `vigiles:sha256:` header live under `examples/`. So the compiled path is untested end-to-end for skills, and adopting one means being the first to try it.

  Note what this is _not_: the header is **not** known to break loading. It does push the YAML frontmatter off line 1, and a reader anchored at `^---` finds none — but the sibling surface is measured working with exactly that shape. In `examples/harness/dogfood/reviewer-ab.eval.mjs`, real Claude Code loaded a compiled `agents/code-reviewer.md` **carrying the header** through `--plugin-dir`, dispatched to it, and the subagent read the file — 100% of trials against real sonnet (2026-06-20). Treat compiled skills as unproven, not as broken.

- **Adoption is all-or-nothing.** `renderSkillSections` composes the whole document in a fixed order, so converting an existing skill rewrites its structure rather than adding a gate to it. There is no "keep my prose, add one verified gate" path.
- **`inputs` costs more than it looks.** One `input()` adds both the `argument-hint` frontmatter key and a generated `## Arguments` section.
- The generator authoring mode (`genSkill` / `act` / `checkpoint` / `finish`) is **parked** and undocumented. It compiles, but it is reachable from no package subpath, so it is not part of the public API.
