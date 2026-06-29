# What vigiles catches — and prevents

> The [README](../README.md) has the pitch; this is the full list of harness
> problems vigiles handles, biggest first. Most tools only **lint** your harness —
> they flag a mistake after you've written it. vigiles also **prevents** whole
> classes of mistake by construction: with a typed spec or a compiled hook, the bug
> **can't be written** — it won't compile.

## Three ways a problem is handled

| Mode            | What it means                                                                         | Where                                                   |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| ✦ **Prevented** | Unrepresentable — it won't compile. The strongest guarantee: the mistake can't exist. | typed spec (`.spec.ts`), compiled hook (`vigiles/hook`) |
| ✓ **Caught**    | Flagged deterministically — free, no model, runs on every commit.                     | `vigiles audit` (report) · `vigiles lint` (CI gate)     |
| ◷ **Measured**  | Checked with a real model, on your own Claude subscription (no metered API).          | `vigiles test` · `vigiles eval`                         |

A single problem is often handled more than one way — e.g. an over-powered agent is
**caught** today and **prevented** the moment you put it under a typed purity floor.

## The matrix

Shipped capabilities, ordered by how badly the problem bites.

| #   | The problem (what silently breaks)                                                                                                                                                                                                                                                       | How vigiles handles it                                                                                                                                                                                                        | Where                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | A safety hook that **looks like it blocks but silently doesn't** — wrong JSON field, or a block decision on an event that can't block (the #1 verified hook pain).                                                                                                                       | ✦ **Prevented** — a compiled hook emits the protocol for you; you can't write the wrong field, and "block on a no-decision event" is a type error · ✓ **caught** on a hand-written hook (the `hook-block-ineffective` check). | `vigiles/hook` · audit · lint |
| 2   | An agent that can **read your secrets, take in untrusted text, _and_ send data out** — a prompt-injection data-leak path with no exploit code (the "lethal trifecta") — _including_ when the three abilities are **split across a delegation chain** so no single agent looks dangerous. | ✓ **Caught** (the Safety check, from the tool list alone — per agent _and_ across the delegation tree) · ✦ **prevented** under a typed purity floor.                                                                          | audit · lint · spec           |
| 3   | A subagent **wired to a tool the harness silently drops** (a typo or a never-available tool) — it loses a capability it thinks it has.                                                                                                                                                   | ✓ **Caught** · ✦ **prevented** (a typed spec won't compile with an unknown tool).                                                                                                                                             | audit · lint · spec           |
| 4   | A linter rule your instructions **cite that doesn't exist, or exists but isn't enabled** — across ESLint, Ruff, Clippy, Pylint, RuboCop, Stylelint, and Cedar.                                                                                                                           | ✓ **Caught** — the cross-referencing engine no other tool has.                                                                                                                                                                | lint · audit                  |
| 5   | A **file, script, or code symbol the instructions reference that doesn't exist** — the agent reads the instruction, gets nothing, and continues.                                                                                                                                         | ✓ **Caught** · ✦ **prevented** (a verified reference in a typed spec).                                                                                                                                                        | lint · audit · spec           |
| 6   | A **skill that never fires** — its description collides with another so the wrong one runs, its frontmatter is **missing the opening `---` fence** (loads as plain body, no name/trigger), or a functional dir is **misplaced inside `.claude-plugin/`** where the harness can't see it. | ✓ **Caught** (near-identical descriptions, missing fence, and misplaced dirs — all deterministically) · ◷ **measured** (does it _actually_ fire? recall + precision).                                                         | audit · lint · eval           |
| 7   | An **MCP tool whose server isn't declared**, or a server that **can't start** (no command/url) — the tool call never resolves.                                                                                                                                                           | ✓ **Caught**.                                                                                                                                                                                                                 | lint · audit                  |
| 8   | A **hook that never fires** — registered under a misspelled **event name**, or with a **`matcher`** that's a tool-name typo or a malformed/undeclared MCP form.                                                                                                                          | ✓ **Caught** (close-typo + MCP-form, high-precision).                                                                                                                                                                         | lint · audit                  |
| 9   | A **skill's bundled script or reference file that doesn't resolve** on disk.                                                                                                                                                                                                             | ✓ **Caught**.                                                                                                                                                                                                                 | audit · lint                  |
| 10  | A **multi-agent pipeline whose steps hand off mismatched data** — step N's output doesn't supply step N+1's needs.                                                                                                                                                                       | ✦ **Prevented** — typed composition won't compile if the handoffs don't line up.                                                                                                                                              | spec                          |
| 11  | A **compiled instruction file hand-edited out of sync** with its source.                                                                                                                                                                                                                 | ✓ **Caught** — a SHA-256 integrity check.                                                                                                                                                                                     | lint                          |
| 12  | A `disallowedTools` deny-list entry that's a **typo of a real tool**, so it blocks nothing.                                                                                                                                                                                              | ✓ **Caught**.                                                                                                                                                                                                                 | lint · audit                  |
| 13  | A subagent **missing required frontmatter** (won't register), or an **invalid `model`/`color`** that silently falls back.                                                                                                                                                                | ✓ **Caught**.                                                                                                                                                                                                                 | lint · audit                  |
| 14  | A **hyped skill that claims savings but doesn't help — or quietly breaks the output**.                                                                                                                                                                                                   | ◷ **Measured** — A/B on real coding tasks: the token bill, whether it hit its target, and whether the code still works.                                                                                                       | eval                          |
| 15  | A guardrail you _wrote_ that **doesn't actually block the disaster battery** (force-push, `rm -rf`, `curl\|sh`, secret reads).                                                                                                                                                           | ◷ **Measured** — runs your hook against the catalog and proves the block.                                                                                                                                                     | testing                       |

## On the roadmap

More real-world failures (mined from OSS plugin issues) are queued as deterministic
`audit`/`lint` checks — same pattern, free and no model:

- **Secrets** hardcoded in config, or `settings.local.json` not gitignored.
- **Dangerous default permissions** (`Bash(*)`, blanket auto-approve).
- A `Read(.env)` deny that **Bash quietly bypasses**.
- A CLAUDE.md `@import` to a file that doesn't exist.
- An instruction file over the harness's silent **truncation limit**.

## See also

- [Verifying instruction files](verifying-instruction-files.md) — the linting guide + the
  full per-rule matrix.
- [Harness testing](harness-testing.md) — the `test`/`eval` tiers (the ◷ rows).
- [Compiled hooks](compiled-hooks.md) — authoring a hook so the ✦ "prevented" rows hold.
- [For plugin authors](for-plugin-authors.md) — running `audit` on your own plugin or a
  whole marketplace.
