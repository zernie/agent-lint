/**
 * FAIL CASES for trifecta-types.ts — these are REJECTED by `tsc` alone.
 *
 *   npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
 *     --target es2022 trifecta-fails.ts
 *
 * Each agent below grants all three lethal-trifecta legs (private-read +
 * untrusted-intake + exfil) WITHOUT the `allowTrifecta` sign-off, so the type of
 * `tools` collapses and the call is rejected at the offending argument.
 */
import { agent } from "./trifecta-types.js";

// FAILURE 1 — Read (private) + WebFetch (untrusted) + Bash (exfil), no sign-off.
export const leaker = agent({
  name: "leaker",
  tools: ["Read", "WebFetch", "Bash"],
});

// FAILURE 2 — same trifecta via MCP tools, no sign-off.
export const mcpLeaker = agent({
  name: "mcp-leaker",
  tools: [
    "mcp__github__get_file_contents", // private
    "mcp__fetch__get", // untrusted
    "mcp__github__create_pull_request", // exfil
  ],
});

// FAILURE 3 — the trifecta hidden among extra tools; still rejected.
export const sneaky = agent({
  name: "sneaky",
  tools: ["TodoWrite", "Read", "Edit", "WebSearch", "Write", "Bash"],
});
