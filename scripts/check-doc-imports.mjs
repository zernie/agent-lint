#!/usr/bin/env node
/**
 * check-docs.mjs — type-check the TypeScript examples in the docs against THIS
 * repo's own build, with two tiers:
 *
 *   GATE 1 (always, every ts block): report ONLY diagnostics about this package's
 *           own module surface — a subpath that is not in the exports map, or a
 *           named import the built package does not export. Free variables,
 *           partial snippets and deliberate type errors are invisible to it, so
 *           an illustrative fragment cannot make it fire.
 *   GATE 2 (opt-in, block marked `<!-- vigiles:check -->`): full tsc diagnostics.
 *
 * No network. No new CLI verb. Resolution is TypeScript's own package
 * self-reference: `import ... from "vigiles/eval"` resolves through this
 * package.json's `exports` map to the local ./dist.
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

const ROOT = resolve(process.argv[2] ?? ".");
const req = createRequire(join(ROOT, "package.json"));
const ts = req("typescript");
const MarkdownIt = req("markdown-it");
const md = new MarkdownIt();
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;

const LANGS = new Set(["ts", "typescript", "tsx"]);
const IGNORE_FILE = /<!--\s*vigiles:ignore-file\s*-->/;
const IGNORE = /<!--\s*vigiles:ignore\s*-->/;
const CHECK = /<!--\s*vigiles:check\s*-->/;

function mdFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) mdFiles(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const targets = [];
for (const arg of process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["docs", "README.md"]) {
  const p = join(ROOT, arg);
  try {
    statSync(p).isDirectory() ? mdFiles(p, targets) : targets.push(p);
  } catch {}
}
targets.sort();

const WORK = join(ROOT, ".doccheck-tmp");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const blocks = [];
for (const f of targets) {
  const src = readFileSync(f, "utf8");
  if (IGNORE_FILE.test(src)) continue;
  const lines = src.split("\n");
  for (const t of md.parse(src, {})) {
    if (t.type !== "fence") continue;
    if (!LANGS.has((t.info || "").trim().split(/\s+/)[0])) continue;
    // look at the two source lines above the fence for a marker
    const above = lines.slice(Math.max(0, t.map[0] - 3), t.map[0]).join("\n");
    if (IGNORE.test(above)) continue;
    const full = CHECK.test(above);
    const id = `b${String(blocks.length).padStart(3, "0")}`;
    const file = join(WORK, `${id}.ts`);
    writeFileSync(
      file,
      t.content.endsWith("\n") ? t.content : t.content + "\n",
    );
    blocks.push({ file, doc: relative(ROOT, f), line: t.map[0] + 1, full });
  }
}

const program = ts.createProgram(
  blocks.map((b) => b.file),
  {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    types: ["node"],
    typeRoots: [join(ROOT, "node_modules", "@types")],
  },
);

// Gate-1 codes: the module surface of THIS package only.
const OWN_MODULE = new RegExp(`['"\`]${PKG}(/[^'"\`]*)?['"\`]`);
const SURFACE = new Set([
  2307, // Cannot find module 'X' or its corresponding type declarations
  2305, // Module 'X' has no exported member 'Y'
  2724, // 'X' has no exported member named 'Y'. Did you mean 'Z'?
  2614, // Module 'X' has no exported member 'Y'. Did you mean to use 'import Y from'?
]);

let findings = 0;
for (const b of blocks) {
  const sf = program.getSourceFile(b.file);
  const diags = b.full
    ? [
        ...program.getSyntacticDiagnostics(sf),
        ...program.getSemanticDiagnostics(sf),
      ]
    : program.getSemanticDiagnostics(sf).filter((d) => {
        if (!SURFACE.has(d.code)) return false;
        const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
        return OWN_MODULE.test(msg);
      });
  for (const d of diags) {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    console.log(
      `${b.doc}:${b.line} (block line ${line + 1}:${character + 1}) TS${d.code}: ` +
        ts.flattenDiagnosticMessageText(d.messageText, " ") +
        (b.full ? "  [vigiles:check]" : ""),
    );
    findings++;
  }
}
rmSync(WORK, { recursive: true, force: true });
console.log(
  `\nblocks scanned: ${blocks.length}  (full-check: ${blocks.filter((b) => b.full).length})`,
);
console.log(`findings: ${findings}`);
process.exit(findings ? 1 : 0);
