---
name: pr-to-lint-rule
description: Synthesize a recurring code-review rule into a custom lint rule — gated by an independent soundness test that abstains rather than ship a checker it can't prove sound
disable-model-invocation: true
argument-hint: <a prose rule, or a "custom rule (⚙)" line from a vigiles audit>
---

Turn a prose rule that **no off-the-shelf linter rule matches** into a custom
lint rule — the opt-in **synthesis** step. This is the hand-off target of the
**custom rule (⚙)** lane in a `vigiles audit` rule map: audit maps a rule there
when it looks enforceable but nothing off-the-shelf fits. You invoke this skill
explicitly; nothing here runs on its own, and installing vigiles never starts
synthesizing anything.

The point of this skill is **not** "write a checker." A model can write a
plausible-looking checker in seconds. The point is the discipline that makes the
result **trustworthy**: synthesize the rule **and** an independent test that
encodes the rule's real _intent_, run the checker against adversarial cases it
didn't author, and **abstain** — hand it back as prose — if it leaks. A checker
that matches a rule's _surface_ but not its _intent_ gives false confidence
(the measured failure mode: most naively-synthesized checkers silently leak).
Shipping a green check nobody should trust is worse than shipping nothing.

## Arguments

`$ARGUMENTS` — a prose rule to enforce. Either a **custom rule (⚙)** line copied
from a `vigiles audit` report, or free text. Examples:

- "we keep telling people not to import directly from antd — use our design-system barrel"
- "people forget to use our custom logger instead of console.log"
- "wrap outbound API calls in our `withRetry` helper"
- "route handlers must go through the `withAuth` wrapper"

## The pipeline

```
prose rule
  → detect language + linter (ask if ambiguous)
  → REUSE first: does an off-the-shelf rule already fit? → use it, STOP (no synthesis)
  → clarify intent + read the codebase (what exactly is the violation? the fix?)
  → SYNTHESIZE: the rule  +  an INDEPENDENT intent-encoding test (adversarial cases)
  → TRUST GATE: run the checker on that test; precision AND recall must be 1.0
        pass → KEPT     (safe to enforce; wire it in)
        leak → ABSTAIN  (hand back as prose; never ship a checker it can't prove sound)
```

## Instructions

### Step 1 — Detect the language and toolchain

Read the repo to find the **primary language**, the **linter in use** (ESLint,
Ruff, Pylint, Clippy, RuboCop, Stylelint…), the **test framework**, and any
**existing custom rules** (to match conventions). If you cannot confidently pick
one — polyglot repo, no linter config, several candidates — **ask the user**
before generating anything.

### Step 2 — REUSE before you synthesize (ADOPT > REUSE > SYNTHESIZE)

Synthesis is the **last** resort, not the first. Before writing any rule:

1. **Check existing plugins / built-in rules.** Read the linter reference doc
   below (the plugin table + `no-restricted-*` families) — most one-off
   prohibitions are a config line, not custom code.
2. **Try a built-in construct rule.** ESLint `no-restricted-syntax` /
   `no-restricted-imports`, Ruff/Pylint selects, RuboCop cops, etc.
3. **Only synthesize** when the rule needs AST analysis, a fix, or options that
   no existing rule provides.

If an off-the-shelf rule fits, **use it and stop** — enable it (one config line)
and jump to Step 6. That is the `strengthen` outcome, and it's the better one;
don't synthesize a rule when a maintained one exists.

| Language              | Linter    | Reference doc                              |
| --------------------- | --------- | ------------------------------------------ |
| JavaScript/TypeScript | ESLint    | `../../../skills/linter-docs/eslint.md`    |
| Python                | Ruff      | `../../../skills/linter-docs/ruff.md`      |
| Python                | Pylint    | `../../../skills/linter-docs/pylint.md`    |
| Ruby                  | RuboCop   | `../../../skills/linter-docs/rubocop.md`   |
| Rust                  | Clippy    | `../../../skills/linter-docs/clippy.md`    |
| CSS                   | Stylelint | `../../../skills/linter-docs/stylelint.md` |

For **Go**, generate a `golang.org/x/tools/go/analysis` analyzer with
`analysistest` tests. For any other language, use the most idiomatic linting
approach with test cases and integration notes.

### Step 3 — Nail the intent, then read the codebase

Synthesis fails when the checker enforces what's _easy to match_ instead of what
the rule _means_. Before writing anything, pin down:

- **The exact violation.** "No hardcoded secrets" is not "a variable named
  `password`" — it's `apiKey`, `token`, an env-less literal too. "Wrap API calls
  in retry" needs the real signature of the calls and the wrapper.
- **The fix.** What does the compliant form look like, concretely, in _this_
  codebase? Read the real files — the helper's import path, its call shape.
- **The clean lookalikes.** What _looks_ like a violation but isn't? (the pattern
  inside a string, a comment, a JSDoc `@example`; an aliased/namespaced form.)

If any of this is ambiguous — and for anything like "wrap API calls in retry" it
usually is — **ask the user** rather than guessing. A rule built on a guessed
intent will fail the gate anyway; asking is cheaper.

### Step 4 — Synthesize the rule AND an independent intent test

Write two artifacts:

1. **The rule** — prefer AST/keyword analysis over text/substring scanning
   (text-scan checkers false-positive on the pattern appearing in prose; a
   name-based checker false-negatives on synonyms). Follow the reference doc's
   anatomy, fix/suggest, and registration guidance.
2. **An independent test that encodes the INTENT, not the checker's shortcut.**
   This is the trust anchor — write it to the rule's _meaning_, then seed it with
   the adversarial cases that break naive synthesis:
   - **valid (must NOT flag):** the pattern in a string literal, a line comment,
     a JSDoc/docstring `@example`; a camelCase identifier that merely _contains_
     the keyword (`consoleLog`); a compliant call that _looks_ close.
   - **invalid (MUST flag):** every real form of the violation — synonyms
     (`apiKey`/`token`, not just `password`), the aliased/namespaced form
     (`window.console.log`), the wrapped-differently case.

   Do not make the test agree with a shortcut the checker took. If the rule is
   "no hardcoded secret," the test asserts `apiKey` is a violation even if your
   first checker only catches `password` — so the gate can catch the leak.

### Step 5 — The trust gate: precision AND recall must be 1.0

Run the synthesized checker against the Step-4 test (ESLint `RuleTester`, pytest,
`analysistest`, whatever fits the linter).

- **Pass** (every invalid flagged, every valid clean → precision = recall = 1.0):
  the rule is **KEPT** — safe to enforce. Continue to Step 6.
- **Leak** (any false positive or false negative): the rule is **ABSTAINED**.
  Do **not** wire it in. Report honestly _why_ it leaked (e.g. "matches the
  pattern in a comment," "misses `apiKey`") and either (a) hand the rule back as
  prose, or (b) if you can fix the checker, do so and re-run the gate — but never
  ship an un-passed checker.

The reference gate lives in `rule-enforcer/gate.js` (two-stage: self-test + a blind
adversarial gold set), the canonical adversarial cases in `rule-enforcer/gold/gold.json`,
and a runnable end-to-end demo (`cd rule-enforcer && npm run demo` — watch it keep the
sound rules and abstain the two leaky ones). Read them for the case shapes and the
abstain discipline, then mirror it here; don't reinvent the gate.

### Step 6 — Wire a KEPT rule into the instruction file

Only for a rule that passed the gate (or an off-the-shelf rule reused in Step 2).

**v2 specs** (repo has `CLAUDE.md.spec.ts`): add an `enforce()` line and
recompile —

```typescript
"<rule-id>": enforce("<linter>/<rule-name>", "<why>"),
```

then `npx vigiles compile`.

**v1** (hand-written `CLAUDE.md`): append —

```markdown
### <Rule title — imperative, concise>

**Enforced by:** `<linter>/<rule-name>`
**Why:** <one sentence — the architectural reason>
```

### Step 7 — Present the outcome

Show the user, honestly:

- **Kept rules:** the generated files, the gate evidence (the adversarial cases
  it passed), integration steps, the spec/`CLAUDE.md` block, and how to verify
  (run the linter, watch it catch a real violation).
- **Abstained rules:** which rule, _why_ it leaked, and that it stays prose — a
  refused checker is a correct outcome, not a failure to hide.

Then ask before writing any files or editing the spec/`CLAUDE.md`. Nothing is
written for the user automatically.
