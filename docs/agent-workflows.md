# Agent Workflows

**vigiles is low-friction by design.** Run `npx vigiles init` and the installed skills and hooks handle the rest — auto-compiling specs, blocking stray edits, and nudging the agent when something needs attention. This guide shows the per-agent setup.

→ Back to [README](../README.md)

vigiles verifies the rule references in agent instruction files — declared as inline comments, `vigiles:` YAML frontmatter, or a typed spec compiled to markdown ([markdown mode](markdown-mode.md)). Different AI agents read different files, but the validation pipeline is the same. The workflows below use spec mode, the deepest level; the inline and frontmatter levels need no build step.

## Contents

- [Auto-Detection](#auto-detection)
- [Claude Code](#claude-code)
- [Codex / GitHub Copilot](#codex--github-copilot)
- [Multi-Agent (Claude + Codex)](#multi-agent-claude--codex)
- [Cursor / Windsurf / Other Formats](#cursor--windsurf--other-formats)
- [CI Pipeline](#ci-pipeline)
- [See also](#see-also)

## Auto-Detection

`vigiles init` scans your project and **auto-detects which agents you're already using** — no `--target` flag needed unless you want to override.

| Signal                                     | What it means                                     |
| ------------------------------------------ | ------------------------------------------------- |
| `CLAUDE.md` exists                         | Claude Code in use — suggest migration if no spec |
| `AGENTS.md` exists                         | Codex / GitHub Copilot in use                     |
| `.claude/` directory                       | Claude Code project config                        |
| `.cursorrules`                             | Cursor in use — suggest rule-porter               |
| `.github/copilot-instructions.md`          | GitHub Copilot custom instructions                |
| `.windsurfrules`                           | Windsurf in use                                   |
| `rule-porter` / `rulesync` in package.json | Sync tool already installed                       |
| Symlinked instruction files                | Notes them in output                              |

The wizard creates specs for detected targets, generates types, compiles, and adds a CI step.

## Claude Code

**Instruction file:** `CLAUDE.md`

**Setup:**

```bash
npx vigiles init
# init installs the plugin via the marketplace; to do it by hand in Claude Code:
#   /plugin marketplace add zernie/vigiles
#   /plugin install vigiles@vigiles
```

**What the plugin does once installed** — the agent no longer needs to remember to compile:

| Hook        | Trigger                                         | Action                                   |
| ----------- | ----------------------------------------------- | ---------------------------------------- |
| PreToolUse  | Agent tries to Edit/Write a compiled `.md` file | Blocks the edit, redirects to `.spec.ts` |
| PostToolUse | Agent edits a `.spec.ts` file                   | Auto-runs `vigiles compile`              |
| PostToolUse | Agent edits linter config or `package.json`     | Auto-runs `vigiles generate types`       |

⚠️ **Without the plugin**, you must run `vigiles compile` manually after editing specs. CI still catches stale files.

## Codex / GitHub Copilot

**Instruction file:** `AGENTS.md`

**Setup:**

```bash
npx vigiles init --target=AGENTS.md
```

Codex and GitHub Copilot read `AGENTS.md` directly. There is no plugin or hook system — these agents don't support it. The enforcement path is:

1. Edit `AGENTS.md.spec.ts` (the source of truth)
2. Run `npx vigiles compile` to regenerate `AGENTS.md`
3. CI verifies freshness: `npx vigiles lint && npx vigiles generate types --check`

**Authoring skills for Codex** install globally via the cross-agent `skills` CLI — no repo vendoring: `npx skills add zernie/vigiles -a codex -g -y` installs into `~/.agents/skills/`. `vigiles init --harness=codex` runs this automatically. Codex hooks (`.codex/config.toml [hooks]`) aren't auto-wired yet.

ℹ️ **If you also use Claude Code**, install the plugin (`/plugin marketplace add zernie/vigiles` then `/plugin install vigiles@vigiles`, or `vigiles init`) for auto-recompilation.

## Multi-Agent (Claude + Codex)

Use a **single spec with multiple targets** — one source of truth, two outputs:

```typescript
export default claude({
  target: ["CLAUDE.md", "AGENTS.md"],
  rules: { ... },
});
```

Both files compile from the same spec with the same linter verification.

```bash
npx vigiles init                      # for CLAUDE.md (primary)
npx vigiles init --target=AGENTS.md   # adds AGENTS.md target
```

Or just set `target: ["CLAUDE.md", "AGENTS.md"]` in your spec directly.

## Cursor / Windsurf / Other Formats

vigiles compiles to **markdown only** (CLAUDE.md, AGENTS.md). For non-markdown formats (`.cursorrules`, `.github/copilot-instructions.md`, Windsurf), use a sync tool to convert from the compiled markdown:

- [rule-porter](https://github.com/nichochar/rule-porter) — bidirectional conversion between agent formats
- [rulesync](https://github.com/dyoshikawa/rulesync) — unified rule management across 10+ tools

vigiles is the source of truth compiler. Sync tools handle the last mile.

## CI Pipeline

All agents share the same CI step:

```yaml
- name: Verify specs
  run: npx vigiles lint && npx vigiles generate types --check
```

This catches:

- **Hash mismatches** — someone edited the compiled `.md` directly
- **Missing specs** — `require-instructions-spec` rule requires a `.spec.ts` behind every `.md`
- **Stale generated types** — linter config changed but types weren't regenerated

## See also

- [Agent Setup](agent-setup.md) — non-interactive installation and recommended agent prompt
- [Markdown mode](markdown-mode.md) — inline comments and frontmatter (no `.spec.ts` required)
- [CLI reference](cli.md)
