# unmarked-refs

Nudge (or block) the agent when an instruction file (`CLAUDE.md` / `AGENTS.md` /
`SKILL.md`) names a **linter rule that isn't a vigiles mark** — so `vigiles lint`
can't verify it exists and is enabled — or has a `vigiles:symbol` mark whose
target is missing. This is the rule behind the **PostToolUse refs-hook**: it's
what makes the agent express rule references as marks _in the loop_, the moment
it saves an instruction file, instead of leaving them as unverifiable prose.

It is **deliberately narrow** (high-signal, low-noise): it flags only
slash-scoped rule names, not every backticked identifier or path — see
[What it checks](#what-it-checks).

## Configuration

```json
{
  "rules": {
    "unmarked-refs": "warn"
  }
}
```

### Severity

| Value     | Behavior                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `"warn"`  | **Default.** A non-blocking nudge — the hook injects a "mark these references" message into the agent's context. The edit proceeds. |
| `"error"` | Block. The edit is rejected (exit 2) until the references are marked or ignored.                                                    |
| `false`   | Off. No nudge, no block.                                                                                                            |

Start at `"warn"` (the default) so an existing prose-heavy instruction file
doesn't explode on the first edit; move to `"error"` once a project has cleaned
up and wants the floor enforced locally.

## What it checks

For the edited instruction file, two things (both via `collectRefIssues` in
`src/core/refs.ts`):

- **Unmarked linter-rule references** — a backticked **slash-scoped name with no
  file extension**: `` `eslint/no-console` ``, `` `@typescript-eslint/no-explicit-any` ``,
  `` `boundaries/dependencies` ``. These are nudged toward `enforce("…")` (typed
  spec) or `<!-- vigiles:enforce … -->` (markdown) so the lint verifies the rule
  exists **and is enabled**.
  - **Not flagged** (deliberately — too noisy, and the judgment is undecidable):
    bare identifiers (`` `runHook` ``, `` `MAX_RETRIES` `` — usually API prose),
    file paths (`` `src/config.ts` ``, `` `docs/guide.md` `` — they have
    extensions), and spans already written as a `vigiles:symbol` mark. **Symbol
    marking is opt-in** via an explicit `vigiles:symbol` — the hook never nudges
    you to add one. (Dogfooding the broader "every code-shaped span" heuristic
    flagged 23 API names in one real `SKILL.md`; this scope flags zero.)
- **Broken `vigiles:symbol` marks** — a `` `vigiles:symbol path#name` `` you wrote
  whose file is missing or doesn't define the symbol.

## Opting out

- Per line: end the line with `<!-- vigiles:ignore -->`.
- Per file: add `<!-- vigiles:ignore-file -->`.

## Where it runs

- **In the loop (Claude Code / Codex):** the `refs-nudge.sh` PostToolUse hook
  shipped in the plugin runs `vigiles hook-runtime refs` on every instruction-file edit.
- **At commit / in CI (any harness):** `vigiles refs <file>` runs the same check
  as the deterministic, unbypassable backstop.

## Why

Reference verification only works on references that are _marked_. Nothing can
deterministically force a _plaintext_ reference to become a mark — that judgment
is undecidable.
This rule closes the reachable part of that gap: when the agent _does_ write a
code-shaped reference, it gets nudged to mark it so it becomes verifiable. The
full flow, from file save, is in
[verifying-instruction-files.md](../verifying-instruction-files.md#the-marking-nudge--what-happens-on-every-file-save).
