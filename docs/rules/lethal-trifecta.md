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
  because it inherits everything — a maximal blast radius. Reported with `⚠`,
  aligned with the codebase's existing "inherits-all is advisory" stance.

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
