# `duplicate-rules`

Near-duplicate rules **within one spec** — two rules that say the same thing in
different words. Detected by NCD (gzip-based) similarity, so it is deterministic
and needs no model.

```json
{ "rules": { "duplicate-rules": "warn" } }
```

|              |                                      |
| ------------ | ------------------------------------ |
| **Default**  | `warn`                               |
| **Surface**  | instruction-file specs (`*.spec.ts`) |
| **Bucket**   | heuristic-behavioral                 |
| **Detector** | `findDuplicateRules`                 |

## What it checks

Every pair of rules inside a spec is compared by normalized compression
distance. A pair below the similarity threshold is reported as spec bloat:
duplicated guidance is guidance the reader has to reconcile, and the model has to
weigh twice.

## Severity

- `"warn"` (default) — reported, exit code untouched.
- `"error"` — a duplicate pair fails the build.
- `false` / `"off"` — the check does not run.

## Why it defaults to `warn`

It is a **proxy**, not a fact: NCD says two strings compress well together, which
is evidence that they overlap and not proof that they are redundant. Two rules
can legitimately share vocabulary and mean different things.

This repo's calibration rule is that a heuristic never defaults to `error`,
because a rule that fails a correct build gets switched off rather than fixed.

## History

Until 2026-09 this check had **no rule id at all** — the finding fed the exit
code directly, so `vigiles lint` could exit 1 over it with no name a config could
even mention, and no way to tier it (#181). Registering it surfaced a second
problem: it was behaving as `error` while being a heuristic, which is exactly the
combination the calibration rule exists to prevent. Set it back to `"error"`
explicitly if the old blocking behaviour is what you want.

## See also

- [`orphan-docs`](orphan-docs.md) — the other check that used to be untierable
  for the same reason.
- The validation-rule matrix in
  [verifying instruction files](../verifying-instruction-files.md).
