# Authoring a harness adapter

vigiles ships an adapter for **Claude Code**. Teaching it a new harness — Codex,
Gemini CLI, OpenCode, or your own in-house agent runner — is **writing one
object** against five small port interfaces, then registering it. The core never
changes; the architecture boundary (`core ⊄ adapter`) guarantees it.

Everything you need is one import:

```ts
import {
  type HarnessAdapter,
  type HarnessDialect,
  type PluginLayout,
  type HarnessRuntime,
  type HookProtocol,
  type ModelMock,
  assertAdapterConformance,
} from "vigiles/adapter";
```

## The five ports

A harness differs from Claude Code along two axes — **format** (what it reads and
writes) and **transport** (how it runs) — captured by five descriptors:

| Port             | Axis      | What it describes                                                                                                           |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `HarnessDialect` | format    | built-in tool catalog, never-available tools, MCP tool shape, hook event names, instruction-file targets, plugin-root token |
| `PluginLayout`   | format    | where the instruction file / skills / agents / commands / hooks / settings live on disk + the plugin-root token             |
| `HarnessRuntime` | transport | the agent binary to spawn + the env a no-key mock model is reached through                                                  |
| `HookProtocol`   | transport | how a hook signals block/deny — the block exit code + the decision values                                                   |
| `ModelMock`      | transport | the mock model's wire format (`anthropic-messages` / `openai-responses`) + endpoints                                        |

Each is a plain value object. Implement the ones your harness needs; the
conformance kit tells you what's missing.

## Write the adapter

A `HarnessAdapter` bundles the five ports plus a `detect(root)` predicate the CLI
uses to recognize a repo:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { HarnessAdapter } from "vigiles/adapter";

const dialect: HarnessDialect = {
  name: "my-harness",
  builtinAgentTools: ["Run", "Edit", "Search"],
  neverAvailableTools: [],
  mcpToolPattern: /^mcp__[a-z0-9_-]+__[a-z0-9_-]+$/i,
  hookEvents: ["PreToolUse", "PostToolUse", "Stop"],
  instructionTargets: ["AGENTS.md"],
  pluginRootToken: "${MY_PLUGIN_ROOT}",
};

const layout: PluginLayout = {
  name: "my-harness",
  manifestPath: ".myagent/config.json",
  hooksConventionPath: "hooks/hooks.json",
  settingsPath: ".myagent/settings.json",
  instructionFile: "AGENTS.md",
  surfaceDirs: ["skills", "agents"],
  materializeRoot: ".myagent",
  pluginRootToken: "${MY_PLUGIN_ROOT}",
  mcpConfigFile: ".mcp.json",
  mcpManifestKey: "mcpServers",
  intraRefDirs: ["hooks", "skills", "agents"],
};

const runtime: HarnessRuntime = {
  name: "my-harness",
  agentBinary: "myagent",
  modelBaseUrlEnv: "MYAGENT_BASE_URL",
  modelApiKeyEnv: "MYAGENT_API_KEY",
  mockApiKey: "sk-mock",
};

const hookProtocol: HookProtocol = {
  name: "my-harness",
  blockExitCode: 2,
  denyDecisionValues: ["block", "deny"],
  eventEnvVars: [],
};

const modelMock: ModelMock = {
  name: "my-harness",
  wireApi: "openai-responses",
  modelEndpoint: "/v1/responses",
};

export const myHarnessAdapter: HarnessAdapter = {
  name: "my-harness",
  dialect,
  layout,
  runtime,
  hookProtocol,
  modelMock,
  detect: (root) => existsSync(join(root, ".myagent")),
};
```

## Validate it

Drop the conformance check in your test suite — it verifies every port is
populated **and** that your dialect actually drives the compiler (its own
built-in tools pass the subagent tool-contract check):

```ts
import { test } from "vitest";
import { assertAdapterConformance } from "vigiles/adapter";
import { myHarnessAdapter } from "./my-harness-adapter.js";

test("my adapter conforms", () => {
  assertAdapterConformance(myHarnessAdapter); // throws with a list of gaps
});
```

## Wire it up

- **Library use:** import your adapter and pass its ports —
  `compileAgent(spec, { dialect: myHarnessAdapter.dialect })`,
  `loadPlugin(path, myHarnessAdapter.layout)`.
- **CLI auto-detection:** add it to the registry (`src/adapter-registry.ts`
  `ADAPTERS`) so `vigiles compile|scan|audit` detect it from a repo's layout.
  Claude Code stays the default, so nothing existing breaks.

## What's not a descriptor (yet)

Three seams still carry harness-specific _behaviour_, not just facts, and are
extracted opportunistically as a second real implementation lands (see
`research/code-adapter-architecture.md`): the instruction-file/skill **renderers**
in the compiler, the hook **decision-decode** beyond exit-code/values, and the
model-mock **HTTP server** (the `ModelMock` descriptor names the wire format; the
SSE renderer is per-harness). For a harness whose model can't be pointed at a
custom endpoint (a closed, hosted agent), the mock-backed test tiers don't apply
— you still get the full **reference-verification** pillar.

## See also

- [`docs/harnesses.md`](harnesses.md) — how a consumer _selects_ a harness.
- [`research/code-adapter-architecture.md`](../research/code-adapter-architecture.md) — the port design + the boundary.
- [`research/harness-landscape.md`](../research/harness-landscape.md) — concrete port values for Codex and 14 other harnesses.
