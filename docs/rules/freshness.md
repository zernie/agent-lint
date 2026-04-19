# freshness

## What is "freshness"?

Your spec compiles to a markdown file (CLAUDE.md, AGENTS.md). The markdown is a **build artifact** — the spec is the source of truth. A markdown file is **fresh** if recompiling the spec right now would produce identical output. It's **stale** if anything has changed since it was last compiled.

Things that make compiled markdown stale:

- Someone edited the spec but forgot to run `vigiles compile`
- Someone hand-edited the compiled markdown directly (the SHA-256 hash mismatch reveals this)
- A linter config changed and disabled a rule the spec still claims is enforced
- A file path in `keyFiles` was renamed or deleted on disk
- An npm script the spec references was removed from package.json
- Generated types went out of sync with installed linters

When markdown is stale, **the agent reads lies**. It trusts a CLAUDE.md that references a disabled rule, a deleted file, or a removed script. The whole point of vigiles is preventing this — the `freshness` rule is what catches it.

## What you'll see

```
Freshness check:

  ✓ CLAUDE.md  — fresh
  ✗ AGENTS.md  — Output would differ if recompiled — run `vigiles compile`
```

Run `vigiles compile` and the staleness is gone. In CI with `"error"` severity, the build fails until you do.

## Configuration

```json
{
  "rules": {
    "freshness": "warn"
  }
}
```

With options (ESLint-style tuple):

```json
{
  "rules": {
    "freshness": ["error", { "mode": "strict" }]
  }
}
```

### Severity

| Value              | Behavior                                  |
| ------------------ | ----------------------------------------- |
| `"error"`          | `vigiles audit` exits non-zero (CI fails) |
| `"warn"` (default) | Prints warning, exits 0                   |
| `false`            | Skip freshness checks entirely            |

### Options

| Option        | Default    | Description                                                              |
| ------------- | ---------- | ------------------------------------------------------------------------ |
| `mode`        | `"strict"` | Detection mode: `"strict"`, `"input-hash"`, or `"output-hash"`           |
| `extraInputs` | `[]`       | Additional files to track in input-hash mode (e.g., monorepo lock files) |

### Modes

| Mode            | What it checks                                          | Cost          | False positives | False negatives |
| --------------- | ------------------------------------------------------- | ------------- | --------------- | --------------- |
| `"strict"`      | Recompiles in memory, diffs against existing output     | 2-5s per spec | Zero            | Zero            |
| `"input-hash"`  | Compares stored input fingerprint against current state | <100ms        | Possible        | Possible        |
| `"output-hash"` | Only checks if the `.md` was hand-edited                | <1ms          | Zero            | Many            |

**Strict mode** is the correct default. It catches every kind of staleness with zero false positives.

**Input-hash mode** is faster for projects with many specs or slow linter config loading. Use `extraInputs` to track files outside the auto-detected set (e.g., a monorepo root lock file):

```json
{
  "rules": {
    "freshness": [
      "warn",
      { "mode": "input-hash", "extraInputs": ["../../yarn.lock"] }
    ]
  }
}
```

## What counts as an input

In input-hash mode, vigiles auto-detects and tracks:

- Spec source file (`.spec.ts`)
- Linter configs (ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop)
- Package manifest (`package.json`)
- Lock files (15 ecosystems: npm, Yarn, pnpm, Bun, Bundler, Poetry, uv, PDM, pip, Cargo, Go, Composer, NuGet, SPM, Mix)
- Referenced files from `keyFiles`
- Generated types (`.vigiles/generated.d.ts`)
