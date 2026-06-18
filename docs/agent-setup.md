# Agent Setup Guide

How to set up vigiles when an AI agent is doing the installation (non-interactive).

## What an Agent Can Do

| Action                   | Agent can do it? | How                                                                                                                              |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Create spec file         | Yes              | `npx vigiles init` (non-interactive wizard)                                                                                      |
| Generate types           | Yes              | `npx vigiles generate-types`                                                                                                     |
| Compile specs            | Yes              | `npx vigiles compile`                                                                                                            |
| Add the dev dependency   | Yes              | `npx vigiles init` adds `vigiles` to devDeps                                                                                     |
| Add CI step              | Yes              | Edit `.github/workflows/*.yml` directly                                                                                          |
| Install the plugin       | Maybe            | `claude plugin install vigiles@vigiles` if the `claude` CLI is on PATH; else the user runs the two `/plugin` commands in-session |
| Install hooks (fallback) | Yes              | Write to `.claude/settings.json` directly                                                                                        |

The plugin installs through the Claude Code **marketplace** — globally into
`~/.claude/plugins/`, never vendored into the repo. `init` runs the
non-interactive `claude plugin` CLI when it's available; otherwise it prints the
two in-session slash commands for the user to run. An agent that can't reach the
`claude` CLI can still get the hook behaviour by writing it to
`.claude/settings.json` directly (Step 2).

## Non-Interactive Setup

### Step 1: Run the wizard

```bash
npx vigiles init        # or `npx vigiles init --yes` to be explicit
```

`init` auto-detects a non-TTY (an agent / CI / piped input) and runs
**non-interactively** — no prompts, no hanging. So a user prompt as simple as
_"set up vigiles in this repo"_ works: the agent runs `npx vigiles init` and gets
sensible defaults. With the defaults it sets up **both layers** — Lint (a typed
spec + types) and Test (a starter `vigiles.harness.mjs`), a
`zernie/vigiles@v1` CI workflow (`.github/workflows/vigiles.yml`), `vigiles` added
to `devDependencies`, and the Claude Code plugin installed via the marketplace.

Scope it with flags when needed: `--lint`, `--test` (one layer or both),
`--harness=claude,codex`, `--no-gha`, `--no-plugin`, `--strict`. (A human running
it in a terminal gets interactive prompts instead.)

### Step 2: Install hooks directly (fallback)

The plugin already brings the hooks. If you'd rather commit project-level hooks
instead of (or alongside) the plugin, write them to `.claude/settings.json`:

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
        "command": "FILE=$(cat | jq -r '.tool_input.file_path // empty') && case \"$(basename \"$FILE\")\" in eslint.config.*|.eslintrc*|package.json|pyproject.toml|Cargo.toml) npx vigiles generate-types 2>&1 || true ;; esac && case \"$FILE\" in *.spec.ts) npx vigiles compile 2>&1 || true ;; esac"
      }
    ]
  }
}
```

This is equivalent to what the plugin installs, but written directly without the skills system.

### Step 3: Edit the spec

The agent should read the generated `.spec.ts` file and fill in the project's actual conventions — sections, key files, commands, and rules. Use the `edit-spec` skill instructions as a guide for the spec format.

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
