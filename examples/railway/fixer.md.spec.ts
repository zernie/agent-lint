/**
 * Example subagent (recovery step): fixer.
 *
 * Source of truth for `agents/fixer.md`. The bounded-recovery worker: it takes a
 * failing step's error payload and tries to address it. The railway caps how
 * many times it runs (recover.max) — the finite, sub-Turing guarantee.
 */
import { experimental_agent, result, prose, cmd } from "../../src/core/spec.js";

export default experimental_agent({
  name: "fixer",
  description:
    "Address a failing step's findings, then re-verify. Dispatched by the railway's bounded recovery.",
  model: "sonnet",
  tools: ["Read", "Edit", "Bash", "Grep"],
  body: prose`You receive a failing step's error payload (findings or logs)
and fix the underlying issue. Re-run ${cmd("npm test")} before reporting success.
If you cannot fix it, return a reason so the railway falls to the error track.`,
  output: result(
    { files: "string[]", summary: "string" },
    { reason: "string", retryable: "boolean" },
  ),
});
