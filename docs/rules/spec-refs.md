# `spec-refs`

A compiled instruction file whose `.spec.ts` references a file, script or symbol
that no longer exists.

```json
{ "rules": { "spec-refs": "error" } }
```

|              |                                        |
| ------------ | -------------------------------------- |
| **Default**  | `error`                                |
| **Surface**  | instruction files compiled from a spec |
| **Bucket**   | external-decidable                     |
| **Detector** | `compileClaude`                        |

## What it checks

For every `<file>.spec.ts` whose compiled `<file>` exists, the spec's references
are re-derived and validated exactly as `compile` validates them: `file()` paths
against the filesystem, `cmd()` against `package.json` scripts, `enforce()`
against the real linter catalogs.

## Why the integrity hash is not enough

They answer different questions, and reading them as one is what hid this:

| check       | answers                                       |
| ----------- | --------------------------------------------- |
| `integrity` | is this file still what the spec compiled to? |
| `spec-refs` | do the things it NAMES still exist?           |

An artifact committed while its references were live stays hash-valid forever.
Delete the referenced file afterwards and `compile` errors while `lint` reports
`✓ hash valid — All compiled files intact` and exits 0 — over a file that names a
path the agent will not find.

## Severity

- `"error"` (default) — matches `compile`. A dead reference is decidable from the
  filesystem, not a proxy, so it sits in the hard tier.
- `"warn"` — reported, exit code untouched.
- `false` / `"off"` — skipped.

## Cost

Only specs whose compiled output already exists are loaded, so a repo with no
specs does no extra work. A spec that fails to LOAD is not reported here — that
is `compile`'s finding, and reporting it twice would blame the wrong command.

## See also

- [`integrity`](integrity.md) — the hash half.
- The validation-rule matrix in
  [verifying instruction files](../verifying-instruction-files.md).
