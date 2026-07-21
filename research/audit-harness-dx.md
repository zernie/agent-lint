---
status: deferred
topic: audit
---

# Audit harness DX — detection, multi-harness, performance, cost

> **SCOPE DECISION (2026-07-21): DEFERRED. `vigiles audit` is CLAUDE-CODE-FOCUSED for
> now.** Multi-harness audit DX (audit-both, the AGENTS.md-≠-Codex detection fix,
> shared-vs-specific factoring), the hosted in-browser demo, and the shared-component
> monorepo refactor are all OUT OF SCOPE for the current iteration — deliberately, to
> keep the bite reasonable. Codex deterministic audit stays SUPPORTED via
> `--harness=codex` (it ships + is tested) but is not the focus. This doc PRESERVES the
> full thinking + research so we can resume without re-deriving it. Nothing here is
> implemented yet.

## Why deferred

The founder's read: the multi-harness questions below have too many forks to settle
inside a "clear update to audit + website" bite. Narrowing audit to Claude Code
simplifies the story; the rest becomes iterative follow-up. See `roadmap.md` (Later).

---

## Bottom line (the forks, when we revisit)

1. **Detection is the weak link.** File markers conflate a SPECIFIC harness
   (`CLAUDE.md`, `.codex/config.toml`) with a GENERIC standard (`AGENTS.md` — an
   AAIF/Linux-Foundation standard read by 20+ tools, NOT Codex). Robust detection needs
   precedence (explicit config → native-only markers → `CLAUDE.md` → `AGENTS.md`-as-
   agnostic → mirror-collapse → none), plus a read-vs-run split.
2. **"Audit both" is mostly a mirage.** The bulk of the checks are harness-AGNOSTIC —
   compute the shared work ONCE, run the small dialect-specific slice PER detected
   harness. Never a doubled near-identical report.
3. **Read-vs-pick.** `audit` is a read → report on everything found, never ask.
   Pick-verbs (`compile`, single-target `lint`) → flag → config → ask ONLY at a TTY,
   never prompt non-interactively (agents/CI must not hang).
4. **Performance splits three ways.** Local deterministic is surface-scoped + fast
   (cost ∝ #surfaces + #refs, not repo LOC). In-browser is NETWORK-bound (GitHub API)
   → parallel fetch + a staged progress bar. The LLM tier (trigger-rate) is the real
   cost — time ∝ skills × trials, rate-limited.
5. **Cost/auth is a safety gap.** When CC/Codex are authed via a METERED API key, the
   model-gated audit spends real credits — warn (or extra-confirm). On a subscription
   it's $0. We already have `hasModelAccess` / `isMeteredAccess`.

---

## 1. What "detect the harness" actually means — and the trap

Two questions hide under "which harness":

- **STRUCTURAL** — "which harness does this repo's _config target_?" Answered by files
  in the repo. All a read-only audit needs.
- **RUNTIME** — "which harness binary is installed, and in what auth mode?" Answered by
  `which claude` / `which codex` + probing auth. Only the EXECUTING checks (live MCP,
  trigger-rate) need this — and it's where cost lives.

Today we only do the structural question, via file markers, and use it for everything.

## 2. Detection — why file markers alone are weak (research-backed)

**Current** (`detect(root): number`, specificity score): CC = `.claude-plugin/` ·
`.claude/settings.json` · `CLAUDE.md`; Codex = `.codex/config.toml` · `AGENTS.md`.
`detectAdapterResult` → highest-specificity winner + `ambiguousWith`.

**Findings (a research pass over the ecosystem, mid-2026):**

- **`AGENTS.md` is NOT Codex.** It's an open standard formalized Aug 2025 (OpenAI +
  Google/Cursor/Sourcegraph/Factory), donated Dec 2025 to the **Agentic AI Foundation**
  (Linux Foundation; platinum members incl. Anthropic, Google, Microsoft, OpenAI, AWS).
  It's read natively by **20+ tools** — Codex, Cursor, Aider, Gemini CLI, Amp, Windsurf,
  Devin, Jules, Zed, Copilot, OpenCode, Warp, RooCode, and (opt-in) Claude Code — across
  **60k+ repos**. So `AGENTS.md present ⇒ Codex` misclassifies the majority of repos
  that ship it. `AGENTS.md` means "a portable/standard instruction file," harness
  undetermined. (agents.md; Linux Foundation AAIF release.)
- **`CLAUDE.md` is near-exclusive to Claude Code.** Anthropic's docs: _"Claude Code
  reads `CLAUDE.md`, not `AGENTS.md`."_ Its presence is a strong, low-false-positive
  signal. (Lone exception: OpenCode's opt-out global read of `~/.claude/CLAUDE.md` — a
  user-level fallback, not a project signal.) (code.claude.com/docs/en/memory.)
- **The mirror is sanctioned, standard practice.** Anthropic itself recommends
  `ln -s AGENTS.md CLAUDE.md` or an `@AGENTS.md` import to bridge the two. So a
  well-configured repo shows BOTH files while being ONE logical config. A detector must
  collapse a mirror (symlink OR byte-identity OR a sync-tool marker) rather than read
  "two harnesses." We already have `detectInstructionMirror` (symlink / identical
  content) — but it is NOT wired into `detectAdapterResult`, and it should also key on
  sync-tool markers (`.ruler/`, `.rulesync/`, a managed-block comment).
- **Native format wins over the standard, everywhere.** Cursor (`.cursor/rules/` >
  `AGENTS.md`), Gemini (`GEMINI.md` > `AGENTS.md`), OpenCode (`AGENTS.md` > `CLAUDE.md`).
  The generic standard is always the LOWEST-precedence input — the opposite of "the
  generic marker identifies the specific tool."
- **Every mature multi-agent tool uses EXPLICIT config, not auto-detect.** Ruler
  (`ruler.toml` `default_agents`), rulesync (`rulesync.jsonc` `targets`), vibe-rules
  (`--target`). File markers are, at most, an install-time convenience nudge — never the
  authoritative classification. This corroborates vigiles's own `resolveHarnessSelection`
  precedence (flag → config → detect+warn) as already aligned; the missing refinement is
  explicit mirror/sync-tool collapse.

**A binary ≠ the target** (`which codex` = "can run Codex," not "this repo targets it";
also fails in CI). **A marker ≠ usage** (a stale `CLAUDE.md` still trips detection).

**Proposed precedence (structural, for when we revisit):**

1. Explicit `--harness=` flag.
2. `.vigilesrc.json` `harness` key (single or list) — the authoritative declaration.
3. Native-only markers: `.claude-plugin/` / `.claude/settings.json` ⇒ Claude Code;
   `.codex/config.toml` ⇒ Codex.
4. `CLAUDE.md` ⇒ Claude Code (after checking it isn't purely a mirror target).
5. Lone `AGENTS.md` (no native marker) ⇒ **"generic instructions, harness
   undetermined"** — audit agnostically, don't claim a harness. (Optional low-confidence
   content sniff, always labeled "guessed.")
6. Mirror/sync-tool collapse before reporting "multiple."
7. Nothing ⇒ "no harness config detected" (never silent-default).

## 3. Multi-harness audit — shared vs dialect-specific

**Harness-AGNOSTIC (compute ONCE):** instruction-file reference resolution; description-
overlap (NCD); test-coverage; MCP-config + MCP-tool/hook server-declared; malformed-
frontmatter; skill-frontmatter recommendation.

**Harness-SPECIFIC (per detected harness, via `dialect`/`layout`):** subagent
tool-contract (dialect tool catalog); hook-events + hook-script resolution; subagent-
frontmatter shape; lethal-trifecta / effect-surface; the instruction FILE + skill/hook
FORMAT (CLAUDE.md vs AGENTS.md; JSON vs TOML hooks; subagents are CC-only).

**Design:** ONE audit — shared bulk once + per-harness slice — a unified report with
per-harness sub-sections ONLY where the dialect changes the verdict. A mirror collapses
to one harness anyway.

## 4. Read-vs-pick behavior across verbs

- **`audit` (read):** report on ALL detected harnesses; never prompt; on none, say
  "nothing to audit" (not a silent Claude-Code default reporting a half-empty machine).
- **Pick-verbs (`compile`, single-target `lint`):** flag → config → **ask at a TTY** →
  else deterministic pick + loud notice. NEVER prompt non-interactively; `--harness=` is
  the escape.

## 5. Performance & parallelism

- **Local deterministic:** surface-scoped (reads the instruction file + skills/agents/
  hooks/mcp, NOT the whole tree), sync + serial. Cost ∝ #surfaces + #refs, not LOC.
  Parallelizing sync fs buys little; revisit only if a real corpus is slow. **Open:**
  does linter-catalog enumeration for `enforce()` execute the repo's linter, and is that
  slow on a big repo? (That's the executing tier, gated behind consent.)
- **In-browser (hosted demo):** cost moves to NETWORK — fetch the surface via the GitHub
  API. List once (git trees API), fetch surface files in PARALLEL (bounded `Promise.all`),
  staged progress bar (listing → fetching N → running rings). Mind unauth rate limits
  (~60/hr/IP).
- **Local + LLM tier (trigger-rate):** the real cost. Time ∝ skills × trials × latency
  (minutes; cold-start ~20s+). Bounded-concurrency parallel, capped by provider rate
  limits. Opt-in behind consent, never the default.

## 6. Cost & auth mode — the metered-API gap

The model-gated audit drives the real `claude`/`codex`. Subscription (Pro/Max) → $0;
metered API key → real credits per trial. The consent disclosure wording already branches
on `hasModelAccess` / `isMeteredAccess`. Add: a clear WARN at consent when metered ("this
spends API credits on your key, ~N calls"), and consider an extra confirm before spending
metered credits non-interactively. Detecting auth mode is a RUNTIME probe (§1).

## 7. Forks & open questions

1. Lone `AGENTS.md`: "generic/agnostic" (safest) vs lean Codex via a `which codex`
   runtime hint (mixes runtime into structural)?
2. Mirror: collapse to Claude Code always, or to the sync tool's declared source?
3. Genuine dual-target (independent `.claude/` AND `.codex/`): one unified report with
   two sections, or two reports?
4. "No harness": audit a lone instruction file agnostically, or "nothing to audit"?
5. Lean on the explicit `.vigilesrc.json harness` (init-written) and treat auto-detect
   as a loud best-effort hint?
6. In-browser: which surface files to fetch without walking the whole tree?
7. Metered-API: warn only, or refuse-by-default non-interactively?
8. Where does binary/auth detection live (a runtime port), and does `audit` ever need it
   (only the executing checks)?

## 8. Tentative recommendation (to pressure-test when revisited)

- Keep detection STRUCTURAL for audit; fix the AGENTS.md-≠-Codex conflation + wire in
  mirror-awareness. Precedence per §2.
- `audit` reports on all detected harnesses (shared-once + per-harness slice); "nothing
  to audit" on none; never prompts.
- Pick-verbs: flag → config → TTY-ask → deterministic + notice.
- Add a metered-API cost warning to the executing-checks consent.
- Perf: leave local deterministic as-is; design the browser path network-first; keep the
  LLM tier opt-in.

## See also

`code-adapter-architecture.md` (the ports), `harness-landscape.md` (the harness table),
`standards-conformance.md` (AGENTS.md/SKILL.md as standards), `sync-tool-compatibility.md`
(Ruler/rulesync), `audit-lighthouse-design.md` (the audit rings), `roadmap.md` (scope).
