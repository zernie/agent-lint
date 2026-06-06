/**
 * vigiles — Validate vigiles-builder calls in markdown code blocks.
 *
 * Mirror of inline mode but inverted: inline mode skips fenced code blocks
 * (so `<!-- vigiles:enforce -->` in prose doesn't accidentally match an
 * example). This module enters fenced code blocks (ts/typescript/js/
 * javascript) and validates the vigiles builder calls inside —
 * `enforce("...")`, `file("...")`, `cmd("...")`, `ref("...")` — using the
 * same engines that validate them in spec.ts.
 *
 * Default: validate every ref. Illustrative blocks opt out via
 * `<!-- vigiles:ignore -->` immediately before the fence. Whole files
 * opt out via `<!-- vigiles:ignore-file -->` anywhere in the file
 * (intended for research/design docs that quote hypothetical refs).
 *
 * Scope: ONLY vigiles builder calls. Generic TS syntax / type checking
 * in markdown is explicitly out of scope — use eslint-plugin-markdown or
 * twoslash for that.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";

import { checkLinterRule } from "./linters.js";
import { readPackageScripts } from "./compile.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocRefKind = "enforce" | "file" | "cmd" | "ref";

export interface DocRef {
  readonly file: string;
  readonly line: number;
  readonly kind: DocRefKind;
  readonly value: string;
}

export interface DocRefError extends DocRef {
  readonly message: string;
}

export interface DocRefReport {
  readonly filesScanned: number;
  readonly filesIgnored: number;
  readonly blocksIgnored: number;
  readonly refs: readonly DocRef[];
  readonly errors: readonly DocRefError[];
  /** Refs that couldn't be verified because the underlying tool isn't available in this env. */
  readonly unverified: number;
  /** Refs that contained placeholder syntax (e.g. <linter>/<rule>) and were skipped. */
  readonly placeholders: number;
}

export interface FindDocRefsOptions {
  readonly basePath?: string;
  readonly ignore?: readonly string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_IGNORE = [
  "node_modules/**",
  "dist/**",
  ".vigiles/**",
  ".git/**",
] as const;

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const TS_LANGS = new Set(["ts", "typescript", "js", "javascript"]);

const IGNORE_BLOCK_RE = /<!--\s*vigiles:ignore\s*-->/;
const IGNORE_FILE_RE = /<!--\s*vigiles:ignore-file\s*-->/;

const CALL_RE = /\b(enforce|file|cmd|ref)\(\s*["']([^"'\n]+)["']/g;

const PLACEHOLDER_RE = /[<>]/;

/**
 * Error-message patterns that mean "tool not available in this env" rather
 * than "ref is actually broken." We can't decide between valid and invalid
 * when the underlying linter or CLI isn't installed, so count these
 * separately from real errors.
 */
const UNVERIFIABLE_PATTERNS: readonly RegExp[] = [
  /Unknown linter:/i,
  /not found on PATH/i,
  /No Cedar policies found/i,
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface ExtractResult {
  refs: DocRef[];
  blocksIgnored: number;
}

/** @internal */ export function extractDocRefs(
  content: string,
  file: string,
): ExtractResult {
  const lines = content.split("\n");
  const refs: DocRef[] = [];
  let blocksIgnored = 0;

  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;
  let fenceLang = "";
  let blockLines: { lineNo: number; text: string }[] = [];
  let nextBlockIgnored = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = FENCE_RE.exec(line);

    if (fm) {
      const marker = fm[2];
      const ch = marker[0] as "`" | "~";
      const len = marker.length;
      const info = fm[3].trim();

      if (fenceChar === null) {
        fenceChar = ch;
        fenceLen = len;
        fenceLang = info.split(/\s+/)[0].toLowerCase();
        blockLines = [];
        continue;
      } else if (ch === fenceChar && len >= fenceLen && info === "") {
        // Closing fence
        if (TS_LANGS.has(fenceLang)) {
          if (nextBlockIgnored) {
            blocksIgnored++;
          } else {
            for (const { lineNo, text } of blockLines) {
              for (const m of text.matchAll(CALL_RE)) {
                refs.push({
                  file,
                  line: lineNo,
                  kind: m[1] as DocRefKind,
                  value: m[2],
                });
              }
            }
          }
        }
        fenceChar = null;
        fenceLen = 0;
        fenceLang = "";
        nextBlockIgnored = false;
        blockLines = [];
        continue;
      }
    }

    if (fenceChar !== null) {
      blockLines.push({ lineNo: i + 1, text: line });
      continue;
    }

    if (IGNORE_BLOCK_RE.test(line)) {
      nextBlockIgnored = true;
    }
  }

  return { refs, blocksIgnored };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationOutcome {
  errors: DocRefError[];
  unverified: number;
  placeholders: number;
}

function isUnverifiable(message: string): boolean {
  return UNVERIFIABLE_PATTERNS.some((p) => p.test(message));
}

function validateRefs(
  refs: readonly DocRef[],
  basePath: string,
): ValidationOutcome {
  const errors: DocRefError[] = [];
  let unverified = 0;
  let placeholders = 0;
  const scripts = readPackageScripts(basePath) ?? {};

  for (const r of refs) {
    // Skip obvious placeholders like enforce("<linter>/<rule>") that
    // appear in skill format documentation. They aren't typos — they're
    // syntax templates. Real refs don't contain < or >.
    if (PLACEHOLDER_RE.test(r.value)) {
      placeholders++;
      continue;
    }

    switch (r.kind) {
      case "enforce": {
        const result = checkLinterRule(r.value, basePath, {
          catalogOnly: true,
        });
        if (!result.exists) {
          const msg = result.error ?? `Rule "${r.value}" not found`;
          if (isUnverifiable(msg)) {
            unverified++;
          } else {
            errors.push({ ...r, message: msg });
          }
        }
        break;
      }
      case "file":
      case "ref": {
        if (!existsSync(resolve(basePath, r.value))) {
          errors.push({ ...r, message: `File not found: "${r.value}"` });
        }
        break;
      }
      case "cmd": {
        const npmRun = r.value.match(/^npm\s+run\s+(\S+)/);
        const npmDirect = r.value.match(/^npm\s+(test|start|build|pretest)\b/);
        const scriptName = npmRun?.[1] ?? npmDirect?.[1];
        if (scriptName && !scripts[scriptName]) {
          errors.push({
            ...r,
            message: `Script "${scriptName}" not found in package.json`,
          });
        }
        break;
      }
    }
  }

  return { errors, unverified, placeholders };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk every `.md` under `basePath`, extract vigiles builder calls from
 * fenced TS/JS code blocks, validate against the same engines used for
 * spec.ts. Honors `<!-- vigiles:ignore-file -->` (skip the whole file)
 * and `<!-- vigiles:ignore -->` (skip the next code block).
 */
export function findDocRefs(
  options: FindDocRefsOptions = {},
): DocRefReport {
  const basePath = options.basePath ?? process.cwd();
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
  const files = globSync("**/*.md", { cwd: basePath, ignore });

  const allRefs: DocRef[] = [];
  let filesIgnored = 0;
  let blocksIgnored = 0;

  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(resolve(basePath, f), "utf-8");
    } catch {
      continue;
    }
    if (IGNORE_FILE_RE.test(content)) {
      filesIgnored++;
      continue;
    }
    const r = extractDocRefs(content, f);
    allRefs.push(...r.refs);
    blocksIgnored += r.blocksIgnored;
  }

  const outcome = validateRefs(allRefs, basePath);

  return {
    filesScanned: files.length,
    filesIgnored,
    blocksIgnored,
    refs: allRefs,
    errors: outcome.errors,
    unverified: outcome.unverified,
    placeholders: outcome.placeholders,
  };
}

/** Format a DocRefReport as human-readable text. */
export function formatDocRefReport(report: DocRefReport): string {
  const lines: string[] = [];
  const meta: string[] = [];
  if (report.filesIgnored > 0)
    meta.push(`${String(report.filesIgnored)} via vigiles:ignore-file`);
  if (report.blocksIgnored > 0)
    meta.push(`${String(report.blocksIgnored)} blocks via vigiles:ignore`);
  if (report.placeholders > 0)
    meta.push(`${String(report.placeholders)} placeholders skipped`);
  if (report.unverified > 0)
    meta.push(`${String(report.unverified)} unverified (tool unavailable)`);
  const metaStr = meta.length > 0 ? ` (${meta.join(", ")})` : "";

  lines.push(`scanned ${String(report.filesScanned)} files${metaStr}`);
  lines.push(
    `${String(report.refs.length)} vigiles refs in code blocks${report.errors.length === 0 ? " — all valid" : ""}`,
  );

  if (report.errors.length === 0) return lines.join("\n");

  lines.push(`✗ ${String(report.errors.length)} broken ref(s):`);
  for (const e of report.errors.slice(0, 12)) {
    const trunc =
      e.message.length > 80 ? `${e.message.slice(0, 80)}…` : e.message;
    lines.push(
      `    ${e.file}:${String(e.line)} ${e.kind}("${e.value}") — ${trunc}`,
    );
  }
  if (report.errors.length > 12) {
    lines.push(`    ... +${String(report.errors.length - 12)} more`);
  }
  return lines.join("\n");
}
