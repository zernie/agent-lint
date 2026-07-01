---
name: debug-my-harness
description: Diagnose why an agent harness misbehaved by reading the local flight-recorder ledger (.vigiles/runs.jsonl) — which skills fired or got hijacked, which hooks blocked or wrongly allowed, which subagent tool-contract violations happened, and how a skill's trigger rate moved. Use when asked why a skill stopped firing, why a hook didn't block, why the wrong skill ran, or to debug/investigate what the harness actually did. NOT for writing new rules (use strengthen) or editing the spec (use edit-spec).
---

Diagnose harness misbehavior from the **flight recorder** — the local, append-only ledger
at `.vigiles/runs.jsonl` that vigiles writes as your harness runs. It records what actually
happened, so you debug from evidence instead of guessing.

## What's in the ledger

One JSON record per line, each with a `kind`:

- `hook` — a compiled-hook gate decision: `{event, decision: allow|deny|ask, mode: enforce|observe, rule, cmd, reason}`.
- `agent` — a subagent tool-contract decision: `{name, tool, allowed, reason}` (a `false` = the agent went outside its lane).
- `skill` — a skill activation: `{name, fired}`.
- `eval` — a measured metric: `{name, metric, value}` (e.g. trigger-rate recall/precision).
- `capability-diff` — a blast-radius change: `{pr, added, removed, widened}`.

## Instructions

### Step 1: Read the ledger

Read `.vigiles/runs.jsonl` (JSONL — one record per line; tolerate a torn last line). If it's
absent or empty, say so — there's nothing recorded yet; suggest running the harness (or
`vigiles audit`) first. Do NOT fabricate records.

### Step 2: Answer the specific question, evidence-first

Match the user's question to the ledger:

- **"Why did skill X stop firing / why does the wrong one run?"** — count `skill` fires by
  name over time. If X's fire-rate dropped, look for a sibling that fired on the same kinds
  of prompts (a **selection collision**) and check their descriptions for overlap. Recommend
  differentiating or merging the descriptions.
- **"Why didn't my hook block that?"** — find `hook` records for the event. A `decision:
allow` on something that should be denied, or `mode: observe` (shadow, never blocks), or
  the absence of any record, tells you which. Recommend flipping `observe`→`enforce` or
  fixing the gate logic.
- **"Did a subagent misbehave?"** — list `agent` records with `allowed: false`: the agent
  reached for a tool outside its declared contract. Point at the contract to tighten or widen.
- **"Is it getting worse?"** — compare `eval` metric values (recall/precision) across runs;
  a downward trend is drift (often after a harness/model upgrade).

### Step 3: Recommend a fix, tied to the evidence

Prefer **promoting an ignored-but-decidable rule from prose to a deterministic gate**: a
repeated `agent` violation or a rule the agent keeps breaking → a compiled hook or a tighter
tool-contract (the `strengthen` skill can help). A description collision → differentiate the
skill descriptions. Always cite the specific records you based the diagnosis on.

### Step 4: Offer the next step

If the fix is a spec change, hand off to `edit-spec`. If it's promoting guidance to a linter
rule, hand off to `strengthen`. If a behavioral claim needs measuring (does the skill fire
now?), hand off to `test-harness` (`measureTriggerRate`).
