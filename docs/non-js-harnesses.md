# Non-JS harnesses (Kotlin, Go, …)

The README has the pitch; this is the full guide for using vigiles on a harness
whose repo is **not** JavaScript/TypeScript — a Kotlin, Go, Java, Rust, or Python
project with no `package.json` and no Node toolchain.

**TL;DR:** vigiles's reference + structural layer works on **any** harness with
**zero toolchain** — you only need `npx`. The linter cross-referencing (“your
rules → enforced”) reaches the JVM and Go ecosystems too. Only the JS-specific
setup (`package.json` devDep, `npm install`) is skipped — you run everything
through `npx vigiles`.

## What works with no toolchain

Everything below runs with **only `npx`** (Node is fetched on demand) — no
`package.json`, no install step, identical output on every OS:

| Command             | Works? | What it checks                                                                                                                                                                                                                      |
| ------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vigiles audit` |   ✅   | The four deterministic rings — Truthfulness (references resolve), Triggering (skills fire / don't collide), Structure (tool contracts, MCP, frontmatter), Safety — plus the advisory Tested count. A local report, like Lighthouse. |
| `npx vigiles lint`  |   ✅   | The CI gate — reference integrity, subagent tool contracts, hook events/scripts, MCP resolution, skill triggers, lethal-trifecta. Exit codes 0/1/2.                                                                                 |

None of these read your repo's source language — they read the **harness**
(`CLAUDE.md`/`AGENTS.md`, `skills/`, `agents/`, hooks, MCP config), which is
markdown + shell regardless of what your app is written in.

## CI on a non-JS repo

`npx vigiles` needs only Node for the CLI itself, so the CI job is just a
checkout + `setup-node` + the Action — no `package.json` required:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: zernie/vigiles@v1
```

`vigiles init` detects this: on a repo with no `package.json` it scaffolds the
workflow **without** an `npm install` step (which would otherwise fail), and it
skips adding vigiles to `devDependencies` — you invoke it via `npx`.

## Linter cross-referencing for JVM / Go

The “rules → enforced” feature verifies that a prose rule (e.g. “always use
`===`” → the `eqeqeq` rule) exists **and** is enabled in your linter config. It
supports native JVM and Go linters, not just the JS/Python ones:

| Ecosystem | Linters        | Rule prefix            |
| --------- | -------------- | ---------------------- |
| Kotlin    | detekt, ktlint | `detekt/…`, `ktlint/…` |
| Java      | Checkstyle     | `checkstyle/…`         |
| Go        | golangci-lint  | `golangci-lint/…`      |

vigiles detects the linter from its config file (`detekt.yml`, `.editorconfig`,
`checkstyle.xml`, `.golangci.yml`) and cross-references your rules against it.
See [`docs/linter-support.md`](linter-support.md) for the full catalog and each
tool's config conventions.

## The Tested metric for a native test loop

`audit`/`lint` count vigiles-native `*.eval.mjs` / `*.harness.mjs` files for the
advisory **Tested** metric. If you test your skills through a native loop instead
(a Kotlin test suite, a Go benchmark, a promptfoo config), point `testGlobs` at
it so those files count — see
[the external-suite section in the untested-skill rule](rules/untested-skill.md#counting-an-external-test-suite-promptfoo-a-home-grown-eval-loop).

## What still assumes JS

The harness-**testing** API (`runHook` / `runHarnessTest` / `runEval` from
`vigiles/testing`) is authored in JS/TS — you `import` it. It tests the
**harness** (hooks, skills, subagents), which is language-agnostic, so it applies
to a Kotlin/Go repo's Claude Code harness too — you just write the test file in
JS (or run the zero-setup `*.harness.mjs` CLI fallback via `npx vigiles test`).
The deterministic `audit`/`lint` layer above needs none of this.

## See also

- [`docs/linter-support.md`](linter-support.md) — the full linter catalog.
- [`docs/harnesses.md`](harnesses.md) — which agent harnesses vigiles targets.
- [`docs/rules/untested-skill.md`](rules/untested-skill.md) — counting an external test loop.
