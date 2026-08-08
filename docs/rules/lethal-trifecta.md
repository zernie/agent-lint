# lethal-trifecta

Flag a unit — a **subagent** or a **model-invocable skill** — whose declared
tools simultaneously hold all **three legs** of Simon Willison's _lethal
trifecta_. A single unit that can do all three is a **prompt-injection
exfiltration path with no exploit code**: attacker-controllable content flows in,
reads your private data, and ships it out — all driven by the model, no bug
required. Same detector `vigiles audit` uses (`lethalTrifectaIssues` in
`src/core/lethal-trifecta.ts`); no other plugin linter checks the tool **set** for
this — competitors lint a single tool's effect, never the dangerous combination.

## The three legs

| Leg                          | What it grants                  | Example tools                                                                                           |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A — private-data read**    | read local secrets/files/repo   | `Read`, `mcp__filesystem__*`, `mcp__github__get_file_contents`, `Bash` (`cat ~/.ssh/*`)                 |
| **B — untrusted-content in** | ingest attacker-controlled text | `WebFetch`, `WebSearch`, `mcp__fetch__*`, MCP servers reading issues/email/tickets                      |
| **C — exfiltration channel** | send data out                   | `WebFetch`, `computer_use`, `mcp__github__create_pull_request`, Slack/email MCP, `Bash` (`curl`/`wget`) |

`Bash` (and Codex's `shell`) is **dual** — it satisfies leg A (read a secret) AND
leg C (curl it out) — so `Bash` + any leg-B tool is already all three legs.

**Meta's Rule of Two**: allow at most two of the three legs in one unit. A unit
holding all three is the finding.

## What it flags

This is a **capability SET-intersection over the declared contract, not a text
scan**: it classifies each declared tool into the leg(s) it supplies and fires
only when all three legs are non-empty.

```
✗ subagent issue-triager (agents/issue-triager.md): Lethal trifecta: this unit can
  read private data (Read), ingest untrusted content (mcp__github__issue_read), AND
  exfiltrate (mcp__github__create_pull_request) — a prompt-injection exfil path with
  no exploit code. Drop at least one leg (Meta's Rule of Two: allow at most two).
```

### Hard vs advisory

- **`"hard"`** — an **explicit** contract that names all three legs (a concrete,
  declared exfil path). Reported with `✗`.
- **`"advisory"`** — an **inherits-all** unit (a subagent with no `tools:` line, or
  a model-invocable skill with no `allowed-tools:`) that holds every leg only
  because it inherits everything — a maximal blast radius. Reported with `⚠`.

The two severities describe **how the unit got there**, not how much it costs: an
inherits-all unit is graded exactly like an explicit one (see below), because it
is strictly the worse of the two.

### A contract that doesn't parse is not a contract

If a unit's frontmatter **exists but isn't valid YAML**
([frontmatter-valid](frontmatter-valid.md)), its declared tool list is read as
**inherits-all** — the advisory case — and the finding says so:

```
⚠ skill broken: Frontmatter is not valid YAML, so the declared tool list could not
  be read — a strict loader rejects the block, and a regex salvage of it is a guess,
  not a contract. Scored as INHERITS-ALL (every capability) …
```

vigiles's shared frontmatter reader is deliberately lenient: on a block js-yaml
rejects it falls back to a regex salvage, so the live PreToolUse rail still has
something to enforce and the file's other fields keep working. That is right for a
rail and wrong for a **score** — a unit whose contract a strict loader rejects was
being graded as though it had declared exactly the narrow list its author meant, so
the Safety ring read **better than the truth**. Same conservative direction as
grading inherits-all like an explicit all-three: presence of a declaration is not
enforcement of it. **Fix the YAML and the declared list counts again** — the finding
disappears the moment the block parses.

## In `vigiles audit`: graded, but a **ding — not a fail**

A trifecta finding is a **capability PATTERN with no exploit code**, not a
demonstrated vulnerability — attacker content _could_ be exfiltrated, but nothing
proves it will be. It's a **real risk worth surfacing in the grade**, yet
Anthropic's own official plugins ship the pattern on their cleanest surfaces (e.g.
the `feature-dev` plugin's `code-reviewer` subagent lists `Read, WebFetch,
WebSearch`), so fail-grading such a plugin to **F** would cry wolf. `vigiles audit`
threads that needle with a **capped exposure** penalty:

- **SHOWS** every trifecta unit (hard _and_ inherits-all) in the **Safety** ring
  and the report — a real, useful heads-up.
- **DEDUCTS −10 per exposed unit, capped at −30 × the SHARE of the surface
  exposed** — so a trifecta dents the score without a catastrophic F. The
  **Safety** ring scores `100 − min(10 × exposed, 30 × exposed/assessable)`, is
  `n/a` only when there's no tool-bearing surface to assess (never a false 0), and
  is a clean 100 when surfaces exist but no trifecta. The `feature-dev` plugin's 3
  hard units → `−30` → **C (70/100)**, not F and not A.
- An **inherits-all (`"advisory"`)** unit is graded **exactly like an explicit
  one**. It holds all three legs implicitly _and every other capability besides_,
  so it cannot cost less than a declared all-three contract. Grading only the
  explicit case made the score non-monotone in risk: **declaring** an
  `allowed-tools` contract — a genuine risk reduction — could only ever LOWER the
  score. Measured on a real 35-skill repo (2026-08-03): Safety read **70** while
  35/35 units inherited everything (only the 3 declared units counted), and
  dropped toward **0** after contracts were added everywhere and exposure fell to
  **17/35**. The tool called the safer configuration strictly worse. Under the
  capped-exposure model the same two states read **70 → 85**.

The deduction lives on the single shared `reportDeductions` → `computeIntegrityScore`
path, so the audit overall and the plugin-health leaderboard read the SAME number.
This is a **separate axis from the lint rule below** — under `vigiles lint` you can
still raise `lethal-trifecta` to `"error"` to gate CI on it independently.

## High-precision (FP-safe)

Only **well-known, high-signal tools** map to a leg — an unknown tool maps to
nothing, so a bare unrecognized `mcp__*` never cries wolf. A `Tool(restriction)`
suffix is stripped to its base name. **User-invoked** skills
(`disable-model-invocation: true`) are excluded — they're picked by an explicit
command, so they can't be hijacked by attacker content.

## Configuration

```json
{ "rules": { "lethal-trifecta": "warn" } }
```

### Severity

| Value              | Behavior                                                |
| ------------------ | ------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a trifecta finding |
| `"warn"` (default) | Prints a warning, exits 0 (don't-cry-wolf rollout)      |
| `false`            | Skip the check                                          |

Default is **`warn`** during rollout. Once you've confirmed it's quiet on your own
units, raise it to `"error"` to gate CI — an explicit all-three contract is a real
exfiltration risk worth blocking.

## Scope

Subagents (`agents/*.md`, on a harness with subagents) and model-invocable skills
(`skills/*/SKILL.md`). Skills exist on every harness; the subagent half is gated by
the active adapter's `subagents` capability.

## Why

The blast radius of a prompt-injected agent is bounded by what it can do, and the
deadliest shape is the one unit that can read, ingest, and exfiltrate at once. A
linter that checks one tool at a time never sees it; the **combination** is the
risk, and it's decidable from the declared contract — for free, no model.

## See also

- [subagent-tool-contract](subagent-tool-contract.md) — verifies the same `tools:`
  rail resolves to real tools.
- [disallowed-tools-contract](disallowed-tools-contract.md) — the deny-side mirror.
