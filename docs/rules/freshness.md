# freshness

Detect when compiled instruction files are out of date. Catches drift between specs and the compiled markdown.

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

## Why

The spec may be correct but the compiled markdown stale — someone changed the ESLint config, deleted a referenced file, or edited the spec without recompiling. This rule catches it.
