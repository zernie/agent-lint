/**
 * Pure tool-contract PARSERS for a compiled agent/skill `.md` — extracted from
 * `agent-runtime.ts` so a consumer can read a `tools:`/`allowed-tools:` contract
 * WITHOUT pulling `agent-runtime.ts`'s `node:fs` runtime rail into the bundle.
 *
 * The deterministic audit engine (`scan-core.ts` → `scanAgents`/`scanSkills`)
 * reads these contracts in the browser, where `node:fs` cannot be bundled; the
 * live PreToolUse rail (`agent-runtime.ts`) re-exports both so its callers are
 * unchanged. Node-free by construction — the only dependency is the shared
 * lenient frontmatter reader (`core/frontmatter-read.ts`, js-yaml, no `node:`).
 */
import {
  readFrontmatter,
  frontmatterList,
} from "../../core/frontmatter-read.js";

/**
 * Parse an agent's allowed-tools contract from its compiled markdown.
 *
 * Returns the list of allowed tool names, or `null` when the agent declares no
 * `tools:` line at all — which in Claude Code means it inherits EVERY tool (the
 * #1 footgun). `null` is the "no restriction" signal the decision logic honors;
 * an empty list (`tools:` with nothing after it) means "no tools allowed".
 */
export function parseAgentTools(markdown: string): string[] | null {
  return parseAgentToolList(markdown, "tools");
}

/**
 * Parse a comma/array tool list under an arbitrary frontmatter `key` (e.g.
 * `tools:` or `disallowedTools:`) via the shared lenient reader
 * (core/frontmatter-read.ts): a real YAML parse (so `key: [Read, "Bash"]` is a
 * native array and `key: Read, Bash` a comma scalar) with a regex salvage when
 * the block is malformed — the rail still reads the contract. `null` when the key
 * is absent (inherits all), `[]` when present-but-empty (no tools). Shared by the
 * rail (`tools:`) and the `disallowed-tools-contract` scan/lint.
 */
export function parseAgentToolList(
  markdown: string,
  key: string,
): string[] | null {
  return frontmatterList(readFrontmatter(markdown), key);
}
