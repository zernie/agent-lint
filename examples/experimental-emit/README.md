# `experimental-emit` — can an UNFORKED skill emit a structured result?

The runnable half of the `experimental_emitTool` emit channel
(`src/experimental-emit.ts`). Read that module's header first: it lists, by
number, what is unproven and what would have to be true to drop the
`experimental_` prefix.

## The question

A typed `output` contract compiles only on a skill with `context: "fork"` —
`compileSkill` hard-errors `output-without-fork` on every other one, because an
inline skill is spliced into the conversation, has no call→return boundary, and
so has no return value to type.

A **tool call needs no return boundary.** The skill does not return the
structure; it emits it, mid-conversation, and the call lands in
`Trace.toolCalls`. So the objection that grounds the exclusion does not apply to
this delivery.

## What is here

| file                         | 💵      | what it is                                                                                                                                                                                               |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emit-server.mjs`            | $0      | ~70-line dependency-free stdio MCP server serving ONE tool. The tool definition is READ from JSON produced by `experimental_emitTool` — never hand-copied, or the measurement would be testing the copy. |
| `run-emit.mjs`               | 💵 paid | The measurement. Takes a real skill directory, swaps exactly one section for the emit instruction, runs it through the real CLI, reads the result back out of `ctx.toolCalls`.                           |
| `records/records-emit.jsonl` | —       | One line per trial, appended the moment it is measured.                                                                                                                                                  |
| `records/emitted.jsonl`      | —       | The same calls as the SERVER saw them — an independent witness to `Trace.toolCalls`.                                                                                                                     |
| `records/emit-tool.json`     | —       | The tool definition the server actually served.                                                                                                                                                          |

## Run it

```sh
npm run build:core

# $0 — print the patched skill and stop
VIGILES_EMIT_DRY=1 node examples/experimental-emit/run-emit.mjs <skill-dir>

# 💵 real model, real money; the third argument is a hard cost cap
node examples/experimental-emit/run-emit.mjs <skill-dir> 3 0.60
```

`<skill-dir>` is any directory holding a `SKILL.md` **without** `context: fork` —
the runner refuses a forked one, since a forked skill can already carry an
`output:` contract and is not the question. Nothing from the skill is written
back into this repository: the copy is built into a throwaway fixture at run
time, so a private corpus stays private.

The file is deliberately **not** named `*.eval.mjs`. That suffix makes a file
discoverable by `vigiles eval --all`, and a paid run must never be reachable from
a CI sweep.

## The one edit made to the skill

Exactly one section is replaced: `## Record the verdict` — the block that today
shells out to a ledger script — becomes
`experimental_emitTool(contract).instruction`. Everything else, frontmatter
included, is byte-identical to the shipped skill. That substitution is the whole
prototype: the same verdict, carried by a tool call instead of a shell command.

## What this does NOT measure

- **Triggering.** The task names the skill, so skill activation is not being
  sampled here. Whether the skill would have fired on its own is a separate
  question with its own instrument (`measureTriggerRate`).
- **A rate.** The published run is N=3 on one skill and one model. It answers
  "does it land at all". Three of three bounds the true failure rate at roughly
  63% and says nothing more.
- **Schema enforcement.** The runtime does not reject a call that violates its
  own declared `required` fields — measured separately, and the reason
  `experimental_parseEmitted` re-validates on the receiving side.
