# unmarked-refs

Nudge (or block) the agent when an instruction file (`CLAUDE.md` / `AGENTS.md` /
`SKILL.md`) contains a **code-shaped reference that isn't a vigiles mark** — so
`vigiles audit` can't verify it — or a `vigiles:symbol` mark whose target is
missing. This is the rule behind the **PostToolUse refs-hook**: it's what makes
the agent express references as marks _in the loop_, the moment it saves an
instruction file, instead of leaving them as unverifiable prose.

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

- **Unmarked code-shaped spans** — a backticked scoped name (`` `eslint/no-console` ``),
  a `camelCase` / `PascalCase` / `SCREAMING_CASE` identifier, or a `foo(args)`
  call form. Bare lowercase prose words (`` `name` ``), file paths
  (`` `src/config.ts` `` — those are `file()` refs), and spans already written as
  a `vigiles:symbol` mark are **not** flagged.
- **Broken `vigiles:symbol` marks** — a `` `vigiles:symbol path#name` `` whose
  file is missing or doesn't define the symbol.

## Opting out

- Per line: end the line with `<!-- vigiles:ignore -->`.
- Per file: add `<!-- vigiles:ignore-file -->`.

## Where it runs

- **In the loop (Claude Code / Codex):** the `refs-nudge.sh` PostToolUse hook
  shipped in the plugin runs `vigiles refs-hook` on every instruction-file edit.
- **At commit / in CI (any harness):** `vigiles refs <file>` runs the same check
  as the deterministic, unbypassable backstop.

## Why

Reference verification only works on references that are _marked_. Nothing can
deterministically force a _plaintext_ reference to become a mark — that judgment
is undecidable (see
[`research/reference-verification-limits.md`](../../research/reference-verification-limits.md)).
This rule closes the reachable part of that gap: when the agent _does_ write a
code-shaped reference, it gets nudged to mark it so it becomes verifiable. The
full flow, from file save, is in
[verifying-instruction-files.md](../verifying-instruction-files.md#the-marking-nudge--what-happens-on-every-file-save).
