---
status: active
topic: positioning
---

# OSS lane sweep (2026-06-25) — is anyone open-source in our differentiated lane?

> A dedicated GitHub/npm/PyPI sweep (combing both harness-engineering awesome-lists)
> to double-check the VC-search conclusion. Verdict up front: **our differentiated
> capabilities (A/B/C/D) are unoccupied by OSS; the structural-lint surface is
> crowded, with `agnix` the clear incumbent we should NOT race on rule count.**

## The four capabilities (vigiles's frame)

- **A — cross-reference verification:** a rule/path/script in CLAUDE.md actually
  EXISTS and is ENABLED (linter-catalog API, package.json, filesystem).
- **B — harness testing:** run hooks/skills/subagents and assert fire/block decisions.
- **C — skill trigger eval:** recall + precision over varied prompts.
- **D — compiled typed specs:** `(event)=>Decision` hooks where bug classes are unrepresentable.

## What's out there (structural-lint surface — CROWDED)

| Tool                              | ★           | Lang | A                  | B               | C                            | D     | Note                                                                                                                                                                                                                       |
| --------------------------------- | ----------- | ---- | ------------------ | --------------- | ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **agnix** (agent-sh)              | **297**     | Rust | ◑                  | ✗               | ✗                            | ✗     | **The incumbent.** 429 rules, multi-harness (CC/Codex/Cursor/Copilot/Gemini/Cline), LSP, GH Action, autofix, WASM playground. Pure structural lint — no catalog cross-ref, no execution. **Watch + don't out-rule-count.** |
| skill-validator (agent-ecosystem) | 174         | Go   | ✗                  | ✗               | ✗                            | ✗     | SKILL.md struct + LLM-judge _content quality_ (not trigger).                                                                                                                                                               |
| seojoonkim/agentlinter            | ~65         | TS   | ✗                  | ✗               | ✗                            | ✗     | "ESLint for agents" — 8 quality dimensions.                                                                                                                                                                                |
| carlrannaberg/cclint              | 20          | TS   | ✗                  | ✗               | ✗                            | ✗     | frontmatter/settings schema.                                                                                                                                                                                               |
| pulser (TheStack-ai)              | 17          | TS   | ✗                  | ✗               | ✗                            | ✗     | SKILL.md struct only (author confirms: no execution).                                                                                                                                                                      |
| pdugan20/claudelint               | 8           | TS   | ◑                  | ✗               | ✗                            | ✗     | 114 rules; **hook-script-exists + event-name validity** (OSS `claude plugin validate`).                                                                                                                                    |
| **ctxlint** (YawLabs)             | 6           | TS   | ◑                  | ✗               | ✗                            | ✗     | **Closest to our `file()`/`cmd()`:** verifies paths + npm scripts exist vs the codebase. Stops at filesystem — no linter-catalog lookup.                                                                                   |
| felixgeelhaar/cclint              | 6           | TS   | ◑                  | ✗               | ✗                            | ✗     | stale model IDs, @path imports.                                                                                                                                                                                            |
| **VoxCore84/hook-tester**         | new         | Py   | ✗                  | **◑**           | ✗                            | ✗     | **Only OSS that EXECUTES hooks:** pipes a synthesized event, checks exit code (0/2). Python-only, no assembled-harness tier. A sliver of our `runHook`.                                                                    |
| ruler / rulesync                  | 2.8k / 1.2k | —    | ✗                  | ✗               | ✗                            | ✗     | Sync/distribution — compose-with, not compete.                                                                                                                                                                             |
| **vigiles**                       | 11          | TS   | **✓ (7 catalogs)** | **✓ (3 tiers)** | **✓ (recall+precision+sig)** | **✓** | —                                                                                                                                                                                                                          |

Corrections to the prior landscape doc: `0xmariowu/AgentLint`, `SkillCheck`/`getskillcheck` **don't exist as OSS repos** (dead leads); `agnix` is the real leader.

## Verdict

- **A (catalog cross-ref): ZERO OSS tools.** Nobody queries ESLint/Ruff/Clippy/… to
  verify a cited rule exists AND is enabled. The whole field stops at "is this a valid
  event name?" `ctxlint` is the only one doing _any_ reference-existence (paths/scripts),
  and stops at the filesystem.
- **B (harness testing): one sliver** (VoxCore84, exit-code level, Python-only).
- **C (trigger eval): zero.** The field knows the bug exists (recurring 0%-trigger
  GitHub issues) but no OSS measures it.
- **D (compiled typed specs): unique to vigiles.**
- **The crowded part is structural lint**, where **agnix (297★, Rust) is ahead of us** —
  which confirms our standing "drop the breadth race" call: differentiate on A/B/C/D +
  sub-affordable eval, NOT on rule count.

**Bottom line: the cross-reference-verification + harness-testing + skill-eval lane is
genuinely empty of OSS.** The one competitor to actively watch is **agnix** (if it adds
catalog cross-ref or execution it closes toward us); the runtime/observability funded
players (BentoLabs/Salus — see the vault) are a _different layer_.

## See also

- `landscape-mid-2026.md` — the broader Market A/B/C competitive picture this updates.
- `startup/` vault — the funded/runtime competitors (BentoLabs, Salus) + VC intel.
