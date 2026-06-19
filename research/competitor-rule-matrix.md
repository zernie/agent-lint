# Competitor rule matrix + poach backlog

> Status: research (2026-06-19), from a 3-agent parallel landscape sweep
> (eval-class tools, plugin/skill validators, MCP/security scanners) cross-checked
> against the mid-2026 OSS plugin sweep ([plugin-structural-findings](plugin-structural-findings.md)).
> The question this answers: who else writes deterministic rules over agent
> instruction files, which of ours do they already have, and what should we poach?

## The headline

**vigiles is still alone on _semantic cross-referencing_** — resolving a declared
reference (a `tools:` entry, an `mcp__server__tool`, a linter rule like
`@typescript-eslint/no-floating-promises`) against the **live tooling** (the 7
linter catalogs, the harness tool list, the declared MCP servers). No competitor
does that; it requires running/reading the underlying tool, not matching a static
schema.

**But the _structural_ rules are converging to table stakes.** As of mid-2026 at
least four linters — **agnix** (agent-sh/agnix, ~425 rules, LSP), **claudelint**
(pdugan20, 114 rules), **cclint** (carlrannaberg), and **Anthropic's own
`claude plugin validate`** — validate hook-event names, frontmatter fields, and
MCP stdio/http config. Those are now PARITY, not moat.

## The matrix

Legend: ✓same · ~ partial/schema-only · ✗ absent.

| vigiles rule                              | agnix          | claudelint / cclint | `claude plugin validate` (**official**) | eval tools (promptfoo/DeepEval/Inspect) | MCP / security scanners  |
| ----------------------------------------- | -------------- | ------------------- | --------------------------------------- | --------------------------------------- | ------------------------ |
| `agent-tool-contract` (tool in catalog)   | ~ (CC-SK-008)  | ~ known-tools       | ✗ (only checks it's an array)           | ✗                                       | ✗                        |
| `hook-events` (event name real)           | ✓ (CC-HK-001)  | ✓                   | ✓                                       | ✗                                       | ✗                        |
| `agent-frontmatter` (name/desc)           | ✓              | ✓ (+color, +model)  | ✓ (+color, +model)                      | ✗                                       | ✗                        |
| `skill-frontmatter` (recommend)           | ~              | ✓                   | ~                                       | ✗                                       | ✗                        |
| `mcp-config` (server can start)           | ~ (MCP-024)    | ~                   | **✓** (stdio/http)                      | ✗                                       | ~ (rug-pull fingerprint) |
| `mcp-tool-resolves` (server declared)     | ✗ (field only) | ✗                   | ✗                                       | ✗                                       | ✗                        |
| `enforce()` linter-rule cross-ref (7 cat) | ✗              | ✗                   | ✗                                       | ✗                                       | ✗                        |
| harness **testing** (runHook/eval)        | ✗              | ✗                   | ✗                                       | ✓ (their core)                          | ✗                        |

Categories that are **orthogonal** (positioning boundaries, not competitors):

- **Eval tools** (promptfoo — now OpenAI-owned, DeepEval v4, Braintrust, Inspect,
  LangSmith, OpenAI Evals, Ragas) grade model _output_, not config references.
  Their "deterministic" assertions are output-shape (JSON schema, tool-call F1),
  not "does this declared tool exist". vigiles's harness-testing layer is the only
  thing that touches their space, and from the other side (test the assembled
  harness, on the subscription).
- **MCP / supply-chain security scanners** (Snyk Agent Scan ← ex-mcp-scan/Invariant,
  Cisco mcp-scanner, Pipelock) do ML/heuristic threat detection + runtime proxying
  (prompt-injection, tool-poisoning, secrets DLP). vigiles deliberately does NOT do
  threat detection and never sits in the request path. Delegate, don't build.
- **MCP Inspector / MCP conformance suite** test the _server_ side (protocol
  conformance, live debugging), not instruction-file references. Complementary.

## Poach backlog (deterministic, FP-safe, moat-aligned)

Ranked. Each is a check a competitor has that vigiles lacks, that fits the
one-detector-no-drift + high-precision discipline.

1. **`hook-script-exists` as a lint rule** — `scan` already computes a hook's
   missing/ok/unresolved status; promote "missing" to a lint rule. Matches the
   **official** `claude plugin validate` + claudelint, makes vigiles a SUPERSET of
   Anthropic's validator. _Tiny._ (Built — see below.)
2. **`disallowed-tools-contract`** (from SkillCheck) — cross-reference a
   subagent's `disallowedTools:` block-list against the catalog; a typo'd entry
   silently blocks nothing (close-typo only, never-available is harmless in a
   block-list). _Low._ (Built.)
3. **agent `model:` + `color:` validity** (from Anthropic validator + cclint) — a
   retired model name / bad color silently falls back. High-precision: close-typo
   of a known alias/color only (a full dated model id is left alone). _Tiny._ (Built.)
4. **`description-overlap`** (vigiles original idea, NCD precision proxy) — two
   skills whose descriptions are near-identical → a precision collision the
   selector can't resolve. Deterministic proxy for a `--trigger`-class behavioral
   bug; nobody else has it. _Medium._ (Built.)
5. **`mcp-hook-target-resolves`** (from agnix CC-HK-026/027) — a `type: mcp_tool`
   hook action must name a declared server+tool. A true cross-reference. _Medium, backlog._
6. **duplicate / reserved MCP server names** (from agnix MCP-023/026) — fold into
   `verifyMcpServers`. Overlaps the planned `duplicate-names` idea. _Tiny, backlog._
7. **MCP Server Card no-launch resolution** — read a `.well-known` Server Card's
   tool list so `mcp-tool-resolves` can resolve without starting the server.
   _Later (depends on MCP 2026 spec adoption)._

## Positioning recommendation

- **Lead with the moat, not the structural lints.** The pitch is (a) `enforce()`
  linter-rule cross-ref, (b) `mcp-tool-resolves`-style semantic resolution, (c)
  the harness-testing layer, (d) the typed-spec authoring (generate-types/schema).
  Do NOT headline hook-events / agent-frontmatter / mcp-config — Anthropic ships
  those.
- **Still match the official validator** (poach #1, #3) so vigiles is a clean
  superset of `claude plugin validate` — that's the "switch to us" story, even
  though those specific checks aren't differentiators.
- **agnix is the one to watch** — closest structural competitor (425 rules, LSP,
  10+ harnesses), but schema-level only. The gap is permanent for any tool that
  won't run the underlying linter / query the live MCP server.

## See also

- [deterministic-rule-ideas](deterministic-rule-ideas.md) — the original ranked
  rule backlog these poaches merge into.
- [plugin-structural-findings](plugin-structural-findings.md) — the sweep + the
  verified OSS bugs the rules catch.
- [oss-pr-drafts](oss-pr-drafts.md) — the adoption play (file the fixes upstream).
- [eval-api-landscape](eval-api-landscape.md), [promptfoo-deep-dive](promptfoo-deep-dive.md),
  [agent-supply-chain-security](agent-supply-chain-security.md) — the prior
  category deep-dives this synthesizes.
