# Testing & eval examples

Runnable examples for **testing your Claude Code harness** — hooks, skills,
settings — at three tiers, cheapest first. Full guide:
[`docs/harness-testing.md`](../../docs/harness-testing.md).

## See it in one command

```bash
npm run demo:plugin
```

Runs vigiles against a **real, popular third-party plugin**
([oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode), ~36k★) and
narrates, in plain language, what it ships, whether a hook works, and what it
phones home to — surfacing a real finding (it pings the npm registry on every
session start; we record and block it). Source:
[`../plugin-test-demo.mjs`](../plugin-test-demo.mjs).

## The examples

Run any with `npx vigiles test <file>` (harness) or `npx vigiles eval <file>` (eval).

| Tier                                          | What it answers                                          | File                                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit** (no model, no `claude`)              | does a hook block/allow / do its job?                    | [`hook-unit.harness.mjs`](hook-unit.harness.mjs) · [`oh-my-claudecode-unit.harness.mjs`](oh-my-claudecode-unit.harness.mjs)                                                                                      |
| **Deterministic** (real `claude`, no API key) | is the hook wired in + does its context reach the model? | [`policy-gate.harness.mjs`](policy-gate.harness.mjs) · [`plugin-cohesion.harness.mjs`](plugin-cohesion.harness.mjs) · [`oh-my-claudecode-deterministic.harness.mjs`](oh-my-claudecode-deterministic.harness.mjs) |
| **Sandbox / network** (bwrap)                 | what does a third-party hook phone home to?              | [`oh-my-claudecode-egress.harness.mjs`](oh-my-claudecode-egress.harness.mjs)                                                                                                                                     |
| **Eval** (real model, paid)                   | does a skill fire / change behaviour?                    | [`skill-outcome.eval.mjs`](skill-outcome.eval.mjs) · [`skill-trigger-rate.eval.mjs`](skill-trigger-rate.eval.mjs) · [`oh-my-claudecode-eval.eval.mjs`](oh-my-claudecode-eval.eval.mjs)                           |

The **oh-my-claudecode** files are one real plugin walked across every tier;
`real-superpowers.harness.mjs` / `real-wshobson.harness.mjs` dogfood the loader
on two more real, vendored plugins (under `vendor/`, pinned + offline).
