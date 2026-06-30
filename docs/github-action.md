# GitHub Action

Run vigiles in CI. The README has the pitch; this is the full Action reference.
For the CLI the Action wraps, see the [CLI reference](cli.md).

The Action is a **composite action over the published `npx vigiles` CLI** — it
runs the exact artifact you'd run locally, so there's no separate bundle to drift.
Every input maps to a real CLI flag.

## Quick start

```yaml
name: vigiles
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read # all the Action needs; it only reads files and emits annotations

jobs:
  vigiles:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: zernie/vigiles@v1 # runs `lint` by default
```

That's the whole thing — `lint` verifies that every linter rule, file path,
script, and symbol your `CLAUDE.md` / `AGENTS.md` cites is real and enabled, checks
the integrity hashes, and reports coverage. Failures appear inline as GitHub
annotations and fail the job.

## Compile specs in CI

```yaml
- uses: zernie/vigiles@v1
  with:
    command: compile # spec.ts → markdown; fails if a reference is stale
    paths: CLAUDE.md.spec.ts # optional; auto-discovers when omitted
```

## Check eval results aren't stale (no model)

Real-model evals run locally on your subscription (`vigiles eval --update`, which
commits a lock). This job verifies those committed results against the current
inputs **without** a model call — failing if you changed a skill but forgot to
re-eval. It's a green no-op until you commit your first lock.

```yaml
- uses: zernie/vigiles@v1
  with:
    command: eval-check # → `vigiles eval --check`; no API key, no subscription
```

## Inputs

| Input               | Default   | Description                                                                                                                                                                      |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`           | `lint`    | `lint` (verify references + integrity + coverage), `compile` (specs → markdown), or `eval-check` (verify committed eval locks vs current inputs — the staleness gate, no model). |
| `paths`             | _(auto)_  | Comma/space-separated paths — `.md` for `lint`, `.spec.ts` for `compile`. Auto-discovers.                                                                                        |
| `version`           | `latest`  | npm version of `vigiles` to run (`1`, `1.2.3`, `latest`). `local` runs a checked-out build.                                                                                      |
| `max-rules`         | _(unset)_ | Cap rules per spec (maps to `--max-rules`).                                                                                                                                      |
| `catalog-only`      | `false`   | Only check that linter rules exist; skip config-enabled checks (maps to `--catalog-only`).                                                                                       |
| `working-directory` | `.`       | Directory to run vigiles in.                                                                                                                                                     |
| `comment`           | `true`    | On `pull_request` events, post/update a sticky PR comment with the result.                                                                                                       |
| `github-token`      | _(auto)_  | Token for the PR comment. Defaults to the workflow token (`${{ github.token }}`).                                                                                                |

## Output channels

Beyond the `valid` step output, the Action reports **three** ways:

1. **Inline annotations** — failures appear on the diff (`::error`).
2. **Job summary** — a markdown result block on the run page (`$GITHUB_STEP_SUMMARY`).
3. **Sticky PR comment** — on `pull_request` events, one comment that is _updated in place_ each run (found by a hidden marker, never duplicated). Requires `pull-requests: write`; set `comment: false` to disable.

```yaml
permissions:
  contents: read
  pull-requests: write # needed for the sticky PR comment

# ...
- id: vigiles
  uses: zernie/vigiles@v1
- run: echo "passed=${{ steps.vigiles.outputs.valid }}"
```

The `valid` output is `'true'` if vigiles passed (exit 0), `'false'` otherwise.
Exit codes (also reflected in `valid`): **0** clean · **1** warnings · **2** hard errors.
On a fork PR (read-only token) the comment step degrades to a warning — the job still passes/fails on the result.

## Versioning

**The Action tag and the npm version are two separate version lines.** The Action
is a thin composite that runs the published `npx vigiles@<version>` CLI, so:

- **Action ref** (`uses: zernie/vigiles@v1`) — pin the **floating major tag**
  `@v1` for automatic patch/minor updates to the _Action wrapper_ (the release
  pipeline keeps `v1` pointed at the latest `1.x` of the action). Pin a full tag
  (`@v1.2.3`) or a commit SHA for byte-for-byte reproducibility. `@main` tracks
  unreleased `HEAD`.
- **CLI version** (`version:` input, default `latest`) — selects which published
  `vigiles` npm release the Action runs (currently `3.x`). Leave it `latest`, or
  pin `version: '3'` / `version: '3.0.0'` to lock the CLI independently of the
  Action tag.

So `uses: zernie/vigiles@v1` with the default `version: latest` runs the newest
`vigiles` CLI (3.x today) through the v1 action wrapper. The `@v1` does **not**
mean "vigiles 1.x". To lock both: `uses: zernie/vigiles@v1` + `with: { version: '3' }`.

```yaml
- uses: zernie/vigiles@v1
  with:
    version: "3" # pin the CLI major; @v1 pins the action wrapper
```

To verify generated types are fresh in CI:

```yaml
- run: npx vigiles generate types --check
```

## See also

- [CLI reference](cli.md) — the commands the Action wraps.
- [Verifying instruction files](verifying-instruction-files.md) — what `lint` checks.
