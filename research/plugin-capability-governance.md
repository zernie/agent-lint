---
status: active
topic: security
---

# Plugin capability governance — manifest + org-policy landscape (mid-2026)

Two framings of "what is a plugin ALLOWED to do, default-deny": (1) a plugin
DECLARES its capabilities in a manifest the harness enforces; (2) the ORG imposes
a policy every plugin runs within, regardless of what the plugin declares. Survey
of prior art, the agent/MCP governance market, the harnesses' own controls, and
the demand signal. Technically adjacent to vigiles's existing enforcement
primitives (`effects.ts` purity ladder, `tool-contract.ts`, lethal-trifecta,
compiled hooks, egress sandbox) — this maps the landscape those primitives sit in.

> Provenance: both the plugin-declared-manifest and the org-policy + demand
> sections are full sourced surveys (2026-07-03).

## The three governance axes (from the classification)

| Axis                  | What it controls                                                                 | Maturity mid-2026                            |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| **ALLOWLIST-INSTALL** | Which plugin/marketplace/server may even be installed                            | ✅ Best-served everywhere                    |
| **NETWORK-EGRESS**    | What an installed plugin may reach over the network                              | 🟡 Growing fast (AI-aware egress proxies)    |
| **RUNTIME-POLICY**    | What an _already-installed, trusted_ plugin's hook/skill/tool call actually DOES | ❌ **The gap** (for harness-native surfaces) |

## Plugin-DECLARED manifest models (DECLARE-ONLY vs DECLARE+ENFORCE)

Mature ecosystems ship a default-deny, harness-ENFORCED per-plugin capability manifest as table stakes:

- **Browser MV3** — `permissions`/`host_permissions`/`optional_permissions`, browser-enforced at the API/network
  layer (DECLARE+ENFORCE + install/runtime consent).
- **Android** — dangerous permissions runtime-gated since API 23, `SecurityException` on violation (DECLARE+ENFORCE).
  **iOS** — entitlements are kernel/cert-bound (enforce); Privacy Manifest (2024) is review-gated only.
- **Deno `--allow-*` / Node `--permission`** — deny-by-default, granular allowlists, stable (Node ≥ v22.13/23.5).
  The closest prior art to an agent harness (DECLARE+ENFORCE).
- **WASI/WASM capability handles** — no ambient authority at all; the strongest model surveyed.

**The AI-agent world has none of this:**

- **MCP** has NO enforced capability manifest. Tool annotations (`readOnlyHint`/`destructiveHint`/…) are
  self-declared, unverified HINTS. The `roots` primitive is documented in the spec itself as _"not a security
  boundary."_ OAuth 2.1 authenticates client↔server only — says nothing about what a server may touch on the host.
- **Claude Code is worse than documented:** subagent frontmatter `tools:`/`disallowedTools:` are advertised as
  enforcing restrictions, but **anthropics/claude-code#4740** (closed not-planned) proved a subagent with ZERO
  declared tools still executed 7 tool calls — root cause **claude-agent-sdk-typescript#172**: the CLI never maps
  `AgentDefinition.tools` to `--allowedTools` on the spawned child. `plugin.json` is pure wiring
  (hooks/mcpServers/skills) with zero capability-restriction semantics.
- **Codex** has a real OS-level `sandbox_mode`, but subagents merely INHERIT the parent's sandbox rather than
  declaring their own — so even the strongest AI-harness mechanism isn't a per-plugin manifest.

**Headline: no AI-coding-agent ecosystem ships what browsers/mobile/Deno/Node treat as table stakes — a
default-deny, harness-enforced, per-plugin capability manifest.** (This is the exact gap vigiles's PreToolUse
tool-contract rail already fills for one surface — see #4740/#172, which vigiles's `agent-runtime.ts` rail is the
fix for, per the root CLAUDE.md positioning.)

## Prior-art borrow-list (org-imposed policy)

- **Chrome `runtime_blocked_hosts`** — the sharpest transferable idea: constrain what an _already-allowed_
  extension may act on **by target**, independent of the extension's own declared permissions. No analogue
  exists yet in the Claude Code / Codex plugin world (e.g. "even if this hook wants `~/.ssh` or
  `push origin main`, it may not, on THIS org's machines").
- **OPA Gatekeeper / Kyverno (K8s admission control)** — intercept every request BEFORE admission, evaluate
  against org policy-as-code, validate(deny) or mutate(auto-fix) in one pass. The architectural analogue of
  "intercept every tool call / hook registration before it's admitted to the session."
- **Cedar / AWS Verified Permissions** — a declarative, deliberately-not-Turing-complete, analyzable policy
  DSL (principal/action/resource/context). Already a vigiles `enforce("cedar/...")` target.
- **Jamf/Intune MDM** — policy delivered via a channel **decoupled from the artifact** (a config profile the
  OS enforces underneath the app), not by editing the app's manifest.
- **Corporate egress proxy / DLP** — provenance-blind, **payload-aware** (catches base64'd secrets riding to
  an _allowed_ domain, which domain-only allowlists miss).

## The agent/MCP governance market (funded, crowded, 2026)

A fast-moving "MCP gateway" category — gateway sits between agent and MCP servers, terminates auth, enforces
**default-deny tool-level ACLs** (a server exposes 40 tools; agents see only the authorized ones). Named
players + disclosed funding (public sources): **Runlayer** ($11M seed, Khosla/Felicis), **Operant AI**
($13.5M A), **Helmet Security** ($9M), **CodeIntegrity** ($5M seed), **Geordie AI** ($30M A), **Manufact**
($6.3M, YC), **Invariant Labs** (acquired by Snyk), plus AI gateways adding MCP guardrails (Portkey, Kong,
Cloudflare) and OSS (LlamaFirewall, pipelock). ~$40M+ disclosed pure-play MCP-security funding; a broader
roundup claims $392M announced in one week around RSAC 2026.

**Observed gap:** no dedicated third-party product governs a **Claude Code plugin's hooks/skills** or a
**Codex plugin** at the _hook-execution / skill-body_ level. The gateways solve the MCP-tool-call boundary;
harness-native surfaces (shell-process hooks, skill bodies, subagent tool-contracts) are a different surface
they don't reach. Third-party "Claude Code governance" posts mostly _document Anthropic's own controls_
rather than adding enforcement.

## What the harnesses can lock down TODAY

**Claude Code:**

- `managed-settings.json` (+ `managed-settings.d/`, `policyHelper` executable for dynamic policy) — org-enforced,
  non-overridable by user/project/CLI.
- `permissions` allow/deny/ask (deny→ask→allow, first-match) — but scoped to **Claude's OWN tool calls**, not a
  third-party hook script's internal behavior.
- `strictKnownMarketplaces` — marketplace/plugin install allowlist, checked before any net/fs op.
- **The stated gap** (TrueFoundry): _"Plugins run fully trusted code... skills execute shell commands, hooks
  intercept every tool call, with no sandboxing in 2026."_ Once allowlisted, a hook/skill body runs **unconfined**;
  `permissions` doesn't reach it.

**Codex:** more built-out for plugins specifically — JSON policy via Admin API sets each plugin
`INSTALLED_BY_DEFAULT`/`AVAILABLE`/`NOT_AVAILABLE` per user/dept + full invocation logging to SIEM. But it's
**install/log-only** by the evidence — a GitHub discussion titled _"Complementary governance layer for Codex
execution policies"_ signals the runtime-constraint gap is recognized.

## Demand signal (dated, sourced)

- **88%** of orgs reported confirmed/suspected AI-agent security incidents in the last year, vs **82%** of execs
  confident their policies protect them (Gravitee 2026). Only **12%** have mature AI governance (Airia 2026);
  only **6%** updated governance for what agents can do (CSO Online 2026).
- Real 2026 incidents: MCP-SDK "by-design" RCE flaw (150M+ downloads, SecurityWeek Apr 2026); Claude Code source
  leak → `bashPermissions.ts` deny-rule bypass (50-subcommand cap PoC); "Claudy Day" exfiltration (Oasis, Mar
  2026); `claude-code-action` RCE chain (RyotaK, Jan 2026); CVE-2026-22708 (Cursor) allowlist-poisoning; Snyk
  ToxicSkills — 13.4% of 3,984 skills had a critical issue.

## Technical adjacency to vigiles (factual, not positioning)

The RUNTIME-POLICY gap maps onto machinery vigiles already implements at the **individual-plugin-author** level:

- `tool-contract.ts` + the PreToolUse rail (`agent-runtime.ts`) — declared-vs-enforced tool allowlist.
- `effects.ts` purity ladder + `decidePurityGate` — deny a bounded unit's mutating Bash at the live call.
- lethal-trifecta check — the exact "read-secrets ∧ ingest-untrusted ∧ exfil" blast-radius flag.
- compiled hooks — an author writes a correct gate; the VERIFY battery (`guardrail-check.ts`) audits any hook.
- egress sandbox — deny-all / allowlisted real egress.

The open technical question the landscape raises: whether an **org-wide, plugin-author-independent** delivery of
that same enforcement (a `managed-settings`-delivered policy re-applying contract/purity/egress discipline to
_every_ plugin regardless of its own declarations) is a gap no one has filled — the Chrome-`runtime_blocked_hosts`
pattern applied to harness-native plugin surfaces. (Whether/how vigiles should act on that is a STRATEGY question
— kept in the vault, not here, per doc-tiers.)

## See also

- [agent-supply-chain-security](agent-supply-chain-security.md) — the thin harness-aware scan stance.
- [side-effect-separation](side-effect-separation.md) + [bash-effect-classification](bash-effect-classification.md)
  — the purity/effect enforcement primitives.
- [hook-context-providers](hook-context-providers.md) — how a compiled hook reads external policy state.
- [composable-instruction-files](composable-instruction-files.md) — the sibling product-phase research thread.
- [roadmap](roadmap.md) — where product-phase threads slot (behind the report push).
