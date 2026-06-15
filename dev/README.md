# dev/ — internal vigiles development skills

These skills are for **developing vigiles itself**, not for consumers. They are
deliberately **not** part of the shipped Claude Code plugin (`.claude-plugin/`)
and **not** published to npm, so `vigiles init` never installs them into a user's
project:

- `skills/generate-logo` — generate/iterate the vigiles logo (ImageRouter API).
- `skills/pr-to-lint-rule` — turn a recurring PR review comment into a custom
  lint rule with tests + a spec entry.
- `skills/enforce-rules-format` — validate vigiles's own spec rules carry a
  proper enforce/check/guidance classification.
- `skills/audit-feedback-loop` — score this repo's feedback-loop maturity.

## Using them as a contributor

Load this directory as a plugin in a Claude Code session:

```
/plugin marketplace add ./dev
/plugin install vigiles-dev@vigiles-dev
```

or point an eval/test at it with `--plugin-dir dev/` (see
`examples/harness/dogfood/generate-logo.trigger.eval.mjs`).

The consumer-facing skills live under `skills/` and ship in the `vigiles`
marketplace plugin.
