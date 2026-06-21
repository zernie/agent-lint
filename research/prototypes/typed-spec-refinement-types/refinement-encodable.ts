/**
 * PROTOTYPE R1 — refinement types that TS CAN encode at compile time.
 *
 * A refinement type is a base type + a predicate: `{ v: string | v matches glob }`,
 * `{ n: number | 0 <= n <= 1 }`, `{ cmd: string | cmd ∈ Bash(git:*) }`. This file
 * maps the SUBSET of refinements TypeScript 5.9 can prove WITHOUT any vigiles run —
 * the predicate becomes a template-literal / branded / conditional type, so an
 * out-of-refinement literal is a `tsc` error at the keystroke.
 *
 * The honest split (proven here):
 *   - ENUM membership            → a literal union. TS-encodable. (R1a)
 *   - STRING-SHAPE (glob/prefix) → a template-literal type.       TS-encodable. (R1b)
 *   - TOOL RESTRICTION Bash(git:*) → a template-literal pattern.  TS-encodable. (R1c)
 *   - NON-EMPTY tuple            → `readonly [T, ...T[]]`.         TS-encodable. (R1d)
 *
 * What DROPS to a runtime guard (numeric bounds, cross-field length equality,
 * "every element satisfies P") is in ./refinement-runtime-guard.mjs — TS cannot
 * prove those for an ARBITRARY value (only for a frozen literal, uselessly), so
 * "parse, don't validate" carries them: the brand is minted only after the
 * runtime predicate passes.
 *
 * Self-contained: COPIES a minimal slice of the spec types; does NOT touch src/.
 *   pass:  npx tsc --noEmit --strict refinement-encodable.ts   (exit 0)
 *   fail:  ./refinement-fails.ts
 */

// ---------------------------------------------------------------------------
// R1a — ENUM-membership refinement: `{ track: string | track ∈ {ok, err} }`.
// The OutputFieldType in the shipped spec is exactly this shape already. A
// model-graded `verdict` field refined to one of three labels is a union, and a
// 4th label is unrepresentable.
// ---------------------------------------------------------------------------

type Verdict = "pass" | "fail" | "needs-review";

export interface ResultField<T> {
  readonly name: string;
  readonly refined: T;
}

export function verdictField(name: string, v: Verdict): ResultField<Verdict> {
  return { name, refined: v };
}

export const okVerdict = verdictField("review", "needs-review"); // compiles

// ---------------------------------------------------------------------------
// R1b — STRING-SHAPE refinement: a path field refined to a glob shape.
// "the result's `files` must be test paths" → a template-literal type that only
// admits `${string}.test.ts` / `${string}.spec.ts`. A non-test path literal is a
// type error. This is a genuine refinement TS proves structurally on a LITERAL.
// ---------------------------------------------------------------------------

/** A path refined to "is a TS test file" by SHAPE (template-literal predicate). */
export type TestPath = `${string}.test.ts` | `${string}.spec.ts`;

/** A path refined to "lives under src/" (prefix refinement). */
export type UnderSrc = `src/${string}`;

export function testArtifact(p: TestPath): { readonly path: TestPath } {
  return { path: p };
}

export const good1 = testArtifact("src/core/spec.test.ts"); // compiles
export const good2 = testArtifact("examples/foo.spec.ts"); // compiles

// ---------------------------------------------------------------------------
// R1c — TOOL-RESTRICTION refinement: `Bash(git:*)` as a refinement of `Bash`.
// The shipped spec already has the `Tool(restriction)` STRING; here we lift the
// restriction into the TYPE so a tool field typed `BashGit` admits only the
// git-restricted form, not bare `Bash` (which would be the unrestricted, broader
// capability). This is the type-level version of the restriction the runtime gate
// reads off the string.
// ---------------------------------------------------------------------------

/** `Bash` refined to ONLY the git-prefixed restriction (a capability narrowing). */
export type BashGit = `Bash(git:${string})`;

/** `Bash` refined to a read-only restriction shape (npm-test only, say). */
export type BashTest = `Bash(npm:test${string})` | `Bash(npm test${string})`;

export function gitTool(t: BashGit): { readonly tool: BashGit } {
  return { tool: t };
}

export const g1 = gitTool("Bash(git:status)"); // compiles
export const g2 = gitTool("Bash(git:log --oneline)"); // compiles

// ---------------------------------------------------------------------------
// R1d — NON-EMPTY refinement: a pipeline / tools list refined to ≥1 element.
// `glob()` in the shipped spec proves "matches ≥1 path" at RUNTIME; the TYPE can
// prove "the literal tuple has ≥1 element" for a `const` tuple. A `pure`/`bounded`
// unit must declare a non-empty tools list (an empty list inherits-all — a
// violation); a non-empty tuple type makes the empty case unrepresentable.
// ---------------------------------------------------------------------------

/** A tools contract refined to "at least one tool" (no inherits-all). */
export type NonEmptyTools = readonly [string, ...string[]];

export function boundedAgent(tools: NonEmptyTools): {
  readonly tools: NonEmptyTools;
} {
  return { tools };
}

export const b1 = boundedAgent(["Read", "Write"]); // compiles

// ---------------------------------------------------------------------------
// Proof the refinements are PRECISE (not vacuous): these type-level checks hold.
// ---------------------------------------------------------------------------

type Assert<T extends true> = T;
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _T1 = Assert<Eq<TestPath extends `${string}.ts` ? true : false, true>>;
type _T2 = Assert<"src/x" extends UnderSrc ? true : false>;
type _T3 = Assert<Eq<"Bash" extends BashGit ? true : false, false>>; // bare Bash NOT a BashGit
const _proof: [_T1, _T2, _T3] = [true, true, true];
void _proof;
void okVerdict;
void good1;
void good2;
void g1;
void g2;
void b1;
