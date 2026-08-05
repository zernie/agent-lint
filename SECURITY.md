# Security Policy

vigiles audits an agent harness — and, at some tiers, **runs it**. Testing a hook, skill, or
plugin means executing someone else's code with your privileges, and an `eval` lets a real model
decide which tools to call. Both are deliberate (that's the point — test what actually ships), and
both are where the interesting bugs live. See [`docs/safety.md`](docs/safety.md) and
[`docs/sandboxing.md`](docs/sandboxing.md) for the full model.

## Reporting a vulnerability

**Please do not open a public issue for a security bug.**

Use GitHub's private reporting: **[Report a vulnerability](https://github.com/zernie/vigiles/security/advisories/new)**
(Security → Advisories → Report a vulnerability). That opens a private thread with the maintainer.

Useful things to include, if you have them: the vigiles version (`npx vigiles --version`), your OS
and whether `bwrap` is available, a minimal repo or fixture that reproduces it, and what you
expected the boundary to do instead.

## Response

vigiles is maintained by one person, so these are honest targets rather than a corporate SLA:

| Stage                                           | Target                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| Acknowledge receipt                             | 5 business days                                         |
| Triage — confirmed, needs-info, or out of scope | 10 business days                                        |
| Fix for a confirmed high-impact issue           | best effort, with progress notes in the advisory thread |

The clock starts when a report is confirmed as a valid vulnerability, not on first receipt. If a
report goes quiet for more than two weeks, please ping the advisory thread — that's a dropped ball,
not a decision.

## In scope

The boundaries vigiles actually claims. A break in any of these is a vulnerability:

- **Sandbox escape** — code under test reaching the host when confinement was reported as active
  (tier A / `bwrap`), including egress that should have been denied.
- **Confinement misreported** — `sandboxAvailable()` reporting a capability the host cannot
  deliver, so a run claims a boundary that isn't there.
- **`interceptTools` bypass** — a model-driven tool call proceeding despite a matching deny rule,
  during an `eval`.
- **A compiled hook that fails open** — hook codegen emitting a guard that permits what its source
  spec denies. A guard that silently doesn't guard is the failure mode this project exists to find,
  so it counts double here.
- **Code execution from parsing alone** — a malicious `CLAUDE.md`, `AGENTS.md`, `SKILL.md`,
  subagent, plugin manifest, or MCP config causing execution during a plain `audit` or `lint`,
  which are meant to be pure reads.
- **Secret disclosure** — credentials, tokens, or environment values leaking into report output,
  `--json`, or on-disk state under `.vigiles/`.

## Out of scope

Not vulnerabilities in vigiles. Reported in good faith, these get a pointer rather than a fix:

- **A low grade, or a finding you disagree with.** A false positive is a bug — file it as a normal
  issue. It is not a security bug.
- **A missed finding.** vigiles' checks are deliberately precision-first and have false negatives;
  [`docs/what-vigiles-catches.md`](docs/what-vigiles-catches.md) describes what is and isn't
  covered. A gap in coverage is a feature request.
- **Vulnerabilities in the harness itself** — Claude Code, Codex, or another agent runtime. Report
  those to the vendor.
- **Vulnerabilities in a third-party plugin, skill, or MCP server that vigiles audits.** Report to
  that project. If vigiles _failed to warn_ about it, that's a coverage gap (above).
- **Vulnerabilities in linters vigiles shells out to** (ESLint, Ruff, RuboCop, Clippy, …) or in npm
  dependencies with no vigiles-specific exposure — report upstream.
- **Missing confinement on a platform where it is documented as unavailable** — bwrap is Linux-only
  by design and macOS confinement is not shipped yet ([`docs/sandboxing.md`](docs/sandboxing.md)).
  Running untrusted code there without a sandbox is documented behaviour, not a bypass. A case
  where vigiles _claims_ confinement it doesn't have is in scope, above.

If you're unsure which side of the line something falls on, report it anyway and we'll sort it out.

## Disclosure

Coordinated. Once a fix is available, we'll publish an advisory describing the issue and the
affected versions. If a report is in scope and confirmed, **you'll be credited by name or handle
in the advisory and the release notes** — tell us which you prefer, or say if you'd rather stay
anonymous.

Only the latest published version on npm is supported. If you're pinned to an older one, upgrade
before reporting — the bug may already be gone.
