# Agent Setup Guide

**One command is all you need.** `npx vigiles init` handles everything non-interactively — the agent runs it, skills and hooks take over, and there are no manual chores afterward. This guide shows what happens and what fallbacks exist.

→ Back to [README](../README.md)

## Contents

- [What an Agent Can Do](#what-an-agent-can-do)
- [Non-Interactive Setup](#non-interactive-setup)
  - [Step 1: Run the wizard](#step-1-run-the-wizard)
  - [Step 2: Install hooks directly (fallback)](#step-2-install-hooks-directly-fallback)
  - [Step 3: Edit the spec](#step-3-edit-the-spec)
  - [Step 4: Compile and verify](#step-4-compile-and-verify)
- [Recommended Agent Prompt](#recommended-agent-prompt)
- [What the Agent Gets Wrong](#what-the-agent-gets-wrong)
- [See also](#see-also)

## What an Agent Can Do

| Action                   | Agent can do it? | How                                                                                                                              |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Create spec file         | Yes              | `npx vigiles init` (non-interactive wizard)                                                                                      |
| Generate types           | Yes              | `npx vigiles generate types`                                                                                                     |
| Compile specs            | Yes              | `npx vigiles compile`                                                                                                            |
| Add the dev dependency   | Yes              | `npx vigiles init` adds `vigiles` to devDeps                                                                                     |
| Add CI step              | Yes              | Edit `.github/workflows/*.yml` directly                                                                                          |
| Install the plugin       | Maybe            | `claude plugin install vigiles@vigiles` if the `claude` CLI is on PATH; else the user runs the two `/plugin` commands in-session |
| Install hooks (fallback) | Yes              | Write to `.claude/settings.json` directly                                                                                        |

**The plugin installs globally** — into `~/.claude/plugins/`, never vendored into your repo. `init` calls the `claude plugin` CLI when available. If the `claude` CLI is not on PATH, it prints the two in-session slash commands for the user to run. An agent that can't reach `claude` at all can still get hook behaviour by writing directly to `.claude/settings.json` (see Step 2 below).

## Non-Interactive Setup

### Step 1: Run the wizard

```bash
npx vigiles init        # or `npx vigiles init --yes` to be explicit
```

`init` **auto-detects a non-TTY** and runs without prompts. A user prompt as simple as _"set up vigiles in this repo"_ is enough — the agent runs this command and gets sensible defaults.

**What `init` sets up by default:**

- **Lint layer** — a typed `.spec.ts` + generated types
- **Test layer** — a starter `vigiles.harness.mjs`
- **CI** — a `zernie/vigiles@v1` workflow at `.github/workflows/vigiles.yml`
- **Dependency** — `vigiles` added to `devDependencies`
- **Plugin** — Claude Code plugin installed via the marketplace

Scope it with flags when needed: `--lint`, `--test` (one layer or both), `--harness=claude,codex`, `--no-gha`, `--no-plugin`, `--strict`. A human running it in a terminal gets interactive prompts instead.

### Step 2: Install hooks directly (fallback)

The plugin already brings the hooks. If you'd rather commit project-level hooks instead of (or alongside) the plugin, write them to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "FILE=$(cat | jq -r '.tool_input.file_path // empty') && case \"$FILE\" in *.md) [ -f \"$FILE\" ] && head -1 \"$FILE\" | grep -q 'vigiles:sha256:' && { echo \"BLOCKED: Edit the .spec.ts source instead.\" >&2; exit 2; } ;; esac; exit 0"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "FILE=$(cat | jq -r '.tool_input.file_path // empty') && case \"$(basename \"$FILE\")\" in eslint.config.*|.eslintrc*|package.json|pyproject.toml|Cargo.toml) npx vigiles generate types 2>&1 || true ;; esac && case \"$FILE\" in *.spec.ts) npx vigiles compile 2>&1 || true ;; esac"
      }
    ]
  }
}
```

This is equivalent to what the plugin installs, but written directly without the skills system.

### Step 3: Edit the spec

**The agent reads the generated `.spec.ts`** and fills in the project's actual conventions — sections, key files, commands, and rules. Use the `edit-spec` skill instructions as a guide for the spec format.

### Step 4: Compile and verify

```bash
npx vigiles compile
npx vigiles lint
```

## Recommended Agent Prompt

If you want an agent to set up vigiles in a project, use this prompt:

```
Set up vigiles for this project:
1. Run `npx vigiles init` (it adds vigiles to devDependencies and installs the
   Claude Code plugin via the marketplace — nothing is vendored into the repo)
2. Read the generated .spec.ts file
3. Fill in the project's actual conventions based on the codebase
4. Run `npm install`, then `npx vigiles compile` to verify everything works
5. Commit the .spec.ts, compiled .md, .vigiles/generated.d.ts, and package.json
```

## What the Agent Gets Wrong

Common issues when agents set up vigiles:

- **Editing CLAUDE.md directly** — the PreToolUse hook prevents this if installed
- **Using wrong rule names** — `enforce("no-console")` instead of `enforce("eslint/no-console")`. The compiler catches this.
- **Forgetting to compile** — the PostToolUse hook handles this automatically
- **Adding headers inside sections** — the compiler catches `#`/`##` headers in section content

## See also

- [Agent Workflows](agent-workflows.md) — per-agent setup (Claude Code, Codex, Cursor, CI)
- [Markdown mode](markdown-mode.md) — inline comments and frontmatter (no `.spec.ts` required)
- [CLI reference](cli.md)
