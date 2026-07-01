---
status: shipped
topic: hooks
---

# How a plugin delivers context to the agent — CC vs Codex (verified)

> Research of record (2026-06-30). The authoritative answer to "how does vigiles
> make the agent **aware** of a workflow (e.g. the eval lock), per harness?" —
> captured ONCE so we stop re-deriving it. Verified against current
> code.claude.com docs (via the claude-code-guide agent) for Claude Code and this
> repo's own validated Codex research for Codex. Cited from `CLAUDE.md` keyFiles
> and the per-adapter testing guides; the user-facing slice lives in
> `docs/harness-testing-claude-code.md` / `docs/harness-testing-codex.md`.

## The one-line answer

**A plugin cannot ship an always-on instruction blob. There is no plugin-level
CLAUDE.md / AGENTS.md that the harness auto-loads.** The always-on file is the
**user's project** instruction file; the plugin's own channels are **skills**
(on-demand) and **hooks** (event-driven). So a tool delivers persistent awareness
by (a) a skill the agent reaches for, and (b) a hook that injects context — NOT by
editing the user's CLAUDE.md (invasive) and NOT via a plugin instruction file
(doesn't exist).

## Claude Code (verified against code.claude.com, 2026-06-30)

| Question                                                     | Answer                                                                                                                                                                                                                                | Source                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Plugin-level CLAUDE.md / instructions field that auto-loads? | **No.** The only auto-loaded plugin-root file is `settings.json` (default settings, not context).                                                                                                                                     | `plugins.md` (plugin-structure-overview)    |
| Project-root `CLAUDE.md` always loaded?                      | **Yes** — first ~200 lines / 25KB at session start. (It's the _user's_ file.)                                                                                                                                                         | `how-claude-code-works.md`                  |
| Skill descriptions always in context?                        | **Yes** (so the model can select); **bodies load only on invocation**. `disable-model-invocation: true` hides the description.                                                                                                        | `skills.md` (content lifecycle)             |
| Plugin-side persistent context WITHOUT editing CLAUDE.md?    | **Only via a hook** — a `SessionStart` hook emitting `hookSpecificOutput.additionalContext`. Runs every session + on resume; works with `${CLAUDE_PLUGIN_ROOT}`; the text stays in context all session (auto-compaction respects it). | `hooks.md` (SessionStart example)           |
| Best hook for an event-fresh _nudge_?                        | **PostToolUse** (matcher on the edit) injecting `additionalContext` / a `type: prompt` — fresher than SessionStart for "you just did X, remember Y".                                                                                  | `hooks.md` (UserPromptSubmit / PostToolUse) |

The exact SessionStart inject shape:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "…"
  }
}
```

**Vigiles' choice for the eval lock:** a **PostToolUse** nudge hook
(`hooks/eval-lock-nudge.sh` → `vigiles hook-runtime eval-lock-nudge`) that injects
`additionalContext` after a `SKILL.md`/`*.eval.*` edit, self-gated on a committed
lock. Event-fresh, non-blocking, no edit to the user's file. (A SessionStart
always-on variant is possible but deferred — the PostToolUse nudge fires exactly
when staleness is introduced, which is what matters.)

## Codex (this repo's validated research)

| Question                              | Answer                                                                                                                                                                                                                                                                                                                                                                                                             | Source                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Instruction file                      | **`AGENTS.md`** — the CLAUDE.md analog, always loaded. And the _normal_ Codex convention for tool guidance (no marketplace), so an `AGENTS.md` note is far less unusual on Codex than a CLAUDE.md edit is on CC.                                                                                                                                                                                                   | `harness-landscape.md`       |
| "Plugins"?                            | No marketplace; **skills** install via the cross-agent skills CLI into a global store (`~/.agents/skills/`), and **hooks** live in `config.toml [hooks]`.                                                                                                                                                                                                                                                          | `harness-landscape.md`       |
| Hook events                           | `SessionStart`, `PreToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStart/Stop` — near-1:1 with CC, JSON on stdin.                                                                                                                                                                                                                                                                                                  | `harness-landscape.md`       |
| Hook **block** (deny)                 | **Shared** — `exit 2` vetoes identically to CC. The compiled-hook gate runtime already works on Codex.                                                                                                                                                                                                                                                                                                             | `compiled-hooks-codex.md` §3 |
| Hook **inject** (`additionalContext`) | **CONFIRMED — same shape as CC.** Per the official Codex hooks docs (`developers.openai.com/codex/hooks`), `additionalContext` is honored on `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart` (NOT `Stop`/`SubagentStop`/`PreCompact`). The PostToolUse eval-lock nudge reaches the agent on Codex just as on CC. **react** OUTPUT shape is the one still CC-confirmed-only piece. | official Codex hooks docs    |

**Implication for the eval-lock nudge on Codex:** the PostToolUse hook _fires_ AND
its `additionalContext` reaches the agent (PostToolUse is in Codex's injectable
events). So on Codex all three awareness channels work: the **skill**, an optional
**`AGENTS.md` one-liner** (the Codex norm), and the **hook-delivered nudge**. This
is now **encoded** in `HookProtocol.injectableEvents` — a `shellHooks` adapter that
can't inject fails conformance, so the gap can't recur silently (the original miss
was a prose deferral, not a tested contract). The remaining CC-only piece is
**react** output (`compiled-hooks-codex.md` §4).

**How the nudge is DELIVERED on Codex (now wired, not manual):** Claude Code gets
these hooks from its global marketplace plugin (`~/.claude/plugins/`, no repo
files). Codex has **no global plugin store**, so `vigiles init` writes the two
nudge hooks (eval-lock + refs) into the repo's **`.codex/config.toml`**
(`codexPluginHooks` / `applyCodexPluginHooks` → `wireCodexHooks` in cli.ts) — the
idiomatic, repo-committed place for Codex config. They run as **direct
`npx vigiles hook-runtime …` commands** (no plugin root / vendored bash script):
the runtime entrypoint reads the event JSON on stdin and prints the
`hookSpecificOutput.additionalContext` shape. Safety: only an _intentional_ `exit
2` blocks an edit (the refs nudge under `unmarked-refs: error`); an npx-resolution
failure exits non-2, so a missing dep never blocks. The merge is idempotent and
preserves the user's own Codex hooks + every other config key. STILL manual on
Codex (a loud, documented deferral — no-silent-skips): the SessionStart lint
**summary** (CC delivers it as plain stdout, whose SessionStart prepend is
unconfirmed on Codex) and the **compile-on-edit / pre-edit-block guards**
(filename-gated bash with no harness-neutral `hook-runtime` entrypoint yet).

## The portable decision (what this means for any vigiles feature)

1. **Never edit the user's CLAUDE.md/AGENTS.md from a plugin/`init`** to convey a
   workflow — it's invasive and (for CC) not idiomatic. An `AGENTS.md` one-liner is
   an acceptable _opt-in_ on Codex (its norm), never a forced write.
2. **Skill = the portable floor.** Description always-in-context (CC) + body on
   invocation; installs on both harnesses. Put the workflow knowledge here.
3. **Hook = the proactive layer.** PostToolUse inject for an event-fresh nudge;
   SessionStart inject for always-on. **Block AND inject work on both harnesses**
   (inject on each harness's declared `injectableEvents`); only **react** output
   is still CC-confirmed-only — state that caveat wherever a react hook relies on it.
4. **The hard gate stays in CI** (`eval --check`) — hooks/skills are nudge-level,
   never the enforcement.

See `docs/harness-testing-claude-code.md`, `docs/harness-testing-codex.md`,
`research/compiled-hooks-codex.md`, and `research/harness-landscape.md`.
