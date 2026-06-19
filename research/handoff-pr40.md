# Handoff — PR #40 (`claude/os-plugin-bug-adoption-cy8j97`)

> Status (2026-06-19): branch is green and pushed; PR
> [#40](https://github.com/zernie/vigiles/pull/40) is **open**. This is the
> single place to resume from — what shipped, the disciplines that must carry
> forward, what's open, and a ready-to-paste next-session prompt.

## What this PR shipped

The "find bugs in popular OSS plugins → drive adoption" bet, built out end to end.

**Deterministic rule suite** (each: ONE shared detector reused by `scan` + `lint`
[+ `compileAgent` where relevant], high-precision, a `docs/rules/<name>.md`,
tests, a `scan` surface). New this PR:

- `agent-tool-contract` (+ deny-side `disallowed-tools-contract`)
- `mcp-tool-resolves` (the MCP half of the tool moat)
- `hook-events`, `hook-script-exists`
- `agent-frontmatter` (missing fields **and** invalid `model`/`color`),
  `skill-frontmatter`, `frontmatter-valid`
- `mcp-config`
- `description-overlap` (the NCD precision-proxy showpiece)

**Scanner** now runs on any cc/codex repo (not just plugins) + marketplace
leaderboard + ~8 false-positive classes fixed; section headers count entities,
not output lines.

**Refactor** — one lenient frontmatter reader (`src/core/frontmatter-read.ts`):
real js-yaml parse + regex salvage, replacing two divergent hand-parsers.

**Dogfood** — `src/scan-vendor.test.ts`: FP-guard on 3 clean vendored plugins +
a true-positive lock on one MIT bug fixture (`madappgang-frontend@6097ad4`); see
`examples/harness/vendor/SOURCES.md`.

**Research** (the durable record): `competitor-rule-matrix.md`,
`deterministic-rule-ideas.md`, `plugin-structural-findings.md`,
`plugin-behavioral-findings.md`, `oss-pr-drafts.md`.

Also on the branch (earlier): `scan --trigger` behavioral column + native-Codex
eval increments (trace parser / runner / `{evalDriver}` dispatch).

## Disciplines that MUST carry forward (the hard-won lessons)

1. **A structural verdict is a lead, not a finding.** Verify against reality
   (clone the repo, hand-check, or drive the real CLI) before claiming a bug.
   This corrected two wrong claims already (the "skills never fire" overclaim;
   the AskUserQuestion denylist — confirmed only via Anthropic #12890/#18721).
2. **High-precision or it's worthless.** Auditing third-party plugins means
   flag only high-confidence cases (never-available + close-typo, declared-set
   gating, built-in allowlists, plugin-namespace skips). A noisy rule that cries
   wolf can't drive adoption.
3. **Calibrate thresholds against the sweep**, don't guess (description-overlap
   cutoff 0.2 < the real most-similar-distinct pair 0.25; frontmatter-valid's 7%
   rate → shipped warn-only, not error).
4. **One detector, no drift** — `scan` and `lint` call the same function; the
   model-gated behavioral column is the only exception and never becomes a lint
   rule.
5. **Check the LICENSE before vendoring** a third-party file (ananddtyagi has
   none → not committed; MIT upstreams only).

## Open follow-ups (ranked)

1. **File the 3 upstream OSS PRs** — ready-to-apply recipe + worked diffs in
   `oss-pr-drafts.md` (can't be filed from a vigiles-scoped session). The
   adoption payoff.
2. **README positioning** — per `competitor-rule-matrix.md`: lead with the moat
   (linter-rule cross-ref + `mcp-tool-resolves` + harness testing), NOT the
   structural lints (Anthropic's `claude plugin validate` now ships those). Not
   yet done.
3. **Remaining backlog rules** (`deterministic-rule-ideas.md`):
   `mcp-hook-target-resolves`, `hook-matcher`, `duplicate-names` /
   reserved-MCP-name, `hook-shape`, `plugin-manifest`, `marketplace-sources`.
4. **Empirically verify CC's frontmatter parser** on a colon-in-`description`
   case — if CC rejects it, `frontmatter-valid` can graduate from warn→a
   confident check; if lenient, tighten the detector to unambiguous breakage only.
5. **Widen the bug-fixture set** — add a giuseppe (MIT) array-form
   AskUserQuestion slice to `examples/harness/vendor/` for a second true-positive.
6. **Live native-Codex eval run** (quota-gated) — the only remaining unproven
   bit of the Codex eval tier.

## Next-session prompt (paste this)

```
Repo: zernie/vigiles — continue on branch claude/os-plugin-bug-adoption-cy8j97
(PR #40, open). Read research/handoff-pr40.md first for full state.

Pick the next item from the "Open follow-ups" list — recommended order:
(2) README positioning rewrite (lead with the moat, not the structural lints —
see research/competitor-rule-matrix.md), then (3) the next backlog rule
mcp-hook-target-resolves (a `type: mcp_tool` hook action must name a declared
server — extends the moat). Follow the established pattern EXACTLY: one shared
detector in src/core/ reused by scan + a new lint rule, high-precision,
calibrated against /tmp/sweep (re-clone if gone) with hits HAND-VERIFIED before
claimed, doc in docs/rules/, tests, spec Key Files, cli.md table.

Conventions: npm run build; npx vitest run; npx vigiles compile CLAUDE.md.spec.ts
after spec edits; npm run fmt; rules default "warn"; commit per item with
Conventional Commits + push. No session URLs in commits/PRs.
```

## See also

- [deterministic-rule-ideas](deterministic-rule-ideas.md) — the ranked rule backlog.
- [competitor-rule-matrix](competitor-rule-matrix.md) — positioning + poach list.
- [oss-pr-drafts](oss-pr-drafts.md) — the upstream fixes, filing-ready.
- [plugin-structural-findings](plugin-structural-findings.md) — the sweep + disclosures.
