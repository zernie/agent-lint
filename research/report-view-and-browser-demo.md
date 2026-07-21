---
status: active
topic: site
---

# Shared report view (`@vigiles/report-view`) + the in-browser demo

The plan for the "Grade a repo" IN-BROWSER demo on vigiles.sh and the shared
package it stands on. Stage 1 (the shared package) is SHIPPED; Stage 2 (the demo)
is the design of record below.

**In-browser, not hosted.** The audit compute runs entirely CLIENT-SIDE in the
visitor's browser — fetch the repo's files via the GitHub API from the browser,
run the pure deterministic detectors in JS, render via `@vigiles/report-view`. No
backend does the audit; the only "hosting" is static file serving on vigiles.sh
(GitHub Pages), exactly like the current site. This is what keeps "nothing leaves
your machine" literally true and the cost zero. (A cached-serverless fallback is
explicitly NOT the plan — in-browser is the plan.)

## Why a shared package (the invariant)

The audit report is rendered in three places — the CLI's HTML template
(`report/`), the landing `site/` (the hero report + the demo), and the future
in-browser demo. They MUST render the SAME `AuditReport` JSON through the SAME
components, never a screenshot and never a duplicated/relative-cross-imported
component. Fable's demo brief makes this load-bearing: the browser result and the
CLI result have to be visibly the same artifact, so running `npx vigiles audit`
locally feels like CONTINUING, not starting over. That is only true if one set of
components renders both.

## Stage 1 — `packages/report-view` (SHIPPED)

`@vigiles/report-view` (source-only, private, never published) holds the
presentational report components (`Report`, `Ring`, `RuleInventory`, `Adopt`,
`Adoptability`, `Observations`, the `ui/` primitives), the `AuditReport` schema
(mirrors `src/audit-report.ts` — the wire shape is pinned by
`src/audit-report.test.ts`), the band tokens (`lib/band.ts`), and a `theme.css`
consumers import. `report/` consumes it; `report/src` is now just `main.tsx` +
`index.css` (the app shell).

### Wiring — npm workspaces (the clean monorepo)

`packages/report-view`, `report`, and `site` are npm `workspaces` (root
`package.json` `"workspaces": ["packages/*", "report", "site"]`). `report`
depends on `"@vigiles/report-view": "*"`; npm symlinks it into the root
`node_modules` and hoists every workspace's deps to the root tree — so the
package's own deps (`clsx`, `lucide-react`…) resolve with zero config (no
`preserveSymlinks` workaround). ONE root `package-lock.json`; the per-package
`report/` + `site/` lockfiles are deleted.

Keeping the published `vigiles` package's CI gates green required four aligned
changes (the reason the skill flags this as "its own reviewed change"):

- **Root lockfile regen** — `npm install` after adding `workspaces`; a clean
  `npm ci` from it is verified to succeed (that is exactly what every CI job runs).
- **`pages.yml`** — the site step was `cd site && npm ci && npm run build`;
  `npm ci` in a workspace subdir fails (no per-package lockfile), so it is now
  `npm run build --workspace @vigiles/site` after the root `npm ci` installs its
  deps.
- **`build-report.mjs`** — its install-guard checked `report/node_modules`
  (now empty — deps are hoisted); it checks `root/node_modules/vite` and installs
  at the ROOT if missing, then builds the report workspace.
- **Sub-lockfile deletion** — `report/package-lock.json` + `site/package-lock.json`
  removed (workspaces use the one root lock).

The root `vigiles` package stays the published thing (its `files` array excludes
the workspaces; the private workspaces are never published); `npm ci`,
`tsc --noEmit` on `src/`, `eslint src/`, the api-surface gate, and the 100%
coverage gate are all unaffected — verified locally with a clean-room
`rm -rf node_modules && npm ci && npm run build`.

Tailwind v4 gotcha: it ignores `node_modules` for content detection, so a consumer
must `@source` the package's src or the components' utility classes get purged.
`report/src/index.css` does `@source "../../packages/report-view/src"` (the real
path) and `@import "@vigiles/report-view/theme.css"`.

## Stage 2 — the in-browser "Grade a repo" demo (design of record)

North star: every screen makes copying `npx vigiles audit` inevitable — the copy
event IS the tracked conversion. From Fable's blind design brief:

### Flow

1. **Zero-click entry.** The demo opens ALREADY showing a real BAKED `AuditReport`
   for a featured repo (e.g. `anthropics/claude-code`) — never a form-first empty
   state. Above it: an input + 3 cached chips (`anthropics/claude-code`,
   `obra/superpowers`, `wshobson/agents`) resolving <1s. Input parses a URL or
   `owner/repo`. One small reassurance, once: "Runs in your browser. Nothing
   leaves your machine."
2. **Real streaming audit log**, never a spinner: `▸ fetching tree… 1,842 files` /
   `▸ found harness: CLAUDE.md · 12 skills · 3 subagents · 5 hooks` / one line per
   ring. Each ring fills as its line lands. Target <~5s (1 Trees API call + raw
   fetches of only known harness paths).
3. **Result above the fold**: big grade + a truthfully-computed narrative hook
   ("Two one-line fixes away from a B." = top deductions removed → re-run
   `computeIntegrityScore` → real delta). Findings, each with a real file path +
   inline one-line fix. Then the locked card.
4. **Conversion moment = the locked card.** `npx vigiles audit` appears ONCE in the
   result (in the card) at peak curiosity, plus the persistent hero command.

### The gate/tease (honest by construction)

- REAL numbers are NEVER veiled: the grade, all five rings, every deterministic
  finding + fix. Blurring anything the browser DID compute is the dark pattern —
  never do it.
- The locked card ("Measured with a real model 🔒 — Do these skills actually
  FIRE?") shows the repo's REAL skill names with dashed `──%` placeholders behind a
  light frost (visibly not-yet-measured, never fake numbers). The reason is a plain
  capability fact: "A browser can't ask a model. Your CLI can — on your Claude
  subscription. No API key, no signup, nothing uploaded." No paywall vocabulary
  ("upgrade", "unlock Pro", "sign up") — the lock icon + "run it locally" IS the
  whole gate. If the repo has no skills, the card reframes to the deep
  linter-cross-reference tease.

### Edge cases (each still converts)

1. **No agent config** (most common): NEVER grade it (an F lies, an A lies). Show
   "No agent harness here… Try one that has one:" + chips + "Got one locally? `npx
vigiles audit`." Dead-end → redirect.
2. **A-grade repo** (weak fix-hook): pivot the hook to the locked "do your skills
   actually fire?" card; every result closes with "Now yours: `npx vigiles audit`."
3. **GitHub rate limit** (unauth 60/hr/IP): engineer around it — 1 Trees call +
   `raw.githubusercontent.com` (not API-rate-limited) + chips serve cached JSON.
   When hit, the failure IS the pitch: "the CLI reads your local checkout — no API,
   no limit."
4. **Tiny repo**: grade what exists; rings with no surface = n/a and EXCLUDED from
   the score (matches the real audit — a false 0 looks like a bug).
5. **Private/404**: "Private repos never belong in a browser demo — that's what the
   CLI is for." Convert on the privacy posture.
6. **Huge repo**: fetch only known harness paths, never tree contents.

### The one thing + two traps

- THE ONE THING: specificity = credibility. Real files, real skill names, real
  one-line fixes, a truthfully-computed "two fixes from a B." Skeptics bounce the
  instant anything reads canned — which is exactly why the demo renders the real
  `AuditReport` through `@vigiles/report-view`.
- Trap 1: the gate reading as a paywall (one un-computed blurred number, one
  "unlock" without the plain reason → tool dismissed as growth-hacked).
- Trap 2: crowding the funnel (share buttons, score-badge embeds, "track your
  score" signup, ring-math explainers, a second CTA all compete with the copy
  button). One primary action per screen.

### Build notes

- Deterministic detectors only. Render from `@vigiles/report-view` (Stage 1 — done).
- Chip results baked/cached at build time. Instrument three events (command copied,
  chip clicked, repo submitted); funnel = copies ÷ visitors. (Analytics provider a
  founder decision — GoatCounter rec / Plausible / Fathom, NOT Vercel on Pages.)

## Stage 2 build plan — the in-browser audit engine (the port)

The key finding from mapping the port: **every deterministic detector reduces to a
Set-membership / content lookup over a `Record<string,string>` file map** — no
detector needs anything a fetched-file map can't give (no stat/mtime/symlink/dir
listing beyond `Object.keys`). And `auditScore`/`buildAuditReport` are 100% pure
over the `ScanReport` — ZERO changes. So the whole port is ONE new seam plus two
small library refactors.

**The seam** — `scanFiles(files: Record<string,string>, layout?, dialect?): ScanReport`
(mirrors `scanPlugin(dir,…)` in `src/scan.ts`). It (a) reconstructs the
`LoadedPlugin` shape (`{settings.hooks, files, warnings, sources}` — `src/plugin-loader.ts:39`)
from the in-memory map instead of a disk walk, then (b) runs the SAME pure detectors
`scanPlugin` runs, then (c) calls `auditScore`/`buildAuditReport` unchanged. Every
fs call in `scanPlugin` maps to a lookup: `existsSync(p)`→`p in files`,
`readFileSync(p)`→`files[p]`, "is a directory"→`Object.keys(files).some(k=>k.startsWith(p+"/"))`.
The three DI-shaped detectors MUST be passed file-map impls (they default to node):
`skillResourceIssues({existsSync})`, `pluginDirLayoutIssues({existsSync,isDirectory})`,
`hookBlockIssues({readFileSync})`. `findUntestedSurfaces` (`src/test-coverage.ts`) is
wholly disk-based → reimplement its globs as in-memory `Object.keys().filter()`.
`verifyLiveMcpTools` (spawns servers) is NOT called by scanPlugin — exclude.

### Making the engine node-free — module splitting, NOT bundler stubs (the decision)

The browser bundle must not statically reach `node:fs`/`node:crypto`/`node:child_process`/
`@ast-grep/napi`/`glob`. Three ways to get there were weighed; the choice is
load-bearing enough to record, because the obvious two are wrong here:

- **Bundler stubs (REJECTED — "hacky").** Vite `resolve.alias` mapping `node:fs`→a
  no-op, `@ast-grep/napi`→empty, etc. Fails on two counts: (1) a stub that gets
  _called_ silently returns wrong data → the browser grade diverges from the CLI,
  and the Node-run parity test can't see it; (2) it's build-config spooky-action for
  what is really an architecture problem. A "throwing" stub is louder but still rests
  on a fragile "never reached" invariant.
- **Dynamic-import adapters (REJECTED — wrong tool).** `await import()` selects a
  node-vs-browser impl for code you _call_ at runtime. But our node deps are
  **transitive-DEAD** on the `scanFiles` path — never invoked in the browser, only
  _static sibling imports_ inside modules whose _pure_ functions we reuse. Lazy-loading
  dead code adds async-coloring to a sync engine for zero benefit **and still requires
  splitting the module** to make the node part lazy. It doesn't actually solve it.
- **Module splitting (CHOSEN).** Extract the pure logic into node-free leaf modules
  that BOTH the disk engine and the browser engine import — the repo's own hexagonal
  `core ⊄ adapter` rule, and the pattern already used for `editDistance`. This removes
  the node deps from the static graph entirely: no stub, no dynamic import, no
  silent-divergence risk.

**How the graph was mapped (reusable method):** trace the compiled `dist/` CJS
require-graph (follow `require()` edges only — `import type` is elided by tsc, so a
source-level trace over-reports). Finding: **`scan.js` is the single runtime bridge**
to the whole node-only set (`plugin-loader`→crypto/fs, `core/mcp`→child_process +
`refs`→`symbols`→`@ast-grep`, `test-coverage`→glob), so one `scan-core` extraction
removes all of it.

**The splits:**

1. `editDistance` → zero-dep leaf `core/edit-distance.ts`; `scan.ts` repointed off
   `core/linters.ts` (glob/`node:module`). **DONE (merged / this branch).**
2. `ncd` (+ its gzip helper) → node-free leaf `core/ncd.ts`; `description-overlap`
   imports it, so `proofs.ts`→`hash.ts`'s `node:crypto` leaves the graph. Uses
   `TextEncoder` (not `Buffer`) so the byte input is identical Node/browser. **DONE.**
3. Pure detectors → node-free `scan-core.ts`; `scan.ts` re-exports them (`export *`)
   so every existing consumer is unchanged; `scan-files.ts`/`test-coverage-files.ts`
   import from `scan-core`. Drops `scan.js` (and its whole node subtree) from the
   browser graph. Plus: `node:fs` defaults made _required-IO_ in
   `hook-block-ineffective.ts`/`plugin-dir-layout.ts` (only callers are the two
   engines; browser injects map-backed impls); `mcpContractToolMessage` (pure) → leaf
   `core/mcp-contract-message.ts` (keeps live `verifyMcpContractTools`'s spawn in
   `mcp.ts`); `node:path` → a POSIX-only string helper `posix-path.ts`. **DONE (final
   module list to confirm post-verification).**

**What legitimately remains** (not stubs — real cross-platform implementations):

- `node:zlib` (via `ncd`) → aliased to **`pako`** in the Vite build. Pako _is_ zlib in
  JS; `TextEncoder` bytes in → same gzip length out. The ONE alias.
- Pure-JS libs that bundle natively: `@iarna/toml`, `js-yaml`, `mvdan-sh`.
- The one genuine runtime _difference_ (exists-on-disk vs in-map) is handled by
  **dependency injection** (the `exists`/`readFileSync`/`existsSync` params) — sync,
  explicit, the correct adapter; no dynamic import.

**Correctness firewall.** `src/scan-files.test.ts` byte-compares `scanFiles(map)`
against the CLI's `scanPlugin(dir)` on 4 real vendored plugins — kept green + unchanged
through every split. Gap it doesn't cover: it runs in **Node** (real zlib), so a
`pako`-vs-node compressed-length difference in `ncd` wouldn't show. Close it with a
**Vitest browser-mode parity test** (run `scanFiles` in-browser with pako, assert the
`AuditReport` equals the Node one on a fixture). In practice `description-overlap` is
almost always empty on real plugins (cutoff below the most-similar legit pair), so
divergence is rare and both answers are defensibly-correct proxies — but the
browser-mode test is what lets us _claim_ byte-identical.

### Site ↔ engine integration

`@vigiles/report-view` is a source-only workspace (extensionless imports, Vite-native).
The vigiles core uses Node16 `.js`-specifier imports (Vite won't resolve those from
source), so the site consumes the engine's **built `dist/` (CJS)** instead — which also
gives the strongest credibility story: the browser runs the _literally-same compiled
code_ the CLI runs, plus the one `zlib→pako` alias. (Spike the exact wiring against a
real `cd site && npm run build` before building the UI on top.)

### Status (this branch)

- **Demo with BAKED reports — SHIPPED (#99).** `DemoAudit.tsx` renders real
  `AuditReport`s (baked via `audit --json` over `test/dogfood/*`) through
  `@vigiles/report-view` + repo chips + the honest model-gated tease. Fixes the mobile
  `#try` dead-end.
- **Node-free engine — IN PROGRESS.** The splits above; `scanFiles` + the byte-identical
  parity gate landed.
- **LIVE any-repo — NEXT.** Vite bundle (pako alias) + in-browser GitHub fetch (Trees
  API + `raw.githubusercontent.com`, harness paths only) + the Fable live-typing UX +
  the 3 test layers (engine parity ✓, Vitest browser-mode interaction + parity, one
  Playwright e2e with mocked network).
