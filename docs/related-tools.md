# Related tools

vigiles doesn't try to do everything. It owns one thing: compile-time
verification of typed specs against real linter configs, filesystems, and
package.json, plus testing the harness those specs describe. Everything else,
compose:

- **Architectural linting** — [ast-grep](https://ast-grep.github.io/), [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser), [Steiger](https://github.com/feature-sliced/steiger). Reference their rules via `enforce()`.
- **File sync** across agents — [Ruler](https://github.com/intellectronica/ruler), [rulesync](https://github.com/dyoshikawa/rulesync), [block/ai-rules](https://github.com/block/ai-rules). vigiles compiles the source; sync tools distribute.
- **Markdown linting** — [markdownlint](https://github.com/DavidAnson/markdownlint). vigiles generates markdown; structure is correct by construction.
- **Code-block linting in docs** — [eslint-plugin-markdown](https://github.com/eslint/eslint-plugin-markdown) for syntax, [twoslash](https://shikijs.github.io/twoslash/) for TS type-checking.
- **Prose quality** — [Vale](https://vale.sh). Different concern.
- **Runtime LLM rule checking** (e.g. ai-rulez `"AI-Powered Rule Enforcement"`) — opposite paradigm. Those tools send your code to a model on every check, costing tokens and giving non-reproducible verdicts. vigiles compiles once and checks deterministically forever after with `eslint`, `ruff`, `tsc`, Cedar evaluation — tools as deterministic as their inputs.

## Output targets

Specs compile to `CLAUDE.md` by default. Set `target: "AGENTS.md"` or
`target: ["CLAUDE.md", "AGENTS.md"]` for multiple outputs from one spec. For
non-markdown formats (`.cursorrules`, Copilot), use
[rule-porter](https://github.com/nichochar/rule-porter) or
[rulesync](https://github.com/dyoshikawa/rulesync) to convert. See the
[spec format reference](spec-format.md).
