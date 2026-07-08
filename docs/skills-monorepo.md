# Adopting vigiles in a skills monorepo (no `plugin.json`)

> The [README](../README.md) has the pitch; this is the how-to for a repo that is
> **not** a published `.claude-plugin/` marketplace — a CI-tested skill library, or
> a plain Claude Code repo where your skills live under `.claude/`. If `audit`
> reported `F (0/100) — no loadable plugin surface`, this page is for you.

## The three repo shapes vigiles recognizes

You do **not** need a `plugin.json` or a marketplace layout. vigiles loads any of
these as first-class:

| Shape                      | Where skills live                                                                           | Typical repo                     |
| -------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| **Published plugin**       | `skills/<name>/SKILL.md` + `.claude-plugin/plugin.json`                                     | a marketplace plugin             |
| **Skills library**         | `skills/<name>/SKILL.md` at the repo root, no manifest                                      | a CI-tested skill monorepo       |
| **Plain Claude Code repo** | `.claude/skills/<name>/SKILL.md` (+ `.claude/agents`, `.claude/settings.json`, `CLAUDE.md`) | a normal user repo, not a plugin |

Point `audit`/`lint` at the repo root and vigiles reads whichever shape it finds.
You can also point it at a **single skill directory** (the dir holding one
`SKILL.md`) and it scans just that skill.

```bash
npx vigiles audit .                      # the whole repo
npx vigiles audit skills/rca-investigation   # one skill dir
```

ℹ️ **Repo-root `skills/` wins over `.claude/skills/`.** If a repo has both, the
root `skills/` is used — so a plugin author's own local `.claude/skills` dev skills
never pollute the audit of what the plugin ships. A plain user (no root `skills/`)
is read from `.claude/skills` as expected.

⚠️ vigiles reads your **project** `.claude/` only. It never scans the machine-global
`~/.claude/` install — CI results stay reproducible and independent of the runner's
home dir.

## Shared `scripts/` / `references/` trees — `sharedDirs`

Many skill libraries keep **one** top-level `scripts/` (or `references/`) tree that
several skills point at, instead of a copy beside every `SKILL.md`:

```
repo/
  skills/eval-generator/SKILL.md   # body references `scripts/promptfoo/leak_scan.py`
  scripts/promptfoo/leak_scan.py   # ...which lives HERE, at the repo root
```

By default a bundled reference resolves against the skill's **own** directory, so
the ref above would be reported as a missing bundled resource. Declare your shared
dirs in `.vigilesrc.json` and vigiles **also** resolves those refs against the repo
root:

```json
{
  "sharedDirs": ["scripts", "references"]
}
```

- ✅ **Opt-in.** A repo that omits `sharedDirs` behaves exactly as before
  (skill-dir-only resolution) — no change.
- ✅ **Scoped.** Only a ref whose **first path segment** is a declared shared dir
  gets repo-root resolution. A ref outside those dirs is never masked by a
  same-named file at the repo root, so a genuinely-missing bundled resource is
  still flagged.

## What resolves and what's skipped in a `SKILL.md` body

The bundled-resource check is deliberately high-precision (it won't cry wolf on a
legitimate authoring style):

| In the body                                                | Treated as                                 |
| ---------------------------------------------------------- | ------------------------------------------ |
| `scripts/run.sh`, `[api](references/api.md)`               | a concrete ref — checked                   |
| `references/*.md`, `scripts/tests/test_<target>_*.py`      | a glob / placeholder — **skipped**         |
| `references/linter-cards/{trivial,contextual}/<linter>.md` | a template placeholder — **skipped**       |
| `Read ~/.claude/docs/x.md`                                 | an external home/global path — **skipped** |
| `${CLAUDE_PLUGIN_ROOT}/x`, `https://…`, `/abs/path`        | var / URL / absolute — **skipped**         |

## Which surfaces gate CI

`audit` is a **local report** (like Lighthouse). For CI, use `vigiles lint` — the
deterministic gate. The lethal-trifecta findings are summarized with a count (one
line per unit); gate on "no NEW trifecta" via the `lethal-trifecta` lint rule
rather than eyeballing the list.

**Scoping.** `vigiles lint` (no path) lints the whole repo — the normal CI call.
Pass a single directory (`vigiles lint packages/foo`) to scope every surface rule
to just that subtree; a file, several paths, or none falls back to the whole repo.
A surface outside the path you pass — and the machine-global `~/.claude` — never
enters the report.

## See also

- [Measuring skills](measuring-skills.md) — A/B a skill on your subscription.
- [Verifying instruction files](verifying-instruction-files.md) — the lint rules.
