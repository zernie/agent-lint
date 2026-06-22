# HANDOFF — volatile cross-session state

> Overwrite each session; keep ≤120 lines. Durable map = `research/roadmap.md`.
> The SessionStart hook injects this so a new session starts oriented. Read first.

## RESUME HERE — compiled hooks SHIPPED (CC + Codex) + repositioned (2026-06-22)

Done and pushed to `claude/what-now-umafgi` (@ `81d11b5`, tree clean). Compiled
hooks are a real public capability for **both Claude Code AND Codex**; the
README/docs are repositioned around **harness reliability**. No open task — pick
up a NEW direction from the user (or the small deferred item below).

⚠️ **DELIVERY-FLOOR caveat — keep in EVERY doc/claim.** Compile/verify fix a
hook's AUTHORING + LOGIC, not DELIVERY: CC's **#34692** (PreToolUse hooks don't
fire for subagent tool calls; closed not-planned) bypasses ANY compiled hook. So
VERIFY (a logic claim) survives the bug; GATE (live enforcement) is a strong
default, **never "unbypassable."**

### SHIPPED this arc (don't rebuild)

- **STEP 1 — compiled hooks (`c4d4d85`).** `vigiles/hook` public surface
  (`src/hook.ts` ← `src/core/hook-program.ts`) + CLI `compile-hook` /
  `run-hook-program`. A hook = a pure typed `(event)=>Decision` against a CLOSED
  vocab; role FAMILY gate/inject/react. Makes whole bug classes UNREPRESENTABLE
  (false confidence, matcher bypass via AST `command.runs`, capability=API-surface
  via `checkHookImports`, tamper-evident `stampHook`, category mistake = tsc
  error). Expanded `CommandView` with `touches()` (secret reads) + `pipesToShell()`
  (curl|sh). Tests: `src/hook.test.ts` (E2E over the real CLI), `src/core/hook-program.test.ts`.
  `package.json` exports `./hook`; api-extractor tracks `etc/vigiles-hook.api.md`.
- **OSS dogfood (`c4d4d85`).** `src/hook-dogfood.test.ts`: a hand-written substring
  guard (the widely-copied disler shape) misses 5/7 of `DISASTER_CATALOG`; the
  compiled rewrite (`examples/harness/safe-bash-guard.mjs`) blocks **7/7**.
  Model-free, in CI. The "prove worth" artifact.
- **STEP 2 — docs reposition (`2b3739b`).** README top-line = "make the harness
  reliable", four instruments (Verify/Guard/Test/Measure); Guard = compiled hooks.
  New `docs/compiled-hooks.md` (says "whole classes of bugs unrepresentable" + the
  bug-class table). Cross-linked from README, docs index, cli.md, harness-testing,
  verifying. CLAUDE.md positioning + keyFiles updated (via spec, recompiled).
  README is 203 lines (cap ~200 — fine, gained a pillar).
- **STEP 3 — Codex design (`b0b1429`).** `research/compiled-hooks-codex.md`.

### STEP 4 — Codex compiled-hook emit, BUILT (`81d11b5`)

`compileHookProgram(source, hook, opts?: CompileHookOptions)` (was a positional
`gateCommand`): opts `{ gateCommand?, dialect?, hookProtocol?, settingsFormat? }`
default to CC (back-compat). Validates `hook.on` via `verifyHookEvents` (typo
won't compile), styles the matcher via `HookProtocol.matcherStyle` (CC exact vs
Codex `^(A|B)$` regex), renders `settingsBlock` per `settingsFormat` (CC JSON vs
Codex TOML `[[hooks.<event>]]`, `@iarna/toml`). `compile-hook --harness=codex`
threads the resolved adapter. Gate runtime SHARED (exit-2). Tests in
`hook-program.test.ts` (non-CC TOML+regex dogfood + event-reject + CC back-compat).

**Deferred (small):** the inject/ask OUTPUT JSON is still CC-shaped in
`run-hook-program` — gate/`deny` (exit-2) is cross-harness now, but inject's
`additionalContext` / ask's `permissionDecision` need Codex's field names
confirmed against the real binary before routing through `HookProtocol`. See
`research/compiled-hooks-codex.md` (§Deferred).

### Prior shipped (earlier sessions, don't rebuild)

- **VERIFY feature (`a5abf70`):** `src/guardrail-check.ts` on `vigiles/unit` —
  "prove your guardrail blocks" (DISASTER_CATALOG + assertBlocksDisasters + neutral
  map). Useful, lint-ish, NOT a moat. Distinct from compiled hooks (it AUDITS any
  hook; compiled hooks AUTHOR a correct one).
- **guard-hook GATE (`959e88c`/`4336f4a`, EXPERIMENTAL/MED)**; **hook-spec spike
  (`d3471c0`)**; A1 sonnet debunks (caveman −18%, SATURATED); V1 nesting STACK fix.

## Gotchas

- Subagents NOT worktree-isolated; VERIFY their output (build+tests+run it).
- `api:report` on any public-surface change; recompile CLAUDE.md after editing its
  spec; cross-link new research/docs (orphan-docs lint); build+vitest+lint+fmt:check
  before commit. Conventional commits. **NO session links / model IDs in commits.**
- TS-encoding: per-edge check → shallow generated type O(N); whole-set uniqueness → JS.
- Real-model tiers need sub auth + slow; deterministic work needs neither.

## Don't re-read unless the task needs it

- `research/hook-pain-points.md` — the hook corpus + the compiled-hooks/verify ship record.
- `research/compiled-hooks-codex.md` — the Codex emit design (the NEXT item).
- `docs/compiled-hooks.md` — the public guide (the user-facing source of truth).
- `research/{roadmap,harness-protocol-flow-moat,codex-prototype-findings}.md` — map + moat + Codex facts.
