/**
 * 💵 PAID. The prototype measurement behind `vigiles/experimental`'s emit channel:
 * can an UNFORKED skill emit a structured, observable result by calling a tool?
 *
 *   node examples/experimental-emit/run-emit.mjs <skill-dir> [trials] [maxCostUsd]
 *
 * `<skill-dir>` is a real skill directory (one containing `SKILL.md`) taken from
 * the operator's own corpus. Nothing from it is written back here — the copy is
 * built into a throwaway fixture at run time, so a private corpus stays private.
 *
 * What it does:
 *  1. reads `<skill-dir>/SKILL.md` and asserts it has NO `context: fork` — the
 *     whole question is about the skills that cannot carry an `output:` today;
 *  2. replaces exactly ONE section, `## Record the verdict` (which today shells
 *     out to a ledger script), with `experimental_emitTool(contract).instruction`;
 *  3. serves `experimental_emitTool(contract).tool` from `emit-server.mjs` over a
 *     cwd `.mcp.json`, so no approval prompt and no global config are involved;
 *  4. runs the skill through the real CLI and reads the result back out of
 *     `ctx.toolCalls` with `experimental_parseEmitted`.
 *
 * Every trial is appended to `records/records-emit.jsonl` the moment it is
 * measured — a buffered write at the end loses the run when the container dies.
 *
 * ⚠️ Not named `*.eval.mjs` on purpose: that suffix makes a file discoverable by
 * `vigiles eval --all`, and a paid run must never be reachable from a CI sweep.
 */
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

import { result } from "../../dist/core/spec.js";
import {
  experimental_emitTool,
  experimental_parseEmitted,
} from "../../dist/experimental-emit.js";
import { runEval, formatEvalReport } from "../../dist/eval.js";

const skillDir = resolve(process.argv[2] ?? "");
const trials = Number(process.argv[3] ?? 3);
const maxCostUsd = Number(process.argv[4] ?? 0.6);
const MODEL = process.env.VIGILES_MODEL || "sonnet";

const HERE = new URL(".", import.meta.url).pathname;
const RECORDS_DIR = `${HERE}records`;
mkdirSync(RECORDS_DIR, { recursive: true });
const RECORDS = `${RECORDS_DIR}/records-emit.jsonl`;
const TOOL_JSON = `${RECORDS_DIR}/emit-tool.json`;
const EMITTED = `${RECORDS_DIR}/emitted.jsonl`;

// --- 1. the skill, unmodified except for its output section -----------------

const skillName = basename(skillDir);
const original = readFileSync(`${skillDir}/SKILL.md`, "utf8");
if (/^context:\s*fork\s*$/m.test(original)) {
  throw new Error(
    `${skillName} declares context: fork — it can already carry an output: contract. ` +
      `This measurement is about the skills that cannot.`,
  );
}

/** The verdict vocabulary these skills record today: FINDING <count> <report> | ABSTAINED <reason> <line>. */
const CONTRACT = result(
  { verdict: "string", count: "number", report: "string" },
  { reason: "string", detail: "string" },
);
const emit = experimental_emitTool(CONTRACT);
writeFileSync(TOOL_JSON, JSON.stringify(emit.tool, null, 2));

const MARKER = "## Record the verdict";
if (!original.includes(MARKER)) {
  throw new Error(
    `${skillName} has no "${MARKER}" section to swap for an emit.`,
  );
}
const before = original.slice(0, original.indexOf(MARKER));
const rest = original.slice(original.indexOf(MARKER) + MARKER.length);
const nextHeading = rest.indexOf("\n## ");
const after = nextHeading === -1 ? "" : rest.slice(nextHeading + 1);
const patched = `${before}${emit.instruction}\n\n${after}`;

// --- 2. the fixture: a tiny paper the skill has something real to say about --

const BUILD_SH = `#!/usr/bin/env bash
echo "body pages: 9 (limit 8)"
echo "VERDICT: BLOCKED — over the page limit by 1 page"
echo "Overfull \\\\hbox (12.3pt too wide) in paragraph at lines 88--90"
`;

const PIPELINE_STATUS = `# PIPELINE-STATUS

| stage | state | date | verdict |
|---|---|---|---|
| tighten-paper | ☑ | 2026-08-02 | 6 CUT actions applied |
| grade-paper-writing | ☑ | 2026-08-02 | 3.4 / 5 |
| pc-panel-review | ☑ | 2026-08-01 | Weak Accept (p=0.45) |
| verify-citations | ☐ | — | never run |

Submit-ready verdict: NOT READY.
`;

const SUBMIT_CHECKLIST = `# SUBMIT-CHECKLIST

- Page limit: 8 (hard)
- Template: ACM sigconf
- Blind model: double-blind
- Portal: HotCRP — **no account created yet**
- Supplementary upload field: none — the artifact needs external hosting
- Deadline: 2026-09-14 AoE
`;

const FIXTURE = {
  [`.claude/skills/${skillName}/SKILL.md`]: patched,
  ".mcp.json": JSON.stringify(
    {
      mcpServers: {
        emit: {
          command: "node",
          args: [`${HERE}emit-server.mjs`],
          env: { VIGILES_EMIT_TOOL_JSON: TOOL_JSON, VIGILES_EMIT_OUT: EMITTED },
        },
      },
    },
    null,
    2,
  ),
  "paper/repro/build-submission.sh": BUILD_SH,
  "paper/PIPELINE-STATUS.md": PIPELINE_STATUS,
  "paper/SUBMIT-CHECKLIST.md": SUBMIT_CHECKLIST,
  "paper/paper.md": "# A Measurement Paper\n\nBody elided for the fixture.\n",
};

// --- 3. run it, recording each trial as it lands ----------------------------

// $0 rehearsal: print what the model would be given and stop. Everything above
// this line is free, and a broken section swap must not be discovered by paying
// for three trials.
if (process.env.VIGILES_EMIT_DRY) {
  console.log(patched);
  console.log(
    `\n--- dry run: ${skillName}, ${String(patched.split("\n").length)} lines, ` +
      `tool ${emit.tool.name}, fixture ${String(Object.keys(FIXTURE).length)} files ---`,
  );
  process.exit(0);
}

writeFileSync(RECORDS, "");
writeFileSync(EMITTED, "");
let seq = 0;

const report = await runEval({
  name: `emit from an UNFORKED skill (${skillName})`,
  fixture: FIXTURE,
  arms: { emit: {} },
  task:
    `Use the ${skillName} skill on the paper directory \`paper\`. ` +
    `Follow the skill exactly, including its Output contract section.`,
  measure: (ctx) => {
    const parsed = experimental_parseEmitted(ctx.toolCalls, CONTRACT);
    const emitCalls = ctx.toolCalls.filter((c) => /emit_result$/.test(c.name));
    const skillCalls = ctx.toolCalls.filter((c) => c.name === "Skill");
    appendFileSync(
      RECORDS,
      JSON.stringify({
        seq: seq++,
        skill: skillName,
        model: MODEL,
        kind: parsed.kind,
        reason: parsed.kind === "malformed" ? parsed.reason : undefined,
        value: parsed.kind === "ok" ? parsed.value : undefined,
        error: parsed.kind === "err" ? parsed.error : undefined,
        emitCalls: emitCalls.length,
        emitArgs: emitCalls.map((c) => c.input),
        skillActivations: skillCalls.map((c) => c.input),
        toolNames: ctx.toolCalls.map((c) => c.name),
        costUsd: ctx.usage.costUsd,
      }) + "\n",
    );
    return {
      emitted: emitCalls.length > 0,
      exactly_one: emitCalls.length === 1,
      parsed_ok: parsed.kind === "ok",
      skill_activated: skillCalls.length > 0,
    };
  },
  trials,
  model: MODEL,
  allowedTools: [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Bash",
    "mcp__emit__emit_result",
  ],
  maxCostUsd,
  spacingSec: 3,
});

console.log(formatEvalReport(report));
console.log(
  `\nmodel=${MODEL} totalCostUsd=${report.totalCostUsd} aborted=${report.aborted}`,
);
console.log(`records → ${RECORDS}`);
console.log(`server-side record → ${EMITTED}`);
