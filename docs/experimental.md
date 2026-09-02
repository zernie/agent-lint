# What `experimental_` means, and what would have to be true to drop it

An export whose name starts with `experimental_` is one we ship and do not yet
promise. The prefix is not a disclaimer — it is the warning at the only place a
reader reliably looks: **the call site**. An import line scrolls out of view, a
changelog entry is read once, a doc note is read never. `experimental_x()` is in
every diff, every review and every autocomplete for as long as it is unstable.

Renaming an `experimental_` symbol is **not** a breaking change and gets no major
bump. That is what the prefix buys, and it is the whole trade.

## Contents

- [The rule](#the-rule) · [What is experimental today](#what-is-experimental-today)
- [Exit criteria](#exit-criteria) · [Why the name and not a tag](#why-the-name-and-not-a-tag)

## The rule

If we export it and it is not stable, its name starts with `experimental_`.

Declare it once with the `@experimental` TSDoc tag; the ESLint rule
`local/experimental-name` fails the build if a tagged, exported declaration lacks
the prefix, so the tag and the name cannot drift.

**One experimental root per feature.** The prefix says whether _this_ name is
stable; it cannot say whether the names it depends on are. So a feature's whole
vocabulary hangs off one marked root — `experimental_agent.result()` rather than a
stable `result()` that is meaningless without an unstable `agent()`. It also
survives destructuring, which an import subpath does not.

## What is experimental today

| symbol                                                      | since      | why it is not stable yet                                                                                                                                        |
| ----------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experimental_defineHook` and the five sibling entry points | 2026-08-20 | named state (`record`/`state`) has one author and no outside consumer; testing a stateful hook has no seeding API beside `runHook`; `compile` is not idempotent |
| `experimental_equivalentDisasters`                          | 2026-09-02 | days old, one consumer (this repo's own dogfood), no external use; the transform families and the variant-id shape are the parts most likely to move            |

## Exit criteria

A symbol drops the prefix when **all** of these hold. They are deliberately about
other people, because everything else is self-assessment:

1. **A consumer that is not us.** At least one user outside this repository depends
   on it, and we know what they do with it. One in-repo dogfood is not evidence —
   it is written by the same person who wrote the API, against the same
   assumptions.
2. **A shape nobody has needed to change for a release cycle.** Not "we like it" —
   no signature, no return shape and no option key moved.
3. **The named gaps are closed or accepted in writing.** The table above lists them
   per symbol; each is either fixed or written down as a permanent limitation with
   its reason.
4. **Testing it needs no private knowledge.** If the only way to exercise it is to
   hard-code a path the runtime derives, the API is not finished — a consumer
   cannot test their own use of it.

Dropping the prefix is a `feat!` with a major bump, because the name changes.

## Why the name and not a tag

We learned this by getting it wrong. `skill()` shipped under a stable name while
`docs/skills.md` opened with "`skill()` is experimental", and nothing caught the
contradiction, because the convention was a habit rather than a check.

A `vigiles/experimental` import subpath was tried and retired for the same reason:
it marks the import line, which is out of view by the time anyone reads the call.

## See also

- [Compiled hooks](compiled-hooks.md) — the largest experimental surface, and the
  guide that explains what each entry point does.
- `STABILITY.md` — the stability contract for everything that is _not_ prefixed.
