/**
 * vigiles — Generator → SKILL.md compiler.
 *
 * A generator skill (`function* () { … yield act/gate/result … }`) has dynamic
 * control flow, so it can't be rendered by *executing* it. Instead we parse its
 * SOURCE with the TypeScript compiler API and render the structure to markdown:
 *
 *   yield act("prose")            → a prose step
 *   yield gate(cmd("npm test"))   → a `vigiles:gate` marker (+ verified ref)
 *   yield result(cmd("npm test")) → a `vigiles:result` marker
 *   if (cond) { … } else { … }    → "### If <cond>" / "### Otherwise"
 *   for / while (…) { … }         → "### Repeat (…)"
 *
 * The emitted SKILL.md is what the agent reads (branches flattened to prose);
 * the harness drives the real generator at run time (see `skill-driver.ts`).
 * Gate references (`cmd`/`file`/`project`) are collected and verified, so the
 * cross-referencing moat works on generators too (literal args only).
 */

import ts from "typescript";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { readPackageScripts } from "./compile.js";

export interface GeneratorError {
  type: "stale-file" | "stale-command";
  message: string;
}

export interface CompileGeneratorResult {
  markdown: string;
  errors: GeneratorError[];
}

interface GateRef {
  readonly kind: "cmd" | "file" | "role";
  readonly value: string;
}

/** Find the first generator function (`function*`) in a source file. */
function findGenerator(
  sf: ts.SourceFile,
): ts.FunctionExpression | ts.FunctionDeclaration | null {
  let found: ts.FunctionExpression | ts.FunctionDeclaration | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      (ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) &&
      n.asteriskToken
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** A `cmd("…")` / `file("…")` / `project("…")` call → a gate reference. */
function extractGateRef(node: ts.Expression | undefined): GateRef | null {
  if (!node || !ts.isCallExpression(node)) return null;
  const name = ts.isIdentifier(node.expression) ? node.expression.text : "";
  const a = node.arguments[0] as ts.Expression | undefined;
  if (!a || !ts.isStringLiteralLike(a)) return null;
  if (name === "cmd") return { kind: "cmd", value: a.text };
  if (name === "file") return { kind: "file", value: a.text };
  if (name === "project") return { kind: "role", value: a.text };
  return null;
}

/** The first YieldExpression inside a statement (e.g. `const x = yield act(...)`). */
function findYield(node: ts.Node): ts.YieldExpression | null {
  let y: ts.YieldExpression | null = null;
  const visit = (n: ts.Node): void => {
    if (y) return;
    if (ts.isYieldExpression(n)) {
      y = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return y;
}

function gateMarker(ref: GateRef, terminal: boolean): string {
  const kind = terminal ? "result" : "gate";
  if (ref.kind === "cmd") return `<!-- vigiles:${kind} "${ref.value}" -->`;
  if (ref.kind === "role") return `<!-- vigiles:${kind} role:${ref.value} -->`;
  return `<!-- vigiles:${kind} file:${ref.value} -->`;
}

function gateLabel(ref: GateRef): string {
  if (ref.kind === "cmd") return `\`${ref.value}\``;
  if (ref.kind === "role") return `the project's ${ref.value} command`;
  return `${ref.value} exists`;
}

/** Render a single `yield act/gate/result(...)` into markdown lines. */
function renderYield(
  y: ts.YieldExpression,
  lines: string[],
  refs: GateRef[],
): void {
  const call = y.expression;
  if (!call || !ts.isCallExpression(call)) return;
  const name = ts.isIdentifier(call.expression) ? call.expression.text : "";
  if (name === "act") {
    const a = call.arguments[0] as ts.Expression | undefined;
    if (a && ts.isStringLiteralLike(a)) lines.push(a.text.trim(), "");
    return;
  }
  const terminal = name === "finish" || name === "result";
  if (!terminal && name !== "gate" && name !== "checkpoint") return;
  const ref = extractGateRef(call.arguments[0] as ts.Expression | undefined);
  if (!ref) return;
  refs.push(ref);
  if (terminal) {
    lines.push(
      "## Result",
      "",
      `Done when ${gateLabel(ref)} passes.`,
      "",
      gateMarker(ref, true),
      "",
    );
  } else {
    lines.push(
      `**Gate** — ${gateLabel(ref)}; do not proceed until it passes.`,
      "",
      gateMarker(ref, false),
      "",
    );
  }
}

/** A renderer bound to one source file (for `getText` of conditions). */
function makeRenderer(sf: ts.SourceFile, refs: GateRef[]) {
  const lines: string[] = [];

  const renderBlock = (stmt: ts.Statement): void => {
    if (ts.isBlock(stmt)) renderStatements(stmt.statements);
    else renderStatements([stmt]);
  };

  const renderIf = (s: ts.IfStatement): void => {
    lines.push(`### If ${s.expression.getText(sf)}`, "");
    renderBlock(s.thenStatement);
    if (s.elseStatement) {
      if (ts.isIfStatement(s.elseStatement)) {
        renderIf(s.elseStatement);
      } else {
        lines.push(`### Otherwise`, "");
        renderBlock(s.elseStatement);
      }
    }
  };

  const renderLoop = (s: ts.IterationStatement): void => {
    let header = "each iteration";
    if (ts.isWhileStatement(s)) header = `while ${s.expression.getText(sf)}`;
    else if (ts.isForOfStatement(s))
      header = `for each item in ${s.expression.getText(sf)}`;
    lines.push(`### Repeat (${header})`, "");
    renderBlock(s.statement);
  };

  function renderStatements(stmts: readonly ts.Statement[]): void {
    for (const s of stmts) {
      if (ts.isVariableStatement(s) || ts.isExpressionStatement(s)) {
        const y = findYield(s);
        if (y) {
          renderYield(y, lines, refs);
          continue;
        }
      }
      if (ts.isIfStatement(s)) {
        renderIf(s);
        continue;
      }
      if (
        ts.isForStatement(s) ||
        ts.isForOfStatement(s) ||
        ts.isWhileStatement(s) ||
        ts.isDoStatement(s)
      ) {
        renderLoop(s);
        continue;
      }
      // Other statements (plain logic, returns) carry no prose to render.
    }
  }

  return {
    run(body: ts.Block): string {
      renderStatements(body.statements);
      return lines.join("\n").trimEnd();
    },
  };
}

/** Verify a collected gate reference against the project at `basePath`. */
function verifyRef(ref: GateRef, basePath: string): GeneratorError | null {
  if (ref.kind === "file") {
    return existsSync(resolve(basePath, ref.value))
      ? null
      : { type: "stale-file", message: `File not found: "${ref.value}"` };
  }
  if (ref.kind === "role") return null; // resolved per host project at run time
  // cmd: npm script or script-runner file
  const npm = ref.value.match(/^npm\s+run\s+(\S+)/)?.[1];
  if (npm) {
    const scripts = readPackageScripts(basePath);
    return scripts && !scripts[npm]
      ? {
          type: "stale-command",
          message: `Script "${npm}" not found in package.json`,
        }
      : null;
  }
  const scriptFile = ref.value.match(
    /^(?:python3?|node|bash|sh|ruby|deno run)\s+([^\s-]\S*\.[A-Za-z0-9]+)/,
  )?.[1];
  if (scriptFile && !existsSync(resolve(basePath, scriptFile))) {
    return {
      type: "stale-command",
      message: `Script "${scriptFile}" not found`,
    };
  }
  return null;
}

/**
 * Compile a generator skill's SOURCE text to SKILL.md markdown + verified-ref
 * errors. `frontmatter` (name/description/…) is prepended verbatim if given.
 */
export function compileGenerator(
  source: string,
  options: { basePath?: string; frontmatter?: string } = {},
): CompileGeneratorResult {
  const basePath = options.basePath ?? process.cwd();
  const sf = ts.createSourceFile(
    "skill.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const gen = findGenerator(sf);
  if (!gen?.body) {
    return {
      markdown: "",
      errors: [
        { type: "stale-command", message: "No generator function found." },
      ],
    };
  }
  const refs: GateRef[] = [];
  const body = makeRenderer(sf, refs).run(gen.body);
  const errors = refs
    .map((r) => verifyRef(r, basePath))
    .filter((e): e is GeneratorError => e !== null);
  const markdown = options.frontmatter
    ? `${options.frontmatter.trim()}\n\n${body}\n`
    : `${body}\n`;
  return { markdown, errors };
}
