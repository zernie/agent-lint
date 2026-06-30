# skill-resource-resolves

Flag a **SKILL.md body** that references a **bundled file** which doesn't exist on
disk under the skill directory. A SKILL.md routinely points the agent at local
files shipped beside it — `scripts/run.sh`, `references/api.md`, an inline
`` `scripts/setup.py` ``. When the referenced file is missing, the agent reads the
instruction, gets nothing, and **silently continues** — a documented top skill
pain. This is the cross-reference moat applied to the SKILL.md body. Same detector
`vigiles audit` uses (`skillResourceIssues` in `src/core/skill-resources.ts`).

## What it flags

A body reference that is **unambiguously a local bundled resource** but doesn't
resolve on disk:

```
✗ pdf-extract: bundled resource "scripts/extract.py" (line 14) is referenced but
  missing — the agent reads the instruction and gets nothing.
```

It matches two shapes:

- a **markdown link** `[setup](./scripts/run.sh)` whose target is a relative path
  with a file extension, and
- an **inline-code path** `` `scripts/foo.sh` `` that is prefixed by a standard
  bundle dir (`scripts/`, `references/`, `assets/`) and has an extension.

## High-precision (FP-safe)

By the same don't-cry-wolf discipline as the loader's `danglingRefs`, it flags
**only** what is clearly a local resource and **skips** everything ambiguous:

- URLs (`http://…`, `mailto:`), absolute paths (`/etc/x`, `C:\…`),
- `${VAR}` / `$VAR` tokens (plugin-root / runtime paths, uncheckable),
- `../` escapes out of the skill dir (a sibling skill or the repo),
- extension-less mentions (a bare word or a directory name is undecidable prose),
- and a generic inline `` `config.json` `` / `` `src/foo.ts` `` API mention (not a
  bundle-dir path).

The detector prefers **missing a real ref over a false positive** — a noisy
resource check would teach users to ignore it.

## Configuration

```json
{ "rules": { "skill-resource-resolves": "warn" } }
```

### Severity

| Value              | Behavior                                                        |
| ------------------ | --------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a missing bundled resource |
| `"warn"` (default) | Prints a warning, exits 0 (don't-cry-wolf rollout)              |
| `false`            | Skip the check                                                  |

Default is **`warn`** during rollout; raise to `"error"` to gate CI once you trust
it on your own skills.

## Scope

Skills (`skills/*/SKILL.md`) — every harness has skills, so this rule is **not**
capability-gated. References resolve against the skill's own directory (resources
ship beside the SKILL.md).

## Why

A SKILL.md is freeform markdown, so a renamed or un-shipped `scripts/` file rots
silently — the model just doesn't get the resource it was told to use. vigiles
already verifies file/script refs inside typed specs and intra-plugin hook refs in
the loader; this extends that guarantee to the SKILL.md body.

## See also

- [hook-script-exists](hook-script-exists.md) — the same idea for a hook command's
  script file.
- [skill-frontmatter](skill-frontmatter.md) — recommends an explicit, reliable
  trigger surface.
