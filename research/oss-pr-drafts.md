---
status: idea
topic: audit
---

# OSS PR / issue drafts — verified bugs found by `vigiles scan`

> Status: ready-to-file (2026-06-19). Each is a REAL, hand-verified defect in a
> third-party plugin found by the deterministic sweep
> ([plugin-structural-findings](plugin-structural-findings.md)). Filing these is
> the adoption play (distribution-strategy E1): a constructive, one-line-fix PR
> that credits `vigiles scan` is a credible advertisement. Keep it friendly — the
> goal is a working plugin, not a gotcha.
>
> NOTE: these can't be filed from the vigiles dev session (GitHub access is scoped
> to `zernie/vigiles`). File manually, or from a session scoped to those repos.

## Disclosure etiquette

- Open an **issue first** (or issue + PR) with the concrete fix.
- Lead with the user-visible impact, then the one-line fix, then the citation.
- Cite the upstream Anthropic issue, not vigiles's source, as the authority.
- Offer the PR; don't demand. One plugin, one issue.

---

## Bug 1 — `AskUserQuestion` / `ExitPlanMode` in subagent `tools:` (silently dropped)

**Repos / files:**

- `MadAppGang/claude-code` — `plugins/frontend/agents/{api-analyst,tester}.md`,
  `plugins/instantly/agents/{campaign-analyst,outreach-optimizer,sequence-builder}.md`,
  `plugins/nanobanana/agents/style-manager.md` (all list `AskUserQuestion`)
- `giuseppe-trisciuoglio/developer-kit` —
  `plugins/developer-kit-core/agents/document-generator-expert.md`,
  `plugins/developer-kit-typescript/agents/typescript-documentation-expert.md`
  (both list `AskUserQuestion`)
- `ananddtyagi/cc-marketplace` — `plugins/codebase-documenter/agents/codebase-documenter.md`
  (lists `ExitPlanMode`)

**Issue title:** `Subagent lists a tool Claude Code can't grant it (AskUserQuestion)`

**Issue body (template):**

> **Impact:** `<agent>.md` declares `AskUserQuestion` in its `tools:` list, but
> Claude Code does **not** make `AskUserQuestion` available to subagents — it
> silently filters the tool out at dispatch. The subagent never gets the
> capability the author intended, and there's no warning, so the bug is invisible
> until the agent fails to ask. Same applies to `ExitPlanMode`/`EnterPlanMode`,
> `Agent`, `ScheduleWakeup`, `WaitForMcpServers`.
>
> Confirmed by Anthropic: anthropics/claude-code#12890 (AskUserQuestion not
> available to subagents) and anthropics/claude-code#18721 (missing warning for
> the limitation).
>
> **Fix:** remove `AskUserQuestion` (and `ExitPlanMode`) from the subagent's
> `tools:` line. If the workflow truly needs to ask the user, that has to happen
> in the main agent, not the subagent.
>
> Found with `vigiles scan` (deterministic plugin checker). Happy to send a PR.

**PR (one line per agent):** delete the offending token from the `tools:` frontmatter.

---

## Bug 2 — prose-only / blank-`description` subagents that never register

**Repo / files:** `ananddtyagi/cc-marketplace` — ~9 agents under
`plugins/*/agents/*.md`: `changelog-generator`, `content-creator`,
`growth-hacker`, `instagram-curator`, `desktop-app-dev`,
`model-context-protocol-mcp-expert`, `reddit-community-builder`,
`twitter-engager` (no `---` frontmatter at all), plus `accessibility-expert`
(has `name` but a **blank** `description:`).

**Issue title:** `Subagents missing required frontmatter won't register`

**Issue body (template):**

> **Impact:** A Claude Code subagent REQUIRES `name` + `description` frontmatter —
> there's no fallback (unlike a SKILL.md, which falls back to the directory name /
> first paragraph). The agents listed above ship as pure prose with no `---`
> block (or with an empty `description:`), so Claude Code never registers them:
> they don't appear in the subagent list and dispatching one via the Task tool
> returns `NO_SUCH_AGENT`.
>
> **Verified** (claude 2.1.183): dropped a prose-only agent beside a control with
> proper frontmatter — the control lists/dispatches, the prose-only one does not
> (`NO_SUCH_AGENT`).
>
> **Fix:** add a frontmatter block to each agent file:
>
> ```yaml
> ---
> name: changelog-generator
> description: <one line describing when to use this agent>
> ---
> ```
>
> Found with `vigiles scan`. Happy to send a PR adding the frontmatter.

**PR:** prepend the `---` block (name from the directory, description from the
first prose line) to each agent; fill `accessibility-expert`'s blank description.

---

## Filing recipe (ready-to-apply)

> Status: these target external repos, so they CANNOT be filed from a vigiles dev
> session (GitHub scope = `zernie/vigiles`). File from a session/checkout scoped
> to each repo, or by hand. Each fix below is mechanical and one commit.

Per repo:

```bash
git clone https://github.com/<owner>/<repo> && cd <repo>
git checkout -b fix/subagent-tool-contract
# apply the edit(s) below
git commit -am "fix: remove AskUserQuestion from subagent tools (Claude silently drops it)"
gh pr create --title "fix: remove AskUserQuestion from subagent tools" --body-file - <<'BODY'
<the issue body from Bug 1 above>
BODY
```

### Worked diff — Bug 1, comma form (MadAppGang `tester.md`)

```diff
-tools: Bash, Glob, Grep, …, KillShell, AskUserQuestion, Skill, SlashCommand, mcp__chrome-devtools__click, …
+tools: Bash, Glob, Grep, …, KillShell, Skill, SlashCommand, mcp__chrome-devtools__click, …
```

Just delete the `AskUserQuestion,` token (and `ExitPlanMode,` for ananddtyagi's
`codebase-documenter`). Same for the **array form** (giuseppe
`developer-kit-core/agents/*.md` — `tools: [Read, …, AskUserQuestion]` → drop the
trailing `, AskUserQuestion`).

### Worked diff — Bug 2, missing frontmatter (ananddtyagi `changelog-generator.md`)

```diff
+---
+name: changelog-generator
+description: Analyze git history and conversation context to produce a clear, organized changelog over a given time range.
+---
+
 You are an expert technical documentation specialist with deep expertise in …
```

`name` ← the directory name; `description` ← a one-line summary of the first prose
paragraph. For `accessibility-expert`, fill the existing blank `description:`
instead of prepending a block.

## Not filed (verified NON-bugs / noise)

These the scanner flagged but hand-verification showed they are **not**
reportable — recorded so we don't re-chase them:

- `MadAppGang/claude-code` `tools/claudeup-core/src/__tests__/fixtures/invalid-plugin/…`
  — an intentional **test fixture** named `invalid-plugin`. The detector working,
  not a bug.
- `openai-codex/codex-rs` — the Codex Rust **source tree** (no `.claude-plugin`
  manifest); the `hooks/`, `skills/`, and `core/templates/.../orchestrator.md`
  hits are source/templates, not a shipped plugin.
- `gmickel/flow-next` `plugins/flow-next/codex/agents/AGENTS.md` — a Codex-shaped
  subdir scanned under the CC layout; low-confidence, not chased.

## See also

- [plugin-structural-findings](plugin-structural-findings.md) — the sweep + the
  disclosures table these expand.
