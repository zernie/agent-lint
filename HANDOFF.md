# HANDOFF — volatile cross-session state

> Overwrite each session; keep ≤120 lines. Durable map = `research/roadmap.md`.
> The SessionStart hook injects this so a new session starts oriented. Read first.

## RESUME HERE — shipping COMPILED HOOKS (in flight, 2026-06-22)

**Decision (user, via AskUserQuestion):** (1) SHIP compiled hooks for real, (2) REPOSITION
the README around **"harness reliability"**, (3) design the **Codex compiled-hook adapter**.
Do in that order. Tree clean @ `895809e`, all pushed to `claude/what-now-umafgi`. No code
written yet for this arc — was mid-reading `package.json` exports + `cli.ts` dispatch.

**CONTEXT:** a "compiled hook" = a hook authored as a PURE typed fn against a CLOSED
`vigiles/hook` API; vigiles compiles it. Proven across 3 probes (a sound gate/inject/react
FAMILY) in `src/core/hook-program.ts` — NOT yet on the public API. Full record + why it
matters: **`research/hook-pain-points.md`**. Reliability moat thesis: `harness-protocol-flow-moat.md`.

⚠️ **DELIVERY FLOOR — stay honest in EVERY doc.** Compile/verify fix the hook's AUTHORING +
LOGIC (correct, safe, AST-matched, capability-bounded, stamped). They do NOT fix DELIVERY:
CC's **#34692** (PreToolUse hooks DON'T fire for subagent tool calls; closed not-planned)
bypasses ANY compiled hook — incl. ours (guard-hook + the agent-runtime rail are PreToolUse
hooks too). So VERIFY (a claim about logic) survives the bug; GATE (live enforcement) is
capped MED. **Never claim "unbypassable."**

### STEP 1 — ship compiled hooks (dependency for honest docs)

- `src/hook.ts` barrel re-exporting the public vocab from `core/hook-program.ts` (mirror
  `src/unit.ts`): defineHook/defineFileGate/defineInject/defineReact, allow/deny/ask,
  inject/notice/run/nothing, tool/tools, commandView/pathView, decideProgram/runInject/
  runReact, compileHookProgram/checkHookImports/stampHook/verifyHookStamp, types.
- `package.json` exports: add `"./hook": "./dist/hook.js"`. Then `npm run api:report`.
- CLI (mirror `agentHookCommand` @ cli.ts:3982; dispatch switch @ 4319 / handleSkillCommand @ 4110):
  - `compile-hook <file>`: checkHookImports → on clean, emit the settings block + `stampHook`
    to a sidecar; throw HookCompileError on an out-of-API import.
  - `run-hook-program <file>`: the runtime the compiled settings command points at — import
    the program's default export, read stdin event (`readFileSync(0)`), dispatch by role:
    gate→decideProgram→`exit 2`+reason on deny; inject→runInject→print additionalContext JSON;
    react→runReact→spawnSync the classified `run` cmd. Load .mjs/.js via `import()`; TS via
    tsx like run-scripts (defer/note if heavy).
- Tests: e2e via `runHook` over `node dist/cli.js run-hook-program <fixture.mjs>` — gate denies
  `git push -f` (exit 2) + allows benign; inject emits additionalContext. build+vitest+lint+fmt; commit.

### STEP 2 — reposition docs (public + internal)

- README: top-line = **"deterministic reliability for the agent harness"**; cross-ref/Lint/Test
  become pillars under it; ADD compiled-hooks (now shipped) + the verify feature. Honest:
  verify=shipped, compile=shipped, GATE capped by #34692. README ≤200 lines, install above fold,
  promptfoo cost contrast. REWRITE, not a patch.
- Subdocs: `docs/harness-testing*.md`, `docs/verifying-instruction-files.md`, NEW
  `docs/compiled-hooks.md`; cross-link. Internal: CLAUDE.md `## Positioning` + research.
  Rules in play: readme-brevity, docs-quality, public-vs-internal-docs, rules-docs-in-sync.

### STEP 3 — Codex compiled-hook adapter (design first, in research/)

- The compiled-hook model is harness-NEUTRAL; per-harness EMIT goes through the HookProtocol
  port. Codex facts (`research/codex-prototype-findings.md` + `harness-landscape.md`): hooks in
  `config.toml [hooks]` (TOML not JSON), block via permissionDecision/exit-2 (HookProtocol
  ~identical to CC), event set differs (Codex HAS SubagentStart; Stop uses `continue:false`).
  OpenCode hooks are in-process TS modules = NATIVE fit. Design: `compileHookProgram` dispatches
  emit per layout/protocol (CC hooks.json vs Codex TOML); the typed program + decide/inject/react
  is shared. Write the design section before implementing.

## Shipped this session (pushed, tree clean @ 895809e)

- **COMPILED-HOOKS probe (`bd33aa4`/`3c00be5`/`890aa3e`):** `src/core/hook-program.ts` — the
  gate/inject/react family, AST matcher (`bash-effects.leafCommands`), checkHookImports, stamp.
  SOUND across shapes; NOT on public API (STEP 1 ships it).
- **VERIFY feature (`a5abf70`):** `src/guardrail-check.ts` on `vigiles/unit` — "prove your
  guardrail blocks" (DISASTER_CATALOG + verifyGuardrail + assertBlocksDisasters + neutral map).
  Honest: useful, lint-ish, NOT a moat. Dogfooded on disler/cc-hooks-mastery.
- **hook-spec spike (`d3471c0`)**; **5-pass hook research (`d24bfa6`)**; **guard-hook GATE
  (`959e88c`/`4336f4a`, EXPERIMENTAL/MED)**.
- **Prior (don't rebuild):** A1 sonnet debunks (caveman −18%/token-efficient −10%, SATURATED);
  V1 nesting STACK fix (`c50b826`); leaderboard v0.

## Gotchas

- Subagents NOT worktree-isolated; VERIFY their output (build+tests+run it).
- TS-encoding: per-edge check → shallow generated type O(N); whole-set uniqueness → JS generator.
- Conventional commits; build+vitest+lint+fmt:check before commit; `api:report` on public-surface
  change; recompile CLAUDE.md after editing its spec; cross-link research (orphan-docs lint);
  **NO session links / model IDs in commits**. HANDOFF ≤120 lines.
- Real-model tiers need sub auth + slow; deterministic work needs neither.

## Don't re-read unless the task needs it

- `research/hook-pain-points.md` — the hook corpus + compiled-hooks probe record (THE doc for this arc).
- `research/harness-protocol-flow-moat.md` — the reliability moat (ORDER/FLOW/REPLAY).
- `research/{roadmap,typed-spec-moat,measurement-authority}.md` — map + moat synthesis + the pivot.
- `research/codex-prototype-findings.md` + `harness-landscape.md` — Codex hook facts (STEP 3).
