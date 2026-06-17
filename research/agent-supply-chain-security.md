# Agent supply-chain & plugin/MCP security: should vigiles scan?

> Status: research (2026-06-13). Adjacent to
> [skill-eval-landscape](skill-eval-landscape.md),
> [sandbox docs](../docs/sandboxing.md),
> [sandbox-network](sandbox-network.md), and
> [feature-ideas §13](feature-ideas.md). This does **NOT** re-cover the
> sandbox _mechanics_ (bwrap tiers, deny-all / `recordEgress` / `egress:{allow}`
> — see those docs) nor the skill-eval scorecard/trigger-precision work (see
> skill-eval-landscape). It covers a **new question**: is a _security
> scanner/auditor_ for third-party plugins, skills, and MCP servers a viable
> expansion — or pivot — of pillar 2, and it **re-examines** the
> "skill security scan: delegate, don't build" punt from skill-eval-landscape
> §1 with June-2026 eyes.

## TL;DR

- The threat surface is now **real and load-bearing**, not theoretical. 2026 saw
  the first malicious MCP server (`postmark-mcp`, ~1500 dl/wk, ~300 orgs), a
  coordinated 30+-malicious-skill campaign on ClawHub, and Snyk's ToxicSkills
  study finding **36% of agent skills carry a flaw and 13.4% a critical one**.
  OWASP shipped an **Agentic Skills Top 10** in Dec 2025. This is a category now.
- The market is **already crowded at the SAST/scanner layer** — Snyk (which
  _acquired_ Invariant Labs / mcp-scan), Socket.dev, Cisco's mcp-scanner, Lakera
  (now Check Point), Protect AI (now Palo Alto). vigiles should **not** build a
  generic secrets/malware/typosquat scanner; that war is over and we'd lose it.
- **But** the punt in skill-eval-landscape ("delegate, don't build") was scoped
  to _static pattern-matching_ — and OWASP **AST08 ("Poor Scanning")** names
  exactly that as a top-10 risk: pattern matchers miss semantic/behavioral
  threats. vigiles's wedge is **behavioral, not pattern**: it already _loads_ the
  real harness and _executes it under a packet-layer sandbox_. Nobody else
  combines "understands the Claude Code harness model" with "runs it confined and
  records egress."
- **The opinionated call:** keep delegating the generic scan, but build a thin,
  high-signal **`vigiles scan`** that checks the **three things only-we-can**:
  declared-vs-enforced tool-contract gaps, observed-egress vs declared, and
  reference integrity of the instruction surface. Frame as **expansion of pillar
  2, not a pivot.** A full pivot to "the security layer" is the wrong move (see
  Honest case against).

## Landscape 2026

**The incidents are no longer hypothetical:**

- **`postmark-mcp`** — first publicly documented malicious MCP server (2026),
  ~1500 downloads/week, ~300 orgs integrated it before Koi Security flagged it.
- **ClawHub campaign (Feb 2026)** — OpenSourceMalware.com documented the first
  _coordinated_ malware campaign targeting Claude Code / OpenClaw users: 30+
  malicious skills, threat actors publishing 40+ automated malicious skills each
  (`zaycv`), crypto-targeting (`Aslaep123`), ready-to-deploy malware repos.
- **Snyk ToxicSkills study** — 3,984 skills scanned: **36% (1,467) had ≥1 flaw,
  13.4% critical, 10.9% leaked hardcoded secrets, 17.7% had third-party content
  (indirect-injection vectors); 76 confirmed malicious payloads, 8 still live at
  publication.** Three attack families: external malware (password-zip drops),
  obfuscated exfil (base64 → AWS keys), security-disablement (jailbreak/backdoor).
- **Claude Code GitHub Action CVE (Jun 1 2026, RyotaK/GMO Flatt)** —
  indirect prompt injection via GitHub metadata + `/proc/self/environ` →
  CI/CD secret + OIDC-token exfil. Fixed in `claude-code-action` v1.0.94. The
  write-up's thesis: **"prompt injection via repo metadata is a class-level
  supply-chain risk,"** not a one-off.
- **Tool poisoning** (Invariant Labs, coined 2025): a malicious MCP tool
  _description_ enters the agent context as trusted text and carries hidden
  instructions. Invariant found **5.5% of public MCP servers** had poisoned
  metadata. BlueRock found **36.7% of 7,000+ MCP servers SSRF-vulnerable**.

**Who's selling defense (the crowded part):**

| Vendor / tool                 | What it does                                            | Layer            |
| ----------------------------- | ------------------------------------------------------- | ---------------- |
| Snyk Agent Scan (ex-mcp-scan) | config-level MCP issues, tool-poisoning, rug-pull       | static + runtime |
| Cisco `mcp-scanner`           | YARA pattern-matching over MCP servers                  | static           |
| Socket.dev                    | dep typosquat / takeover / behavioral pkg analysis      | dep supply chain |
| Lakera Guard (Check Point)    | runtime prompt-injection/jailbreak firewall, 98%+/<50ms | runtime gateway  |
| Protect AI (Palo Alto)        | model/artifact scanning, agent posture                  | platform         |
| OWASP Agentic Skills Top 10   | the taxonomy everyone scores against                    | standard         |

**The standard to anchor on — OWASP Agentic Skills Top 10 (2026):** AST01
Malicious Skills · AST02 Supply Chain · AST03 Over-Privileged · AST04 Insecure
Metadata (typosquat/fake author) · AST05 Unsafe Deserialization · AST06 Weak
Isolation · AST07 Update Drift (unpinned deps) · AST08 **Poor Scanning**
(pattern matchers miss semantic/behavioral threats) · AST09 No Governance ·
AST10 Cross-Platform Reuse (metadata loss porting between OpenClaw/Claude/Cursor).

## The gap / whitespace

The crowded vendors are strong at **static** (secrets, YARA, typosquat, dep
graph) and at **runtime LLM-firewalling** (Lakera-style I/O inspection). Two
gaps fall between them, and both map to OWASP risks the incumbents underserve:

1. **Behavioral verification of the _harness as assembled_ (AST06, AST08).**
   The scanners read files; the firewalls watch live traffic. Almost nobody
   takes the _installed plugin_, **stands it up under a real sandbox, and
   observes what it actually does** — which hosts it reaches, which files it
   writes, which tools it calls — _before_ it touches a real session. That is
   exactly what vigiles's pillar-2 sandbox already does for testing. AST08
   ("Poor Scanning") is OWASP _naming the gap that pattern-matchers leave_.

2. **Declared-vs-enforced drift (AST03 over-privilege, AST04 metadata).**
   A skill/agent's `tools:` frontmatter, its MCP tool list, its declared egress
   — these are **documentation**, not a boundary. vigiles already built the rail
   that closes this for subagents (`src/agent-runtime.ts`, the PreToolUse
   tool-contract hook, #4740/#21460, SDK #172). The same idea generalizes to "what this
   plugin _says_ it does vs what it _is observed to_ do."

No incumbent owns "I understand the Claude Code harness model (hooks, skills,
subagents, settings, MCP) **and** I can run it confined and diff declared vs
observed." Generic SAST doesn't model the harness; the LLM firewalls don't model
provenance or the plugin manifest.

## Relation to vigiles's two pillars

- **Pillar 1 (reference verification)** already covers a slice of AST04/AST02
  for free: it verifies the rule/file/script/symbol references in an instruction
  file are real and enabled. A poisoned or drifted instruction surface _is_ a
  reference-integrity problem. The SHA-256 integrity hash (`src/integrity.ts`)
  already detects **hand-edits to compiled markdown** — i.e. tampering after
  compile. That is a supply-chain primitive we shipped for a different reason.
- **Pillar 2 (testing the harness)** is the real home. `loadPlugin`
  (`src/plugin-loader.ts`) already parses a third-party plugin's hooks, skills,
  agents, commands and **flags surfaces it can't drive** (`.warnings`). The
  sandbox (`docs/sandboxing.md`) already runs a foreign hook confined with
  deny-all / `recordEgress` / `egress:{allow}`. `runHook`'s `recordEgress` was
  _built with the supply-chain question in mind_ ("what does this skill phone
  home to?") and the OMC dogfood already caught a real plugin's silent
  npm-registry update-check on every session start. **A scanner is mostly a
  re-aiming of machinery that exists**, not a new pillar.

## Bold ideas

Ranked: improvement → new direction → pivot. Each: the bet · the risk · the
smallest first step.

### 1. `vigiles scan <plugin|mcp>` — the harness-aware lint (IMPROVEMENT)

- **The bet.** Re-aim `loadPlugin` + the sandbox into one command that emits a
  findings report against the OWASP Agentic Skills Top 10, but **only the rows
  we can do better than a YARA scanner**: (a) **observed egress** — boot the
  plugin's hooks under `recordEgress`, list every host they reached vs a declared
  allowlist (AST02/AST06); (b) **tool-contract drift** — parse declared `tools:`
  / MCP tool list, diff against what the contract rail would allow (AST03); (c)
  **instruction-surface integrity** — run pillar-1 reference verification +
  integrity hash + flag third-party-content / injection-shaped strings in
  instruction text (AST04/AST08); (d) **delegate the rest** — shell out to
  `gitleaks`/`semgrep`/Socket for secrets/typosquat/deps and _attribute_ the
  findings (don't reimplement). The headline is **"I ran it, here's what it
  actually did,"** not "I grepped it."
- **The risk.** Scope creep into a generic scanner we can't win; users expecting
  CVE-grade coverage. Mitigate by being loud that vigiles does the
  _behavioral + harness_ rows and **delegates** the static rows by design (same
  "don't reimplement linters" rule, applied to scanners).
- **Smallest first step.** `vigiles scan <dir>` that calls `loadPlugin`, runs
  each hook once under `recordEgress`, and prints `r.egress` + `.warnings` +
  pillar-1 reference findings as a table. Zero new mechanism — it's a CLI face on
  `run-hook.ts` + `plugin-loader.ts`. Ship that, see if anyone cares, _then_
  layer contract-drift and the delegated-scanner attribution.

### 2. "Observed-vs-declared" supply-chain manifest (NEW DIRECTION)

- **The bet.** The unique artifact: compile a plugin's _declared_ capabilities
  (tools, egress hosts, files-written) into a manifest, then run it confined and
  **diff observed against declared**, signed with the same SHA-256 chain we
  already use. A green "this plugin did only what it declared, here's the proof"
  badge is something neither static scanners nor runtime firewalls can issue,
  because only we hold both the declaration model and the confined-execution
  trace. Pairs with `assertWroteOnly`/`assertEgressOnly`/`assertNoEgress` (which
  already exist) as the assertion vocabulary.
- **The risk.** Coverage honesty — the sandbox's read-isolation gap and
  proxy-vs-packet limits (documented in `sandboxing.md`) mean "did only what it
  declared" has caveats; over-claiming here is reputationally fatal in security.
  And the deterministic tiers can't drive model-only surfaces (`.warnings`
  already says so).
- **Smallest first step.** Add a `declared:` block to the plugin/spec schema
  (egress allowlist + tool contract) and an `assertObservedMatchesDeclared`
  helper over the existing trace fields. No new runtime; it's a diff over data we
  already capture.

### 3. vigiles as "the security layer for the agent harness" (PIVOT — and I'd say NO)

- **The bet.** Reposition the whole project from "deterministic-constraints +
  harness-testing" to "agent supply-chain security." Ride the OWASP wave and the
  Snyk/Socket funding gravity.
- **The risk.** This is the **wrong move** and I'll argue it in the next section.
  Briefly: it walks into the busiest, best-funded corner of the market
  (Snyk-owns-mcp-scan, Check Point-owns-Lakera, Palo-owns-Protect-AI) and
  abandons the two things vigiles is genuinely _first_ at (cross-catalog
  reference verification; A/B harness eval with significance). Security framing
  also raises the trust bar to a level a young tool can't meet — a security
  scanner that misses something is worse than no scanner.
- **Smallest first step.** Don't. If the pull is irresistible, express it as
  idea #1 (a feature) and let adoption decide, rather than re-branding.

## Honest case against

- **The scanner market is saturated and consolidating.** Snyk bought Invariant
  Labs (mcp-scan); Check Point bought Lakera; Palo Alto bought Protect AI; Cisco
  bought Robust Intelligence. Three of the four AI-security startups that
  mattered were absorbed by platform vendors in under two years. Entering as
  "another scanner" in mid-2026 is entering a closing door.
- **Security is a trust-asymmetric business.** A reference verifier that misses a
  stale path is a bug; a security scanner that misses a malicious skill is a
  breach you're now liable for. vigiles is pre-adoption
  (`research/distribution-strategy.md`) — taking on security-grade trust
  obligations before having users is backwards.
- **"Delegate, don't build" still mostly holds.** The skill-eval-landscape punt
  was right about the _static_ rows (secrets/malware/typosquat/deps) —
  `gitleaks`/`semgrep`/Socket do those better and it'd violate the
  don't-reimplement rule. What's changed is only that one **behavioral** row
  (AST08) opened up that we're uniquely placed to fill. Build _that_ thin slice;
  keep delegating the rest. The punt is **refined, not overturned.**
- **It can dilute the actual moat.** Pillar 1's 7-catalog cross-referencing and
  pillar 2's significance-tested A/B eval are things _no one else does_. A
  half-built scanner competing with Snyk would trade a defensible niche for an
  indefensible one.

**Verdict:** Build idea #1 as a **feature of pillar 2** (a CLI face on machinery
we already shipped, loud about what it delegates). Treat idea #2 as the
differentiated artifact to grow into. **Reject the pivot.** vigiles's honest
one-liner stays "deterministic constraints + test the harness" — with "...and it
can tell you what a third-party plugin actually does before you trust it" as a
_capability_, not an identity.

## See also

- [skill-eval-landscape](skill-eval-landscape.md) — the original "delegate,
  don't build" call this doc refines (its §1 absorb-list item 4).
- [sandbox docs](../docs/sandboxing.md) — the bwrap tiers, `recordEgress`,
  `egress:{allow}`, and the honest read-isolation / proxy-vs-packet limits any
  scan claim must respect.
- [sandbox-network](sandbox-network.md) — the resolver-pinned dynamic-allowlist
  layer that would let a scan _name_ dropped hosts, not just count them.
- [feature-ideas §13](feature-ideas.md) — the sandboxed-untrusted-exec idea this
  builds on.
- [runtime-enforcement](runtime-enforcement.md) and `src/agent-runtime.ts` —
  the declared-vs-enforced tool-contract rail (#4740/#21460, SDK #172) idea #2 generalizes.
- [distribution-strategy](distribution-strategy.md) — why the pre-adoption stage
  argues against the security-grade trust bar of a full pivot.
