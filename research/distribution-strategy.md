---
status: active
topic: positioning
---

# Distribution Strategy: Why Nobody Uses vigiles Yet

Strategic analysis from mid-2026. Several months after first release: downloads near zero, GitHub stars from friends only, no organic discovery. Articles published, package on npm, but no adoption flywheel. This doc breaks down why and proposes concrete moves.

---

## Honest data

- npm downloads/week: ~0
- GitHub stars: friend-network only
- Organic mentions / blog cites / community pickup: none observed
- The "Companion repo for blog post" framing implies organic discovery near zero — only people who read the blog land here.

Without this baseline noted, any "let's improve X" intervention is optimizing in the dark.

---

## Adoption funnel (5 stages)

A dev tool reaches adoption when a user moves through:

1. **Reach** — they learn the tool exists
2. **Resonance** — the problem the tool solves matches a pain they have
3. **Resolution** — they try it, value is visible inside the first 5 minutes
4. **Retention** — they keep using it past the first day
5. **Recommendation** — they tell others, who enter stage 1

Most tools die at stage 1 (nobody finds them) or stage 3 (they try but don't get a value signal fast enough).

---

## Diagnosis per stage

### Stage 1 — Reach: probably the primary bottleneck

- vigiles has no organic discovery surface. npm search doesn't return it for queries someone would actually type ("CLAUDE.md linter", "agent instruction validator").
- "Companion repo for [blog]" is a downstream artifact, not a discovery surface.
- Google for "CLAUDE.md is stale" returns Anthropic docs, not vigiles.
- No HN traction, no targeted Twitter thread, no submitted-to-newsletters.
- No partnership distribution (Claude Code skill marketplace presence is minimal; no Anthropic devrel touchpoint).

### Stage 2 — Resonance: vitamin not painkiller

- The primary pain users feel: "the agent did something wrong." First instinct: prompt engineering, model choice, more rules in CLAUDE.md.
- The SECOND-order pain ("my CLAUDE.md is lying to the agent") is real but not yet recognized by most users. They haven't connected stale references in CLAUDE.md to the symptoms they're seeing.
- vigiles asks the user to recognize a problem they haven't named yet. Hard sell.

### Stage 3 — Resolution: high friction to first value

Path to value today requires:

1. `npx vigiles init`
2. Read and understand the generated `.spec.ts`
3. Migrate existing CLAUDE.md content into the spec
4. Compile, look at output
5. Install hooks for auto-recompile

Five steps before value is visible. Compare ESLint adoption: `npm install eslint && npx eslint .` — two commands, broken code highlighted. Vigiles needs to match that.

### Stage 4 — Retention: probably fine, IF stage 3 lands

For users who actually adopt, the hooks make it self-maintaining. Retention isn't where the funnel breaks — too few people make it this far to know.

### Stage 5 — Recommendation: blocked by 1-3

You can't get recommendations from users you don't have.

---

## Audience narrowness

vigiles is genuinely valuable only when:

- CLAUDE.md / AGENTS.md is non-trivial (≥50 lines)
- It references real things: linter rules, file paths, npm scripts
- The project uses TypeScript (for `.spec.ts`) — though inline mode bypasses this
- Someone on the team has noticed agent reliability issues tied to instructions

This is a narrow slice of all AI-agent users. Most CLAUDE.md files are 10-20 lines of high-level guidance. Those users get no value from vigiles — and that's fine, vigiles isn't for them.

The marketing target is the narrow slice, not all agent users.

---

## Ranked proposals

### A. Zero-commitment scan demo ⭐ recommended

`npx vigiles scan` runs against a raw hand-written CLAUDE.md / AGENTS.md, no `.spec.ts` required, no install commitment. Parses backticked refs (inline code spans + fenced code blocks — structured content only, no natural language NLP) and validates them against actual linter configs / filesystem / package.json. Reports stale refs with concrete suggestions.

**Output is the product.** A screenshot showing "found 3 stale references in your CLAUDE.md" with specific lines is shareable content. The first 30 seconds of user experience produces a tweetable artifact.

Why this works:

- **Stage 3 fix:** value visible in 30 seconds, zero migration.
- **Stage 2 fix indirectly:** running scan on user's OWN repo surfaces their OWN broken refs. Abstract pain becomes concrete, named, with line numbers.
- **Stage 1 fix indirectly:** shareable output → screenshots → distribution.
- **Cost low:** ~100 LOC, reuses existing engines (`checkLinterRule`, `existsSync`, `readPackageScripts`).
- **Honors the no-NLP rule:** only parses markdown-structured code (backticks, fenced blocks), not free prose.

Heuristics for inline code span classification:

| Pattern       | Detection                                                                                                  | Action                           |
| ------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Linter rule   | matches `<prefix>/<rule>` where prefix ∈ {eslint, ruff, clippy, pylint, rubocop, stylelint, cedar, @scope} | `checkLinterRule`                |
| File path     | has `/`, common extension OR starts with `src/`, `lib/`, `tests/`, `docs/`                                 | `existsSync`                     |
| NPM command   | matches `^(npm\|npx\|yarn\|pnpm)\s+\S`                                                                     | `readPackageScripts`             |
| Anything else | no match                                                                                                   | skip silently (not even counted) |

Default policy: pattern-not-matched = skip. Random backticks like `if`, `null`, package names → ignored. Low false positive rate by construction.

### B. Find and capture audience (medium leverage)

- Twitter search "CLAUDE.md" / "AGENTS.md is broken/stale/lying" — reply with scan demo
- HN comments on agent reliability threads — drop relevant link when genuinely useful (no spam)
- Anthropic Discord / Claude Code communities — focused audience
- Submit to "awesome-claude-code" and "awesome-ai-agents" lists

### C. Distribution partnership (high leverage but harder)

- Claude Code skill marketplace — `npx skills add zernie/vigiles` exists, but presence is invisible
- Pitch to Anthropic devrel for inclusion in agent-tooling roundups
- Vercel Skills marketplace
- GitHub App: "Vigiles bot scans your CLAUDE.md on PR" — zero-install path

### D. Reduce conceptual surface (medium leverage)

Recent README rewrite already cut jargon. Next steps:

- Promote inline mode HARDER as the primary onboarding path: "zero new files, just add `<!-- vigiles:enforce -->` comments to your existing CLAUDE.md"
- Position `.spec.ts` as level 2, not the entry point
- Quickstart that takes ≤3 steps: scan → see findings → optionally add inline comments

### E. Public proof of value (medium leverage)

- Run scan on popular OSS repos (React, Next.js, Anthropic SDK, etc.) → publish findings
- "I scanned 1000 CLAUDE.md files. Here's what's broken across the ecosystem." — blog post
- Self-running case: "vigiles found N bugs in its own docs this week"
- Public dashboard of "stale references caught across N participating repos"

### F. Content marketing (slow burn)

- Blog: concrete case studies, before/after numbers
- Twitter threads with scan screenshots
- Talks at AI dev / agent workflow conferences

---

## Recommendation

**Build the scan demo (A) first.** Single move, highest leverage on three funnel stages simultaneously (Reach, Resonance, Resolution). Other proposals are amplification — they need scan to amplify.

Order of operations after A lands:

1. **A** → scan demo ships
2. **E1** → run scan on 10 popular OSS repos, publish findings (one Twitter thread, one blog post)
3. **B** → seed scan into existing community conversations
4. **C** → pitch Anthropic / Claude Code marketplace placement once there's signal that the scan resonates

---

## What NOT to do

- **Don't rewrite the README again.** Just rewrote it. Let it stabilize. Measure before iterating.
- **Don't build core features for non-existent users.** New `block()`, `intercept()`, `boundary()` builders, structural lint, snapshot downgrades — all useless without adoption. Already parked.
- **Don't launch community Discord/Slack** until there's user volume to fill it. Empty community is worse than no community.
- **Don't do generic "AI dev marketing."** Too broad. The narrow audience (people with non-trivial CLAUDE.md who noticed agent reliability problems) is too specific to reach via broadcast.
- **Don't burn cycles on `npm` SEO.** Search-engine SEO on npm doesn't move the needle for a tool nobody is searching for yet. Word of mouth first, then SEO matters.

---

## Open questions / signal to collect

Before any intervention beyond A:

- Track npm downloads/week as scan ships — does it move?
- GitHub traffic insights → which referrers exist? what searches?
- For users who DO install, where do they drop off? (init wizard analytics, opt-in)
- Twitter search for organic mentions over time
- HN search for any vigiles thread

Without these, the next intervention after A is guesswork.

---

## Caveat on the analysis

This whole doc is hypothesis-driven. The "Reach is the bottleneck" framing is my guess, not data. It's the most LIKELY bottleneck for an early-stage dev tool with zero downloads — but it could be that people DO find the README and bounce on stage 3 (resolution friction). Or that they reach stage 4 and find no ongoing value.

The scan demo addresses stages 1-3 simultaneously, which is why it's the recommended move regardless of which specific stage is the bottleneck. It's the highest-EV intervention under uncertainty.

After scan ships and a month of data, this doc should be revised with real numbers.

---

## Update: scan proposal reconsidered

The "scan demo" recommendation above was challenged on the grounds that it relies on heuristic pattern-matching against backticked content in markdown — fundamentally the same anti-pattern we rejected for the fact-drift detector. Most hand-written CLAUDE.md backticks contain keywords (`if`, `null`), package names, generic patterns — not validatable refs. Hit rate would be low, false positives high, the "tweetable output" wouldn't materialize.

Current direction (in progress):

**`vigiles starter`** — read the user's actual linter config (deterministic), pick N high-impact enabled rules, generate inline `<!-- vigiles:enforce ... -->` markers, append to CLAUDE.md after confirmation. Pitch: "your CLAUDE.md doesn't know about 40 of your 42 enabled linter rules — your agent has no idea what's enforced." Concrete number from the user's own project, zero parsing of prose, immediate value via real config data.

This swaps the funnel logic: instead of finding the user's pre-existing broken refs (low signal), we generate fresh markers from their real linter config (100% hit rate, all checkable). The shareable artifact becomes "vigiles added 8 verified rules to my CLAUDE.md in one command."

## Update: markdown-first shipped

The direction stabilized into a broader move than `vigiles starter` alone: **markdown-first adoption**. The diagnosis underneath stages 2–3 was that the `.spec.ts` requirement is the adoption barrier — non-TS projects won't add TypeScript for an instruction-file linter, and brownfield migration from an existing CLAUDE.md is too much friction for the value. So the entry point is now plain markdown, with the typed spec demoted to the deepest of three commitment levels:

- **Level 0 — inline comments.** `<!-- vigiles:enforce ... -->` in an existing CLAUDE.md. Already shipped.
- **Level 1 — YAML frontmatter.** A `vigiles:` block verified by `vigiles lint`, plus `vigiles generate-schema` → a JSON Schema so the editor's built-in YAML LSP autocompletes rule names and squiggles typos. No TypeScript. **Shipped in this pass.**
- **Level 2 — typed spec.** Unchanged; now positioned as "when you want compiler-grade guarantees," not the front door.

What this resolves from the funnel analysis:

- **Stage 3 (resolution friction):** value is visible by adding one marker and running `vigiles lint` — no init, no migration, no build step.
- **Stage 2 (resonance):** the user's own broken/missing refs surface against their own config, with line numbers.
- **The narrow-audience problem:** dropping the TS requirement widens the addressable slice to any project with a non-trivial instruction file, regardless of language.

`vigiles starter` (auto-generate markers from config) is still a good idea and composes cleanly on top of Level 0/1 — it's the natural next funnel experiment now that the levels exist. The shareable-artifact framing from the starter proposal carries over: "vigiles added 8 verified rules to my CLAUDE.md in one command" works identically whether the markers land as inline comments or a frontmatter block.

README and docs were inverted to lead with markdown mode (see `docs/markdown-mode.md` and `examples/frontmatter-CLAUDE.md`). Next: measure whether dropping the TS barrier moves the npm-download / star baseline before investing in `starter` automation or the distribution pushes (B/C/E) above.

## Update: runnable 60-second demo shipped (`npm run demo`)

> **Status (2026-06-12): pulled from the README, parked as not-yet-polished.** The script still exists and runs, but the README callout was removed pending a tightened, reliably-passing demo (and a recorded GIF/asciinema) — tracked as **#14** in [`feature-ideas.md`](feature-ideas.md). The analysis below stands; only the README surfacing is on hold.

The "value visible in the first 30 seconds, output is the product" artifact that proposal **A** asked for now exists — but built to dodge the trap that got A _reconsidered_ (heuristic backtick-parsing has a low hit rate and high false positives). `examples/demo/` is a **curated, deterministic** demo, not a prose scanner: an instruction file whose references are explicit marks against real sources, two of which lie. `npm run demo` →

```text
✗ "refreshSession" is not defined in src/auth.ts
✗ MCP tool "helper#purge_all" not found — did you mean "purge"?
```

Why this resolves the A-vs-reconsidered tension:

- **The tweetable artifact materializes** because it's deterministic — no "did the heuristic guess right?" coin-flip. Curated input, 100% signal, real findings (the symbol check parses the file; the MCP check starts a real stdio server and lists its tools).
- **It's honest, not staged** — every catch is a real `vigiles lint` run, reproducible by anyone who clones (`npm run demo`).
- It addresses **Stage 3** (value in 60s, zero setup) and seeds **Stage 1** (shareable output) — same triple-stage logic as A.

What it is _not_: the "scan the user's OWN repo and surface their pre-existing broken refs" hook (the strongest **Stage 2** lever). That remains the heuristic problem A was reconsidered over; the shipped path to a user's own repo is still _add a Level-0 mark, then `lint`_.

**New distinctive Reach hook — MCP reference verification.** `` `vigiles:mcp server#tool` `` starts the declared MCP server and verifies the cited tool exists (with a "did you mean"). No other instruction-file tool does this, and "the GitHub MCP server renamed `create_issue` → `issue_write` and your skill silently broke" is a concrete, current, MCP-ecosystem-shaped pain — a sharper wedge than generic "stale refs."

**E1 substance now exists.** The proposal to "run scan on popular repos and publish findings" needs real targets; the harness work shipped exactly that — vigiles loads and verifies real **obra/superpowers** and **wshobson/agents** plugins (`examples/harness/vendor/`, `real-*.harness.mjs`). The dogfood is the evidence base for an E1 post: _"we pointed vigiles at the top Claude Code plugins — here's what resolves and what doesn't."_ The first behavioral findings from this are logged in [plugin-behavioral-findings](plugin-behavioral-findings.md) — most notably that superpowers' `brainstorming` skill, structurally green, fires on only ~20–30% of its own use-case prompts (a recall bug only the model-gated layer can see). The **deterministic** sweep (444 unique plugins across ~13 marketplaces) is logged in [plugin-structural-findings](plugin-structural-findings.md) — the public-disclosures list (one real bug so far: a plugin shipping skills with no frontmatter) plus the scanner false positives the sweep exposed and we fixed, which is the larger E1 story: a credible scanner, hardened on real plugins.

Order of operations from here is unchanged but now unblocked: the demo is the artifact (**A**, done) → publish an E1 piece using the real-plugin dogfood → seed into communities (**B**). The open question is still **measurement**: does any of this move the npm/star baseline? Nothing here is worth repeating until that signal exists.

## Update (2026-06-21): the competitive read changes the distribution play

A grounded competitive sweep (full record in [`landscape-mid-2026.md`](landscape-mid-2026.md) § "Market-segmented competitive matrix") reframes distribution:

- **No incumbent; the field is an awareness vacuum.** Every in-market rival is a tiny hobby linter (agnix 296★/1-HN-pt is the biggest; rest 6–41★; none in awesome-claude-code's 47k★ list). **The bottleneck is mindshare, not capability or a competitor to dislodge.** So distribution IS the work.
- **The agnix lesson:** the most-built linter (414 rules, LSP, multi-harness) generated ~zero interest. Comprehensive **linting alone does not pull a community.** Lead distribution with the **eval/measurement** angle, not rule-count.

Two new highest-leverage artifacts (also in [roadmap.md](roadmap.md) § Explore):

1. **README status BADGE for cc/codex plugins** — a shield an author drops in their README showing their harness is verified, with TIERS: 🛡 lint-clean → ✅ tested (`runHook`) → 🎯 evaled (trigger-rate/behavior). Every badge is a free ad + social proof, AND the tiers pull authors up the lint→test→eval ladder (the product funnel as a growth loop). Build: a `vigiles badge` verdict + a shields.io-style endpoint. This is the strongest product-tied distribution lever — beats another blog post because it lives in N other READMEs.
2. **Viral debunk articles** — publish A1 findings as "_X is vaporware_" pieces (lead: _"Caveman Mode is vaporware — I measured the viral 75% token-skill and it grew my bill"_). The benchmark is the content; debunks travel (the thing agnix couldn't manufacture). Directly answers the open "does anything move the baseline?" question — measurement-as-marketing.

Net: the prior order still holds (demo → E1 dogfood post → seed communities) but the **badge** (distribution baked into the product) and the **debunk articles** (measurement-as-marketing) are the two adds, and the framing shifts from "better linter" to "the only one that **tests** your harness."
