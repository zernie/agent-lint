# Structural findings — deterministic `scan` sweep of popular plugins

> Status: live findings log (2026-06-19). The **deterministic / structural**
> half of the "find bugs in popular OSS plugins" adoption bet
> ([distribution-strategy](distribution-strategy.md) E1,
> [divergent-bets](divergent-bets.md) #9) — sibling of the model-gated
> [plugin-behavioral-findings](plugin-behavioral-findings.md). Records what the
> free, no-model column (`vigiles scan` / [scan.ts](../src/scan.ts),
> [leaderboard.ts](../src/leaderboard.ts)) finds across real marketplaces — both
> the genuine plugin bugs (disclosures) and the scanner false positives the sweep
> exposed and we fixed (the dogfood value).

## The sweep

Scanned **~13 popular plugin marketplaces** (≈650 plugin entries; **444 unique
plugins** after de-aliasing) plus a **variant mix of cc/codex/both repos**, all
deterministically (no model, no key):

- **Marketplaces:** wshobson/agents (82), anthropics/claude-code (13),
  TheBushidoCollective/han (338→159), ananddtyagi/cc-marketplace (119),
  trailofbits/skills-curated (28), giuseppe-trisciuoglio/developer-kit (12),
  MadAppGang/claude-code (9), umputun/cc-thingz (7), numman-ali/n-skills (5),
  LerianStudio/ring (4), obra/superpowers-marketplace +
  anthropics/claude-plugins-community (curated, all-external).
- **Instruction-file variants:** claude-only (CLAUDE.md), codex-only (AGENTS.md —
  sst/opencode, openai/codex), and both (wshobson, obra, flow-next, n-skills, han).

**Robustness result:** zero crashes across all 444 plugins + the variant repos.

**Honest headline:** the popular plugins are **mostly structurally clean**. The
sweep's biggest payoff was not a pile of plugin bugs — it was exposing that the
scanner itself was crying wolf, and hardening it from noisy → trustworthy. A
scanner that flags working plugins as broken can't drive adoption; that had to be
fixed first.

## Public disclosures — genuine bugs in external plugins

Real, reproducible defects found in third-party plugins. Verified by hand against
the actual files (not just a scanner verdict — see the FP table below for why that
matters).

| Plugin                         | Bug                                                                                                                                                                   | Impact                                                                                                    | Status                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **ananddtyagi/cc-marketplace** | ~9 **subagents** (`changelog-generator`, `content-creator`, `growth-hacker`, `instagram-curator`, …) ship as **pure prose with no YAML frontmatter** (no `---` block); `accessibility-expert` has a **blank `description:`** | A subagent REQUIRES `name` + `description` (no fallback) → these **never register / can't be dispatched** | **Found 2026-06-19. Not yet reported upstream.** |
| **MadAppGang/claude-code**, **giuseppe-trisciuoglio/developer-kit**, **ananddtyagi/cc-marketplace** | Subagents list **`AskUserQuestion`** (and ananddtyagi's `codebase-documenter` lists **`ExitPlanMode`**) in their `tools:` contract. Affected: MadAppGang `frontend` (api-analyst, tester), `instantly` (×3), `nanobanana` (style-manager); giuseppe `developer-kit-core`, `developer-kit-typescript` | These tools are **never available to a subagent** — Claude Code **silently drops** them (confirmed by Anthropic [#12890](https://github.com/anthropics/claude-code/issues/12890) + [#18721](https://github.com/anthropics/claude-code/issues/18721)), so the author's intended capability is missing with no warning | **Found 2026-06-19. Verified via Anthropic issues. PR text drafted (see [oss-pr-drafts](oss-pr-drafts.md)).** |

> ⚠️ **Correction (2026-06-19).** An earlier version of this row claimed the
> SKILLS `crisis-debugging-advisor` / `meta-skill-router` "never fire" because
> they lack frontmatter. **That was wrong** — verified against the Claude Code
> docs: a SKILL.md needs NO frontmatter (`name` ← directory name, `description` ←
> first body paragraph), so a frontmatter-less skill still loads and can fire (at
> worst its fallback description is a weak trigger surface — a behavioral concern,
> not a structural one). The real, verified bug is the **subagents**: `name` +
> `description` ARE required for a subagent, with no fallback, so a prose-only
> agent file never registers. The `agent-frontmatter` rule was corrected to
> check agents only.

> ✅ **Empirically confirmed (2026-06-19, claude 2.1.183), not just doc-inferred.**
> Cloned the repo, dropped a real prose-only agent (`changelog-generator.md`)
> beside a control agent (proper frontmatter) in `.claude/agents/`, and drove the
> real `claude` CLI: (1) listing available subagents shows the control but NOT the
> prose-only one; (2) dispatching the prose-only one via the Task tool returns
> `NO_SUCH_AGENT`; (3) the control dispatches and runs. The mirror test confirms
> the skill side too — a frontmatter-less SKILL.md DOES load (listed via its
> directory name). So: prose-only agents are genuinely inert; prose-only skills
> are fine.

> Disclosure etiquette: report as a friendly issue/PR with the fix (add a
> `name` + `description` frontmatter block to each agent), link the `vigiles
scan` output. Keep it constructive — the goal is a working plugin, not a gotcha.

## Scanner false positives — found by the sweep, fixed

The sweep's main yield. Each was a real plugin that the scanner **wrongly**
flagged; each fix is verified against that plugin and carries a regression test.
This is the dogfood loop: real plugins are the test corpus that makes the scanner
trustworthy.

| FP class                                                                      | Exposed by                                                                       | Fix                                                                                                   | Commit    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| Command-only plugin scored `0/F` "no loadable surface"                        | anthropics/claude-code (`code-review`, `commit-commands`)                        | count commands + MCP toward the loadable-surface check                                                | `23ca5f6` |
| Curated marketplace reported as "empty machine / no issues"                   | obra/superpowers-marketplace, anthropics/claude-plugins-community (2200 entries) | `inspectMarketplace` classifies on-disk vs external; report "N external" honestly                     | `f458e0b` |
| Leaderboard double-counts name-aliased plugins (`338 scanned`)                | TheBushidoCollective/han (338 names → 159 dirs)                                  | dedupe member dirs by resolved path                                                                   | `f458e0b` |
| Multi-line **quoted** description mislabeled "no description / can't trigger" | trailofbits/skills-curated → `react-pdf`                                         | `readField` gathers indented quoted scalars, not just block scalars                                   | `78d77b0` |
| Relative `./hooks/x.sh` reported **MISSING** (file present)                   | ananddtyagi/cc-marketplace → `claude-dev-infrastructure`                         | resolve a relative hook path against the **plugin root**                                              | `78d77b0` |
| Existence-guarded hook (`[ ! -f x ] \|\| x`) flagged **MISSING**              | gmickel/flow-next                                                                | treat a guarded command as a conditional one-liner, not a hard ref                                    | `78d77b0` |
| Project/runtime path flagged as a dangling **plugin** ref                     | gmickel/flow-next (`$CLAUDE_PROJECT_DIR/.claude/hooks/…`)                        | `isPluginRooted` only flags bare or `${PLUGIN_ROOT}/…` refs, skips literal-nested + project/home vars | `78d77b0` |

**Known remaining FP (acknowledged, not fixed):** umputun/cc-thingz →
`plugins/planning` flags `agents/quality.txt` — it's an **argument** to a
`resolve-file.sh` script and the file lives at
`skills/exec/references/agents/quality.txt`. Fixing it (fuzzy-resolving a token
anywhere under the plugin) risks masking genuine dangling refs, so it's left as a
low-severity edge.

## Method / reproduce

Deterministic, offline, no model:

```bash
# clone a marketplace (or any cc/codex repo)
git clone --depth 1 https://github.com/<owner>/<repo> /tmp/x
npm run build
node dist/cli.js scan /tmp/x            # single plugin/repo, or a leaderboard for a marketplace
node dist/cli.js scan /tmp/x --json     # structured, for a defect-hunt script
```

The defect hunt iterates every unique plugin (expanding marketplaces via
`inspectMarketplace`) and collects only the HARD defects — missing hooks, broken
intra-plugin refs, no-description skills — then each candidate is **verified by
hand** against the files before it counts (the FP table is why). Every fix above
lands a regression test in `src/scan.test.ts` /
`src/adapters/claude-code/plugin-loader.test.ts`.

## Takeaways

1. **Verify before you claim.** Four of the first "bugs" were scanner FPs. A
   structural verdict is a lead, not a finding — confirm against the files.
2. **Real plugins are the test corpus.** The sweep hardened the scanner more than
   it indicted plugins; that's the right outcome for a tool meant to be trusted.
3. **Popular plugins are mostly clean structurally.** The sharper bugs live in the
   behavioral column (does a skill actually fire?) — see
   [plugin-behavioral-findings](plugin-behavioral-findings.md).

## See also

- [oss-pr-drafts](oss-pr-drafts.md) — ready-to-file PR/issue text for the
  verified bugs above (the adoption play).
- [competitor-rule-matrix](competitor-rule-matrix.md) — how vigiles's rules
  compare to agnix / claudelint / cclint / Anthropic's `claude plugin validate`,
  plus the poach backlog the sweep + landscape surfaced.
- [plugin-behavioral-findings](plugin-behavioral-findings.md) — the model-gated
  half (trigger-rate recall/precision on real plugins).
- [distribution-strategy](distribution-strategy.md) — E1: scan popular repos and
  publish findings; this is the structural half.
- [divergent-bets](divergent-bets.md) — #9 the plugin/skill leaderboard.
