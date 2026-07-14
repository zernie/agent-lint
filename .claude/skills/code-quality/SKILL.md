---
name: code-quality
description: Improve the quality and type-safety of TypeScript/JavaScript being written or refactored — parse-don't-validate, make-illegal-states-irrepresentable, exhaustive matching, pure-function/IO separation, and public-API hygiene. Use when asked to refactor, clean up, improve, harden, or review the design/quality of code or an API. NOT for hunting bugs (that's /code-review) and NOT for vigiles's own spec/lint rules.
---

Apply a small set of **type-driven** quality techniques when writing or refactoring code. Each technique has its own reference — the principle, a real before/after from this repo, and the smells to grep for. **Read the reference(s) that match the code in front of you; don't apply all five blindly.**

## When this fires

A request to _refactor / clean up / improve / harden / tighten_ code or an API — or when you're about to write a new module/type/public export and want it right the first time. Not a bug hunt (use `/code-review`).

## The techniques — read the matching reference

| Smell in front of you                                                                                                       | Technique                               | Reference                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| a magic `0` / `""` / `-1`; the same primitive re-validated at many sites; `"x" in obj` repeated                             | **Parse, don't validate**               | [`references/parse-dont-validate.md`](references/parse-dont-validate.md)                                 |
| a field that's always `""`; boolean-flag soup; a sentinel standing in for "absent"; an impossible combo that still compiles | **Make illegal states irrepresentable** | [`references/make-illegal-states-irrepresentable.md`](references/make-illegal-states-irrepresentable.md) |
| a `switch`/`if`-chain on a union with no exhaustiveness guard                                                               | **Exhaustive matching**                 | [`references/exhaustive-matching.md`](references/exhaustive-matching.md)                                 |
| logic tangled with IO (`spawn`/`fetch`/`fs`); a function that's hard to test                                                | **Pure functions + injected seams**     | [`references/pure-functions.md`](references/pure-functions.md)                                           |
| a public export with a fuzzy shape; a `string` that means an enum; a leaked internal helper                                 | **Public-API quality**                  | [`references/public-api-quality.md`](references/public-api-quality.md)                                   |

## How to apply

1. **Name the decision out loud** before you change the shape — what illegal state it forbids, where the parse boundary sits (the `surface-architecture-decisions` reflex). A quality change the reviewer can't see is churn.
2. **One technique at a time, tests stay green.** Change the type, let `tsc` show you every call site, fix them, run the tests. Never batch five refactors into one unreviewable diff.
3. **Don't over-abstract** (rule-of-three / YAGNI). A tagged union for 3 real variants is good; an abstraction for a difference that doesn't exist yet is the bug this skill is supposed to prevent.
4. **Prefer the strongest option the DECIDABILITY allows** — a type that can't express the bad state beats a runtime check that hopes to catch it; but a runtime guard at a boundary beats nothing when the input is genuinely dynamic.

## Guardrails

- **Quality only, not correctness.** This skill improves shape/design; it does not hunt for bugs — that's `/code-review`.
- **Every change removes a real failure mode.** If you can't name the bug the new shape prevents, don't make the change.
- **Keep the public surface small.** A new `export` is a contract (see the public-API reference); don't widen it to make a refactor convenient.
