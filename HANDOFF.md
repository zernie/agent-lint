# HANDOFF — volatile cross-session state

> Overwrite each session; keep ≤120 lines. Durable map = `research/roadmap.md`.
> The SessionStart hook injects this so a new session starts oriented. Read first.

## RESUME HERE — public-API curation + CC-2.1.187 dialect refresh + CI pin (2026-06-24)

Branch `claude/readme-duplication-cleanup-l1wc5n` (PR **#45** → main), latest
`13bc3fd`, tree clean. All work pushed. CI was GREEN on `70124eb` (run 410, 0
failed jobs); `13bc3fd` (the CI pin) triggers a fresh run — confirm it's green.
No open code task; pick up a NEW direction (or just verify the PR + maybe merge).

### SHIPPED this session (don't rebuild)

- **Barrel curation (`08d8c4f`).** `src/testing.ts` + `src/linting.ts` went from
  `export *` to CURATED named re-exports — internal seams (`*With` DI runners,
  low-level `parse*`, pool/aggregate/model-tier helpers, the linter ENGINE) no
  longer leak into the public `.d.ts` / api-extractor reports / TypeDoc site.
  testing api report −190 lines; TypeDoc 465→407 pages. `etc/*.api.md` regenerated.
  Breaking (`refactor(api)!`) but we have ~no users.
- **No-barrel-imports ESLint rule (`e63a5d2`).** Built-in `no-restricted-imports`
  bans internal imports of the public barrels (linting/testing/unit/integration/
  e2e/hook/claude-code/codex) — `${name}.js` at any depth; `adapter` omitted
  (basename collides w/ core/adapter + adapters/*/adapter). NOT the
  `eslint-plugin-barrel-files` plugin: it calls ESLint-9-removed
  `context.getFilename()`, crashes on ESLint 10 (prefer-existing-solutions).
- **CC dialect refresh → 2.1.187 (`135e9bd`).** The gated dialect-drift alarm fired
  in CI because CI installed a newer CC than the 2.1.42 baseline. Refreshed
  `ACKNOWLEDGED_TOOL_INPUT_TYPES` (19→38; agent-platform tools added, `Config`
  removed) + `VALIDATED_CC_VERSION="2.1.187"`. **CC ≥ ~2.1.18x ships a NATIVE
  BINARY** (`bin/claude.exe` from a platform `optionalDependencies` pkg) — **no
  readable `cli.js`** — so the hook-event text-scan now degrades to a LOUD SKIP via
  new `findClaudeCodeBundle()`; the `sdk-tools.d.ts` tool-type alarm still works.
  New platform tools (Cron/Task-CRUD/Workflow/Monitor/Worktree/…) are HOST tools,
  NOT subagent-grantable → `builtinAgentTools` intentionally UNCHANGED.
- **refs-nudge fix + self-command-refs `${CLI}` (`70124eb`).** `examples/harness/
  refs-nudge.harness.mjs` called the pre-rename `refs-hook` (now `hook-runtime
  refs`) → "Unknown command", nudge never delivered (the `harness` job's only red).
  Fixed + taught `self-command-refs` the `node ${CLI} <cmd>` invocation form (it
  only knew `vigiles`/`cli.js` literals, so this class slipped through). Unit test
  added; repo dogfood + 46 real `${CLI}` usages stay clean.
- **CI pin (`13bc3fd`).** Pin `@anthropic-ai/claude-code@<VALIDATED_CC_VERSION>` in
  every real-binary job (test/harness/e2e), **grepped from `src/dialect-drift.ts`**
  so the constant is the SINGLE knob. Alarm now fires only on a DELIBERATE bump;
  real-claude tiers reproducible. Runtime warn already existed (`vigiles scan` →
  checkDialectDrift/formatDialectDrift, ⚠ only on real tool-surface drift).

### Decisions of record (don't relitigate)

- **Do NOT `import type` the Claude SDK tool types.** Both `@anthropic-ai/
  claude-code` AND `@anthropic-ai/claude-agent-sdk` are "© Anthropic PBC. All
  rights reserved." (proprietary). vigiles is MIT + multi-harness → read the
  user's LOCAL `sdk-tools.d.ts` (ToS-clean) + a hand-authored list of bare
  identifiers (facts). There IS a clean `ToolInputSchemas` union on `./sdk-tools`,
  but taking the dep is rejected (license + core⊄adapter + wrong vocabulary).
- **Bump `VALIDATED_CC_VERSION` + `ACKNOWLEDGED_TOOL_INPUT_TYPES` TOGETHER** when CC
  drifts; CI installs that exact version, the gated test cross-checks them.

### Gotchas

- This is "Claude Code on the web" remote env: GitHub via `mcp__github__*` tools
  (NO `gh` CLI); MCP can flap (reconnects). `claude` CLI in the container is for
  harness tests only — I upgraded it to 2.1.187 to match CI; that's fine.
- Build+vitest+lint+fmt:check before commit; `api:report` on any public-surface
  change; recompile CLAUDE.md after editing its spec. Conventional commits + the
  `!` on breaking. **NO session links / model IDs in commits.** Wait for the FULL
  test run before committing (1585 pass / ~13 skip / 0 fail is the clean baseline).
- Coverage gate (`npm run coverage`) is 100% lines/funcs/stmts, 90% branches,
  scoped to an explicit `include` list in vitest.config.mjs (dialect-drift NOT in it).

## Don't re-read unless the task needs it

- `research/code-adapter-architecture.md` — the dialect-drift + CI-pin design record.
- `research/roadmap.md` — the durable Now/Next/Later map.
- `docs/compiled-hooks.md` / `research/compiled-hooks-codex.md` — compiled hooks (prior arc).
