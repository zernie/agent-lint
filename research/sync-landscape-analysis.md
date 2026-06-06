# Rule-Sync Landscape: What's Useful, What We Have, What's Worth Adding

The mid-2026 sync landscape (Ruler, ai-rulez, block/ai-rules, ai-rules-sync, anywhere-agents) is loud but uneven — clear demand, varied solution quality. This doc breaks each tool down by the dimension that matters for vigiles: which ideas transfer, which we already have, which are worth building, and which are scope traps.

---

## Per-tool breakdown

### Ruler (intellectronica/ruler) — 16+ agents, syncs from single source

**Useful idea:** single source of truth distributed to every agent format (Cursor `.mdc`, Cline `.clinerules`, CLAUDE.md, AGENTS.md, Gemini CLI configs, etc.). Recently added skills and subagents.

**What we have:** multi-target output already exists in `spec.ts` via `target: ["CLAUDE.md", "AGENTS.md"]`. Skill compilation exists via `skill()`. So the _source-of-truth_ dimension is solved — what's missing is _format coverage_.

**What we don't have:** format-specific emitters for Cursor `.mdc`, Cline `.clinerules`, etc. Today vigiles emits markdown only.

**Worth building?** Probably not directly. Reasons:

- vigiles explicitly positions sync as not-our-job. Reversing that is a positioning decision.
- The clean composition is: vigiles emits CLAUDE.md → Ruler picks it up → distributes. That's exactly what Ruler is for.
- Direct emission would force vigiles to track every agent's evolving config format. Ruler's whole business model is doing that maintenance. Free-riding on their work is more efficient.
- Could add a one-liner README section: "Use vigiles to author the spec; use Ruler to distribute the output to N agents." Solves the user's problem without absorbing the maintenance burden.

### ai-rulez (Goldziher) — 19+ tools, 32 builtin domains, "AI-Powered" check

**Useful idea:** 32 builtin domains. Pre-canned rule sets for common stacks (Python web, React, Rust CLI, etc.) so users don't write specs from scratch.

**What we have:** `examples/CLAUDE.md.spec.ts` exists as a single sample. No domain library.

**What we don't have:** an `examples/` library or `templates/` directory of stack-specific starter specs. `vigiles init` could ask "what stack?" and copy a relevant template.

**Worth building?** Yes, low effort, high adoption value. Concrete proposal:

```
examples/
  typescript-strict.spec.ts      # @typescript-eslint/strict + sonarjs
  python-strict.spec.ts          # ruff + pylint + mypy strict
  rust-strict.spec.ts            # clippy::pedantic + clippy::nursery
  react-app.spec.ts              # eslint-plugin-react + jsx-a11y
  node-cli.spec.ts               # eslint + jest + commander conventions
```

`vigiles init --template typescript-strict` copies the file, runs `generate-types`, and compiles. Three commands to a working spec instead of hand-writing one. Could be community-contributed.

**On the "AI-Powered" angle:** explicitly anti-pattern. Counter-positioning in README + landscape doc. (Shipped in F.)

### block/ai-rules (Block/Square) — Enterprise multi-agent, YAML, MCP

**Useful idea two-part:**

1. **MCP server mode.** Agents call the tool over MCP to ask "is this rule active?", "does X comply?". Exposes the tool to the agent without shelling out.
2. **Enterprise cascading config.** Org-wide spec inherited by all repos, with per-repo overrides.

**What we have:** CLI/library only. No MCP integration. No org/repo cascade — each `.spec.ts` is standalone.

**What we don't have:** both of the above.

**Worth building?**

- **MCP server mode:** speculative. The use case is "agent introspects the rules at runtime" — but vigiles compiles to markdown the agent already reads. The MCP value would be live audit ("is this rule still enabled in the linter config right now?") rather than spec-time check. Possibly useful for long-running sessions where configs change mid-session. Hold until someone asks for it.
- **Enterprise cascading:** complex and niche. The pattern is real (TypeScript's extends, Prettier's overrides), but the user count for org-level cascade is small. Defer until there's a concrete adopter pulling for it.

### ai-rules-sync (lbb00) — symlink-based sync across 8 editors

**Useful idea:** symlink the canonical file to wherever each agent expects it (`.cursorrules` → `CLAUDE.md`, `.windsurfrules` → `CLAUDE.md`, etc.). Zero runtime overhead, no format conversion.

**What we have:** nothing for this, but it's a 3-line shell script per repo.

**What we don't have:** symlink emission step.

**Worth building?** Marginal. Could be a doc-only addition:

```bash
# After compile, symlink CLAUDE.md to other agents that accept markdown:
ln -sf CLAUDE.md .cursorrules
ln -sf CLAUDE.md .windsurfrules
ln -sf CLAUDE.md AGENTS.md  # if not already a target
```

A `vigiles compile --symlink claude,cursor,windsurf` flag would be nicer ergonomics but doesn't add capability. Note in `docs/agent-workflows.md` and move on.

Risk: symlink approach assumes all agents accept the same format. They mostly don't — Cursor wants `.mdc` with frontmatter, Cline wants different sections. Symlinking CLAUDE.md to `.cursorrules` gives a broken Cursor config. Ruler does format conversion correctly; ai-rules-sync skips that, which works for the trivial cases and fails silently for the rest.

### anywhere-agents (yzhao062) — PreToolUse guards blocking destructive commands

**Useful idea:** declarative _block_ rules that compile to runtime hook configs. "Don't allow `git push --force`", "block `rm -rf /`", etc. Single config → generated hook scripts the agent's harness enforces at tool-call time.

**What we have:** `guard()` rule type — reactive (on file change, run command, e.g., PostToolUse hook). Not preventive.

**What we don't have:** a _preventive_ rule type — pattern-match a tool call before it runs, deny if it matches. PreToolUse hook semantics.

**Worth building?** Yes — probably the most interesting idea from the sync landscape, and it's not really a sync feature, it's a deterministic-constraint feature. See proposal below.

---

## What's actually worth building

Two ideas survive the filter. Both extend vigiles's existing deterministic-constraints positioning rather than dragging it into sync territory.

### Proposal A — domain preset library (small, high adoption value)

Ship `examples/<stack>.spec.ts` files as one-command starting points. Wire `vigiles init --template <name>` to copy + generate-types + compile. Five to ten templates covers most of the long tail. Community-contributable. Concrete, mechanical, no positioning risk.

Effort: small. Impact: medium — accelerates first-five-minutes adoption, removes "I don't know what rules to write" as a barrier.

### Proposal B — `block()` rule type for PreToolUse-style guards

New rule builder, parallel to `enforce()`, `guidance()`, `guard()`:

```ts
"no-force-push": block({
  tool: "Bash",
  match: /git push.*--force/,
  reason: "Force push is destructive — use --force-with-lease at most.",
}),

"no-prod-db-writes": block({
  tool: "Bash",
  match: /\bproduction\b.*\.sql/,
  reason: "No direct prod DB writes — use migrations.",
}),

"no-rm-rf-root": block({
  tool: "Bash",
  match: /\brm\s+-rf\s+\//,
  reason: "Catastrophic.",
}),
```

**Compile targets:**

- CLAUDE.md → markdown documents the block under Rules (so a reviewer reading the compiled file knows what's blocked and why).
- `.claude/settings.json` → PreToolUse hook config that denies the tool call when the pattern matches.
- AGENTS.md → if AAIF proposal #105 (structured tool permissions) lands, emit the standard's frontmatter format too.

**Why this fits vigiles's positioning, not sync's:**

- It's a deterministic constraint declared in the typed spec — same shape as `enforce()`, just executed at runtime by the agent's hook engine instead of by the linter.
- vigiles owns the _declaration_; the agent's existing hook mechanism owns the _execution_. No new runtime engine, no competition with Microsoft AGT or Agent RuleZ.
- Compiles cleanly: the regex and tool name are pure data, verifiable at spec time (regex parses, tool is one of the known `ClaudeTool` literals).
- Closes a real gap. anywhere-agents exists because nothing else covers this; users are already doing it ad-hoc in `settings.json`. Pulling it into the spec means one source of truth instead of two.

**Why this doesn't drag into sync territory:**

- We're not maintaining N agent configs. We compile one source spec to whichever target the user picks (Claude Code, AGENTS.md, etc.) — same as today.
- We don't run anything at runtime. The hook config we emit is consumed by Claude Code's existing PreToolUse machinery (or AGENTS.md's equivalent once it ships).

**Effort:** medium. Spec.ts builder + type + compile branch in `compile.ts` + a hook-config emitter + tests. Maybe 400-600 LOC including tests.

**Impact:** high. Closes the destructive-command-blocking gap that anywhere-agents demonstrates is in demand. Generalizes beyond destructive commands — anything you'd want to block at tool-call time (writes to a frozen path, network calls in offline mode, package installs from non-allowlist registries, etc.).

---

## What's explicitly not worth building

- **Native multi-format emission** (Cursor `.mdc`, Cline `.clinerules`, etc.). Ruler does it well. Compose, don't reimplement. Doc this in README and move on.
- **MCP server mode.** Speculative use case, no concrete pull. Hold.
- **Enterprise cascading config.** Niche, complex, defer until a real user pulls for it. The org/repo override pattern is a 2027 problem at earliest.
- **Symlink emission feature flag.** 3-line shell snippet in `docs/agent-workflows.md` is enough. A flag is no faster than documenting the snippet.

---

## Recommended order

1. **F (counter-position vs ai-rulez "AI-Powered" enforcement).** Shipped — README addition + competitive-landscape note. Free positioning work.
2. **A (domain preset library).** Small, mechanical, accelerates adoption. Ship next.
3. **B (`block()` rule type).** Higher effort but closes the most concrete gap from the sync landscape. Ship after A.

Skip everything else from this landscape — composes better with existing tools than absorbing into vigiles.
