# delegation-trifecta

Flag a unit — a **subagent** or a **model-invocable skill** — whose **effective
(combined) capability** forms all **three legs** of the _lethal trifecta_ **across
a delegation or inheritance edge**, even though no single unit holds all three on
its own. The per-unit [lethal-trifecta](lethal-trifecta.md) check catches one unit
that can read private data, ingest untrusted content, and exfiltrate at once; this
check catches the **emergent** case where those legs are **split across the
delegation tree** so no single unit trips the per-unit rule — yet the **chain** is
a complete prompt-injection exfiltration path.

Same detector `vigiles audit` uses (`delegationTrifectaIssues` in
`src/core/delegation-trifecta.ts`). It is **capability-diff across the delegation
tree**: the effective set of a unit is the union of its own tools plus the tools of
every unit reachable through its `delegatesTo` edges.

## What it checks

For each unit, the detector computes the **effective tool set** — a cycle-safe
walk over the delegation graph from that unit, unioning every reachable unit's
tools (including the unit itself) — and classifies it into the three legs:

| Leg                          | What it grants                  |
| ---------------------------- | ------------------------------- |
| **A — private-data read**    | read local secrets/files/repo   |
| **B — untrusted-content in** | ingest attacker-controlled text |
| **C — exfiltration channel** | send data out                   |

A finding fires when the **effective** set holds all three legs **and the unit's
own set does not**.

```
⚠ subagent triager (agents/triager.md): Subagent "triager" is not a data-leak risk
  on its own, but combined with what it delegates to (fetcher), the chain can read
  private data (Read), ingest untrusted content (WebFetch), AND exfiltrate
  (WebFetch) — a prompt injection in the untrusted input could pivot through the
  delegation to leak data. Break the delegation or drop one leg.
```

Here `triager` only reads (leg A) and `fetcher` only ingests + sends (legs B+C):
neither is a trifecta alone, but `triager → fetcher` is. A prompt injection in
`fetcher`'s untrusted input can pivot back through the delegation to leak the
private data `triager` reads.

## How it differs from `lethal-trifecta`

- **Per-unit ([lethal-trifecta](lethal-trifecta.md))** — one unit's OWN tools form
  the trifecta. A single, self-contained exfil path.
- **Across-edges (this rule)** — the trifecta only appears when you fold in what a
  unit can DELEGATE to. The danger is the **combined blast radius of the chain**.

**No double-report:** a unit whose own tools already form a full trifecta is
**skipped** by this detector — the per-unit rule owns it (one-detector-no-drift,
don't-cry-wolf). This rule reports **only** the emergent case the per-unit check
structurally can't see.

## High-precision (FP-safe)

- **Explicit edges only.** The detector operates on the delegation graph it is
  given; it flags only **concrete, named tool unions** where every leg is supplied
  by a recognized tool. Unknown tools map to no leg (the same high-precision
  classification the per-unit rule uses).
- **Wildcard guard.** If the effective set reaches an **inherits-all** unit (a
  `tools` list of `["*"]`, or no `tools:` line at all), the unit can reach
  everything and would always "trifecta" — that maximal-blast-radius case is the
  per-unit **advisory** detector's job, so this rule **skips** it. We never fire on
  an inherits-all reach; only on explicit, decidable unions.
- **Cycle-safe.** A delegation cycle (`A → B → A`) terminates and yields the
  correct effective union, not an infinite loop.
- A `Tool(restriction)` suffix is stripped to its base name before classifying.

## Configuration

```json
{ "rules": { "delegation-trifecta": "warn" } }
```

### Severity

| Value              | Behavior                                                        |
| ------------------ | --------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a delegation-trifecta find |
| `"warn"` (default) | Prints a warning, exits 0 (don't-cry-wolf rollout)              |
| `false`            | Skip the check                                                  |

Default is **`warn`** during rollout. Once you've confirmed it's quiet on your own
units, raise it to `"error"` to gate CI — an emergent cross-delegation exfil path
is a real risk worth blocking.

## The fix

**Break the delegation or drop a leg.** Either:

- Remove the delegation edge so the chain no longer combines into a trifecta, or
- Drop one leg from the effective set — narrow the parent's `tools` (so it no
  longer reads private data), or narrow the delegated-to unit (so the chain can no
  longer ingest untrusted content or exfiltrate).

The goal, as with the per-unit rule, is **Meta's Rule of Two**: allow at most two
of the three legs along any path through the delegation tree.

## Why

A prompt-injected agent's blast radius is bounded by what it can do — and an agent
can do everything the units it delegates to can do. The deadliest shape is a chain
that, end to end, can read, ingest, and exfiltrate, even when each link looks safe
in isolation. A linter that checks one unit at a time never sees it; the
**combination across the tree** is the risk, and it's decidable from the declared
contracts — for free, no model.

## See also

- [lethal-trifecta](lethal-trifecta.md) — the per-unit check this one extends
  across delegation edges (and defers to, to avoid double-reporting).
- [subagent-tool-contract](subagent-tool-contract.md) — verifies the same `tools:`
  rail resolves to real tools.
