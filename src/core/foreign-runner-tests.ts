/**
 * Harness test files that a THIRD-PARTY test runner will collect and execute.
 *
 * Measured 2026-08-11, not reasoned about. A fixture holding nothing but
 * `package.json` and `.claude/skills/foo/foo.test.mjs`, then `npx vitest run`
 * at the repo root: `Test Files  1 passed (1)`. Vitest descended into
 * `.claude/` and ran the file. The assumption that "it lives under a dot-dir,
 * so other tools leave it alone" is simply false — vitest's `defaultExclude` is
 * `["**\/node_modules/**", "**\/.git/**"]` and nothing else, so every dot-dir
 * except `.git` is fair game.
 *
 * Why this is not cosmetic: a harness test is not a unit test. It calls
 * `runHarnessTest` / `measureTriggerRate`, which SPAWN AN AGENT. A foreign
 * runner that collects one spends model budget — silently, in CI, on every
 * push — and the author never asked for it. The `*.eval.*` tier is the paid
 * one by definition, so a file carrying both an eval name and a foreign test
 * name is the expensive case, and the message says so outright.
 *
 * 🔴 THAT SENTENCE IS THE PREMISE, AND IT IS NOT TRUE OF EVERY `*.test.*` UNDER A
 * SURFACE DIR. A skill may ship an ordinary offline unit test beside its scripts,
 * and the name+location rule alone reported it and told the author to rename it —
 * which would have removed a working test from that repo's vitest run. So the
 * premise is now CHECKED per file, not assumed: a finding requires evidence that
 * the file drives an agent (see {@link AGENT_DRIVING_APIS}), and the message
 * quotes that evidence back.
 *
 * The collision is easy to walk into because vigiles USED TO bless these names:
 * `*.test.*` counted toward Tested until 15.x, so following the old advice put a
 * harness test under a surface dir with a name every third-party runner collects.
 * It no longer counts (see `DEFAULT_TEST_GLOBS` in `test-coverage.ts`), which is
 * why the fix is a RENAME and not a config edit: `*.harness.mjs` / `*.eval.mjs`
 * match no third-party default, and restoring the credit with `testGlobs` would
 * keep the foreign runner collecting the file.
 *
 * Deliberately NOT a config parse. Reading `vitest.config.*` / `jest.config.*`
 * / `package.json#jest` to find out whether THIS repo overrode its globs would
 * mean evaluating dynamic JS, following `extends`, and resolving monorepo
 * layers — a parser there produces false confidence in both directions. A
 * filename does not lie: these are the DEFAULTS, quoted verbatim from the
 * installed packages, and the finding says "a default run collects this",
 * which is true no matter what any config says.
 *
 * Default globs, read from the packages on disk (reproduce with the paths):
 *
 *   node_modules/vitest/dist/chunks/defaults.*.js
 *     **\/*.{test,spec}.?(c|m)[jt]s?(x)        (defaultInclude)
 *     **\/*.{test,spec}-d.?(c|m)[jt]s?(x)      (typecheck; --typecheck only)
 *
 *   node_modules/jest-config/build/index.js
 *     **\/?(*.)+(spec|test).?([mc])[jt]s?(x)
 *     **\/__tests__/**\/*.?([mc])[jt]s?(x)     ← EVERY js/ts file in the dir,
 *                                                no name suffix required
 *
 * The `-d` typecheck glob is quoted for completeness but NOT matched: it only
 * applies under `vitest --typecheck`, and a plain run ignores it. Reporting it
 * would flag files that no default run touches.
 *
 * Pure string work over names that are already in the scan — zero runtime
 * imports, so `scanFiles` (browser engine) and `scanPlugin` (disk) run the
 * identical predicate and their reports stay byte-identical.
 *
 * ---------------------------------------------------------------------------
 * DOES THIS GATE EARN ITS KEEP? Asked properly 2026-08-12, after SIX rounds of
 * findings against this one file — which is data about the design, not about six
 * bugs. Verdict: KEEP, TUNED TO ABSTAIN. The reasoning is measured, so it can be
 * re-run and overturned.
 *
 * ## What it does on real input: nothing, and only twice does it come close
 *
 * `foreignRunnerTests` over three real corpora — this repo, a 43-harness consumer
 * repo, and five vendored third-party plugin repos — 3 613 js/ts files:
 *
 *   findings                                                        0
 *   files under a surface dir AND collected by a default glob       2
 *   …of those, files with agent evidence                            0
 *
 * The two near-misses are `examples/harness/dogfood/.../code-reviewer.md.spec.ts`
 * here and `.claude/skills/verify-citations/scripts/verify-cites.test.mjs` in the
 * consumer repo. The second is the exact file `untested-skill.md` already cites
 * as "a good test of a bundled script, not a test of a skill" — and the EVIDENCE
 * rule is the only thing standing between its author and "rename it". That is the
 * gate's one demonstrated effect on a real repository, and it is an effect of
 * NOT firing.
 *
 * ## The asymmetry, which the old tuning ignored
 *
 * A missed warning costs one accidental paid run — except it does not, because
 * `refuseUnderForeignRunner` refuses at all four spawn doors, so the miss costs
 * only an earlier and friendlier notice. A false warning costs someone a working
 * test, because the remedy printed is "rename this file". Those are not
 * symmetric, and every finding this file has produced has been the second kind.
 *
 * ## So the rule is: narrow on evidence, never widen on a shape
 *
 * Two classes were removed this round, each at a MEASURED cost of zero on the
 * corpora above: a name the file BINDS itself ({@link locallyBound}), and a name
 * reached through a `.` (`mock.runEval()`). The dotted allowance existed for
 * `import * as v from "vigiles/testing"; v.runEval()`; that shape occurs in
 * exactly two places across every corpus, and both are this gate's own comment
 * and its own test.
 *
 * Residual false-positive surface, probed rather than estimated — three shapes
 * still fire, and the first two are the honest remainder:
 *
 *   import { runEval } from "./my-own-helper.js"; runEval({})   → fires
 *   function f(runEval) { runEval({}) }                          → fires
 *   export function t() { runEval({}) }                          → fires (this is
 *                                                                  also the TRUE
 *                                                                  positive shape)
 *
 * It reduces to "the file calls a bare name it did not declare", which is as tight
 * as a lexical rule gets here: requiring an import from a vigiles specifier was
 * MEASURED in round 14 and scored 0/4 on this repo's own agent-driving examples,
 * which import from relative `../../dist/*` paths.
 *
 * 🔴 THE FALSIFIABLE PART. A seventh false positive is not another bug to fix —
 * it is the measurement saying the lexical rule cannot be made tight enough, and
 * the answer then is to DELETE the gate and let the money guard be the whole
 * defence. Fix the next finding by narrowing or by deleting; adding a shape rule
 * that widens has been wrong six times.
 * ---------------------------------------------------------------------------
 */

import type { PluginLayout } from "./layout.js";

/** A third-party runner whose DEFAULT config collects the file. */
export type ForeignRunner = "vitest" | "jest";

export interface ForeignRunnerTest {
  /** Repo-relative POSIX path of the offending file. */
  readonly path: string;
  /** Runners whose defaults collect it — never empty. */
  readonly runners: readonly ForeignRunner[];
  /**
   * `"suffix"` — the name ends in `.test.`/`.spec.` + a js/ts extension.
   * `"tests-dir"` — it sits under a `__tests__/` dir, where jest takes files by
   * LOCATION and the name is irrelevant. Kept apart because the fix differs:
   * one is a rename, the other is a move.
   */
  readonly reason: "suffix" | "tests-dir";
  /**
   * WHY this file is known to drive an agent — the evidence that earns the
   * warning. Either the agent-driving vigiles API it names (`"runEval"`, …) or
   * `"eval-name"` for an `*.eval.*` file, which is the paid tier by our own
   * convention. Never absent: a file with no evidence is not a finding at all.
   */
  readonly evidence: string;
}

/**
 * The extension tail shared by both runners: `?(c|m)[jt]s?(x)` (vitest) and
 * `?([mc])[jt]s?(x)` (jest) denote the same set — an optional `c`/`m`, `j` or
 * `t`, `s`, an optional `x`.
 */
const EXT = /\.[cm]?[jt]sx?$/;

/** vitest `**\/*.{test,spec}.?(c|m)[jt]s?(x)` — `.test.`/`.spec.` before the ext. */
const VITEST_NAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * jest `**\/?(*.)+(spec|test).?([mc])[jt]s?(x)`. The prefix `?(*.)` is OPTIONAL,
 * so a bare `test.mjs` matches jest while vitest (which requires `*.` before
 * `.test.`) does not; `+(spec|test)` is one-or-more, so `foo.testspec.ts`
 * matches too. Faithfulness here is the whole point — an approximation would
 * either miss files jest runs or accuse files it does not.
 */
const JEST_NAME = /^(?:.*\.)?(?:spec|test)+\.[cm]?[jt]sx?$/;

/** The paid tier's marker. A foreign runner collecting one of these bills real money. */
/**
 * A filename that vigiles' OWN eval discovery would collect — the only kind that
 * can be paid-tier evidence by name alone.
 *
 * 🔴 THIS WAS AN INFIX (`path.includes(".eval.")`) AND IT OVER-FIRED. An ordinary
 * surface-local unit test named `parser.eval.test.ts` contains `.eval.` and was
 * declared to burn model budget on that basis — while NOT matching
 * `**\/*.eval.{ts,mts,cts,js,mjs,cjs}`, the glob that decides what `vigiles eval`
 * actually runs. A name vigiles will never collect as an eval cannot be an eval
 * by name, so the file falls through to the CONTENT gate, which is what should
 * answer for it.
 *
 * The infix was the right shape in the place it came from: `partitionTests`
 * splits files ALREADY DISCOVERED as tests into free and paid tiers, and there an
 * infix stops `.eval.ts` slipping into the free per-push tier. That reason is
 * about discovery's output, not about an arbitrary filename, and copying it here
 * carried it past its premise. Mirrors `DEFAULT_TEST_GLOBS` / RUNNABLE_EXTS in
 * `test-coverage.ts` — the same extension set, as a suffix.
 */
const EVAL_NAME_RE = /\.eval\.(?:ts|mts|cts|js|mjs|cjs)$/;

/**
 * The vigiles entry points whose CALL spawns an agent — the fact this whole
 * finding rests on.
 *
 * 🔴 WHY A CONTENT GATE EXISTS AT ALL. Name + location alone accuses every
 * ordinary unit test that happens to live under a surface dir. Measured on the
 * author's own corpus: `.claude/skills/verify-citations/scripts/verify-cites.test.mjs`
 * — an offline test of a PURE reducer, no model, no network, not one vigiles
 * import — was flagged, and the remedy it printed ("rename it to `*.harness.mjs`")
 * would have taken a legitimate test OUT of that repo's vitest run. That is not
 * noise, it is a HARMFUL instruction, so evidence is required before the advice is
 * given. Softening the wording (which the message used to do) does not fix a false
 * positive; withholding the finding does.
 *
 * A closed list, not a heuristic: every name here is a vigiles API that drives the
 * `claude`/`codex` binary — `runHarnessTest`/`runHarness` spawn one against a
 * scripted model, the `measure*`/`runEval`/`probe*` family drives the REAL model
 * and bills for it. Calling any of them IS the spawn, and that is the property
 * which makes a plain identifier match honest here.
 *
 * The cheap tier is deliberately ABSENT. `runHook` (`vigiles/unit`) pipes an event
 * to a hook process: no binary, no model, no bill. A foreign runner that collects
 * one has collected an ordinary test, and telling its author to rename it would be
 * the same harmful advice in a smaller size.
 *
 * 🔴 `scriptModel` WAS ON THIS LIST, AS AN INTENT ARGUMENT RATHER THAN A PROPERTY.
 * It was justified here as "exists only to be handed to one of them" — a claim
 * about what the author probably means, inside a list whose entire warrant is that
 * the CALL spawns an agent. Both exported implementations are pure and spawn
 * nothing: `scriptModel` in `mock-model.ts` returns `[...turns]`, a copied array;
 * `scriptModel` in `skill-test.ts` returns a `ModelFn` closure. Neither reaches a
 * process unless its RESULT is later handed to a runner — and when it is, that
 * runner is named in the same file and is the honest evidence. So a file whose
 * only vigiles call BUILDS or unit-tests a scripted model (this repo's own
 * `mock-model.test.ts` is that shape) was told to rename itself out of its
 * runner's collection on the strength of a helper that does nothing.
 *
 * Removing it costs no recall on the case the finding is about: a file that
 * scripts a model AND runs it still names the runner. It loses only the file that
 * scripts a model and never runs one — exactly the file that should never have
 * been reported.
 *
 * 🔴 A NAME IS NOT A CALL, and the first version of this gate accepted one. It
 * searched for the bare identifier, so `import { runEval } from "vigiles/testing"`
 * in a file that only tests a wrapper, the comment `// never call runEval here`,
 * the string `"runEval"` in a fixture, and `vi.mock(…, () => ({ runEval: fake }))`
 * were each reported as an agent-spawning call — and each was told to rename a
 * legitimate test. That is the exact substitution this repo exists to catch in
 * other people's harnesses (presence of a name taken for presence of a property),
 * committed while fixing a false positive with "evidence". Evidence that a
 * substring search can satisfy is not evidence.
 *
 * So the gate is a CALL SITE, found after {@link stripNonCode} removes comments,
 * string literals and template text — the identifier has to be followed by `(`
 * in actual code. That is a lexical decision, not a guess, which is what earns
 * the message the right to keep saying "rename it": the advice is only safe when
 * the premise it rests on is established.
 *
 * Names, not imports: a re-export through the repo's own helper still calls the
 * identifier by name, whereas a scan that resolved module graphs would be a
 * bundler. A file that reaches the paid tier through a helper naming nothing is
 * missed — a false negative, which costs one warning; the false positive it
 * replaces cost a working test.
 */
const AGENT_DRIVING_APIS = [
  "runHarnessTest",
  "runHarness",
  "runEval",
  "measureTriggerRate",
  "measureArms",
  "measureSelectionMatrix",
  "measurePluginSelection",
  "probePluginTriggers",
  "measureGateAdversarial",
] as const;

/**
 * Keywords after which a `/` opens a REGEX, not a division — the cases where the
 * preceding character is an identifier char but the position is still expression
 * -start (`return /x/`, `typeof /x/`).
 */
const KEYWORDS_BEFORE_REGEX = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "do",
  "else",
  "void",
  "delete",
  "instanceof",
  "new",
  "throw",
  "yield",
  "await",
]);

/**
 * JS/TS source with everything that is NOT code blanked out: line and block
 * comments, single/double-quoted strings, and the literal TEXT of template
 * literals. `${…}` interpolations are kept, because they ARE code — `` `${runEval(x)}` ``
 * is a call.
 *
 * A character scanner, not a regex: the thing being removed is defined by the
 * lexical grammar (a quote closes only when unescaped; `//` inside a string opens
 * no comment), and the repo's standing rule is that structure gets a parser. This
 * is the lexical layer of one — a full JS parse would need a real parser
 * dependency in a module both engines share, and the browser engine cannot take
 * a native one (the report has to stay byte-identical across the two).
 *
 * Removed characters become spaces so offsets and line breaks survive.
 *
 * 🔴 REGEX LITERALS ARE LEXED, and the first draft of this function said they
 * were too rare to bother with. Measured on the author's corpus before shipping:
 * `.claude/skills/paper-pipeline/framing-vs-vocabulary.eval.mjs` line 603 is
 * ``.replace(/[.`"']/g, "")`` — a regex class holding a backtick AND both quote
 * characters, which without regex lexing opened a template literal that ran to
 * the end of the file and blanked the real `await measureTriggerRate({` fifty
 * lines below. "Rare in practice" was wrong on the first real file checked.
 *
 * `/` is ambiguous between division and a regex, so it is resolved by the
 * preceding significant token — the standard lexer rule: a value (identifier,
 * `)`, `]`, number) means division, anything else (operator, `(`, `,`, `=`,
 * `;`, `:`, `{`, `}`, start of input) or a keyword that takes an expression
 * (`return`, `typeof`, …) means a regex. And a candidate that finds no closing
 * `/` before the line ends is treated as division after all, because a regex
 * literal cannot span a newline — so a misread cannot swallow the rest of a file.
 */
/**
 * End offset (exclusive, flags included) of the regex literal starting at `start`,
 * or `-1` when there is none.
 *
 * The `-1` is the safety net: a candidate that finds no closing `/` before the
 * line ends is division after all, because a regex literal cannot span a newline.
 * Without it a misread `/` swallows the rest of the file — measured on this
 * repo's own `.tsx`, where `</span>` puts a `/` in expression position.
 */
function regexLiteralEnd(src: string, start: number): number {
  let inClass = false;
  for (let k = start + 1; k < src.length; k++) {
    const ch = src[k] ?? "";
    if (ch === "\n") return -1;
    if (ch === "\\") k++;
    // A `/` inside a character class does not close the literal — `split(/[/\\]/)`
    // is a real line in this repo.
    else if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) return endOfFlags(src, k + 1);
  }
  return -1;
}

/** Past the trailing regex flags (`g`, `iu`, …) that follow a literal's closing `/`. */
function endOfFlags(src: string, at: number): number {
  let k = at;
  while (k < src.length && /[a-z]/.test(src[k] ?? "")) k++;
  return k;
}

/**
 * Whether a `/` at this point opens a REGEX rather than dividing — the standard
 * lexer rule, read off the characters emitted so far. A value before it
 * (identifier, `)`, `]`, digit) means division; anything else, or a keyword that
 * takes an expression, means a regex.
 */
function regexAllowedAfter(emitted: readonly string[]): boolean {
  let k = emitted.length - 1;
  // Skip the whitespace between the previous token and the `/` — `return /x/`
  // puts a space there.
  while (k >= 0 && (emitted[k] ?? "").trim() === "") k--;
  const prev = emitted[k] ?? "";
  if (prev === "") return true;
  if (/[)\]]/.test(prev)) return false;
  if (!/[A-Za-z0-9_$]/.test(prev)) return true;
  let word = "";
  while (k >= 0 && /[A-Za-z_$]/.test(emitted[k] ?? ""))
    word = (emitted[k--] ?? "") + word;
  return KEYWORDS_BEFORE_REGEX.has(word);
}

/**
 * End offset (exclusive) of the comment or quoted string starting at `at`, or
 * `-1` when this is not one. The three shapes share a shape — "blank a run whose
 * end is decided by a delimiter" — so they share a function.
 */
function commentOrStringEnd(src: string, at: number): number {
  const c = src[at] ?? "";
  const next = src[at + 1] ?? "";
  if (c === "/" && next === "/") {
    const end = src.indexOf("\n", at);
    return end === -1 ? src.length : end;
  }
  if (c === "/" && next === "*") {
    const end = src.indexOf("*/", at + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (c === '"' || c === "'") {
    let j = at + 1;
    while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
    return Math.min(j + 1, src.length);
  }
  return -1;
}

export function stripNonCode(src: string): string {
  const out: string[] = [];
  // Brace depth per OPEN interpolation, so `` `${ {a:1} }` `` closes correctly.
  // Empty means "not inside a template".
  const templates: number[] = [];
  let i = 0;
  const blank = (n: number): void => {
    for (let k = 0; k < n; k++) out.push(src[i + k] === "\n" ? "\n" : " ");
    i += n;
  };
  const bumpDepth = (by: number): void => {
    templates[templates.length - 1] =
      (templates[templates.length - 1] ?? 0) + by;
  };
  /**
   * Track a brace seen inside a template interpolation, and answer whether this
   * one CLOSES it. Braces only matter inside an interpolation, where `{a:1}` must
   * not be mistaken for the end of `${…}`.
   */
  const closesInterpolation = (ch: string): boolean => {
    if (templates.length === 0) return false;
    if (ch === "{") {
      bumpDepth(1);
      return false;
    }
    if (ch !== "}") return false;
    if ((templates[templates.length - 1] ?? 0) === 0) return true;
    bumpDepth(-1);
    return false;
  };
  /**
   * Blank template TEXT from `i` until the template closes or an interpolation
   * opens (which is code, and is emitted so the main loop resumes on it).
   */
  const readTemplateText = (): void => {
    while (i < src.length) {
      const t = src[i] ?? "";
      if (t === "\\") blank(Math.min(2, src.length - i));
      else if (t === "`") {
        templates.pop();
        blank(1);
        return;
      } else if (t === "$" && src[i + 1] === "{") {
        out.push("$", "{");
        i += 2;
        return;
      } else blank(1);
    }
  };
  while (i < src.length) {
    const c = src[i] ?? "";
    // Comments and strings first: a `/` inside either opens nothing, and a `//`
    // is not a regex candidate.
    const plain = commentOrStringEnd(src, i);
    if (plain !== -1) {
      blank(plain - i);
      continue;
    }
    if (c === "/" && regexAllowedAfter(out)) {
      const end = regexLiteralEnd(src, i);
      if (end !== -1) {
        blank(end - i);
        continue;
      }
    }
    if (c === "`") {
      templates.push(0);
      blank(1);
      readTemplateText();
      continue;
    }
    if (closesInterpolation(c)) {
      // Back into template text.
      out.push("}");
      i += 1;
      readTemplateText();
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}

/**
 * A TYPE-LEVEL declaration keyword that opens a braced region containing no
 * runtime code. `declare` is deliberately ABSENT: `declare module "x" { … }` is
 * closed by the `interface` inside it (measured), while `declare const x: T`
 * with no semicolon would send the body search running into the next function.
 */
const TYPE_KEYWORD = /(?<![\p{L}\p{N}_$.])(interface|type)(?![\p{L}\p{N}_$])/gu;

/**
 * The index of the braced body opening at/after `from`, or `-1`.
 *
 * 🔴 THE BOUND IS THE WHOLE SAFETY ARGUMENT. Anything may sit on the keyword's
 * OWN line (`interface X extends Y {`); once a newline is crossed, the next
 * significant character must BE the `{`. Without that, a semicolon-less
 * `type A = string` followed by `function f() { runEval({}); }` would find the
 * FUNCTION's brace and blank a real call — trading the false positives this
 * closes for false negatives, which is the worse direction. Measured: with the
 * bound, that input still reports `runEval`.
 */
function typeBodyOpen(src: string, from: number): number {
  let crossed = false;
  for (let k = from; k < src.length; k++) {
    const c = src[k] ?? "";
    if (c === ";") return -1;
    if (c === "\n") {
      crossed = true;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === "{") return k;
    if (crossed) return -1;
  }
  return -1;
}

/**
 * Blank the BODY of every type-level declaration — the region kind that made a
 * bodiless member indistinguishable from a call.
 *
 * 🔴 WHY A REGION AND NOT ANOTHER SHAPE RULE. `runEval(o);` inside an interface
 * and `runEval({});` in a function are lexically identical, so no rule over the
 * tokens around the match can separate them; the discriminator is WHERE the match
 * sits. A type body is a delimited region, and blanking delimited regions is
 * exactly what {@link stripNonCode} already does for comments, strings and
 * template text — so this is one more region kind in the same lexer, not a
 * seventh special case. No parser, no dependency, so both engines compute it
 * identically and the byte-parity gate is untouched.
 *
 * Runs AFTER {@link stripNonCode}, and only then is brace counting sound: a `}`
 * inside a string or comment is already gone, so the depth count cannot be
 * confused by one.
 *
 * A generic head can carry braces of its own (`interface X<T extends { a: 1 }> {…}`),
 * so the search repeats from each closing brace under the same bound.
 *
 * MEASURED — five of the six known false positives close, and no true positive
 * moves (22 call shapes checked, including `` `${runEval(x)}` ``, a call in a
 * class method body, and one in an object literal, which a naive brace-blanker
 * would have eaten):
 *
 *     interface R { runEval(o); }                        → undefined  (was "runEval")
 *     type R = { runEval(o); };                          → undefined  (was "runEval")
 *     type R = { runEval(o), other: 1 };                 → undefined  (was "runEval")
 *     declare module "x" { interface I { runEval(o); } } → undefined  (was "runEval")
 *     interface X<T extends { a: 1 }> { runEval(o); }    → undefined  (was "runEval")
 *
 * ⚠️ WHAT IT STILL MISSES, run rather than asserted — a CLASS overload signature:
 *
 *     agentDrivingApi("class C { runEval(o: A); runEval(o: B) { return 1; } }")
 *                                                        → "runEval"
 *
 * A class body is NOT blankable: it holds real method bodies, and one of the true
 * positives above is a call inside one. Separating an overload signature from an
 * expression statement needs to know whether the enclosing brace is a class body
 * — the context this lexical layer does not carry. Left open deliberately, and
 * cheaply: the blast radius is a type-level test, named `*.test.*`, under a
 * surface dir, declaring an overload of a vigiles API.
 */
export function stripTypeRegions(src: string): string {
  const out = src.split("");
  TYPE_KEYWORD.lastIndex = 0;
  for (let m = TYPE_KEYWORD.exec(src); m !== null; m = TYPE_KEYWORD.exec(src)) {
    const after = m.index + (m[1] ?? "").length;
    if (!namesAType(src, after, m[1] ?? "")) continue;
    const end = blankBodies(src, out, after);
    if (end !== -1) TYPE_KEYWORD.lastIndex = end;
  }
  return out.join("");
}

/**
 * Whether this keyword opens a DECLARATION. `type` is not reserved, so
 * `const type = {…}` and `obj.type = {…}` are ordinary code whose object literal
 * must not be blanked — a real call can live inside one. (`obj.interface` is
 * excluded by the lookbehind in {@link TYPE_KEYWORD}, which has no such guard.)
 */
function namesAType(src: string, after: number, keyword: string): boolean {
  if (keyword !== "type") return true;
  let k = after;
  while (k < src.length && /\s/.test(src[k] ?? "")) k++;
  return /[A-Za-z_$]/.test(src[k] ?? "");
}

/** Index of the `}` closing the `{` at `open`, or -1 when the source is cut off. */
function matchingBrace(src: string, open: number): number {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return k;
  }
  return -1;
}

/**
 * Blank every braced group this declaration owns, returning the last one's close
 * index (or -1). A generic head carries braces of its own
 * (`interface X<T extends { a: 1 }> {…}`), so the bounded search repeats.
 */
function blankBodies(src: string, out: string[], from: number): number {
  let last = -1;
  for (
    let open = typeBodyOpen(src, from);
    open !== -1;
    open = typeBodyOpen(src, last + 1)
  ) {
    const close = matchingBrace(src, open);
    if (close === -1) return last; // truncated source — blank nothing more
    for (let k = open + 1; k < close; k++) if (out[k] !== "\n") out[k] = " ";
    last = close;
  }
  return last;
}

/**
 * A CANDIDATE call of one of {@link AGENT_DRIVING_APIS} — the identifier, then
 * optional whitespace, then `(`. Only a candidate: a DEFINITION has the same
 * shape, so every match is put through {@link isCallSite} before it counts.
 *
 * Identifier-boundary lookbehind, NOT `\b`. The boundary needed here is "not next
 * to an identifier character", and `$` is one in JS while `\b` does not know that
 * — so `\b` would match inside `$runEval`. A leading `.` is deliberately ALLOWED:
 * `v.runEval(…)` after `import * as v from "vigiles/testing"` is the same call.
 * Explicit lookaround also keeps this file clear of the `\b`-over-non-ASCII trap
 * the harness lint already tracks.
 */
const AGENT_CALL_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_$.])(?:${AGENT_DRIVING_APIS.join("|")})\\s*\\(`,
  "gu",
);

/**
 * Does this source BIND one of these names itself? If it does, a call of that
 * name is a call of the file's own thing, whatever else the file imports.
 *
 * 🔴 THE REPORTED FALSE POSITIVE, and the sixth from this file: `const runEval =
 * vi.fn(); runEval();` was read as a real-model invocation, and the author was
 * told to rename a working unit test out of their vitest run. It is the dual of
 * the import rule — and unlike that rule it costs nothing, because it needs no
 * module graph: a declaration is right there in the text.
 *
 * ⚠️ EVERY ERROR THIS FUNCTION MAKES IS TOWARD SILENCE, which is why it is
 * deliberately GENEROUS. Over-matching suppresses a warning; under-matching
 * accuses a working test. `export { x as runEval }` is a re-export rather than a
 * local binding and is matched anyway, for that reason.
 *
 * Shapes, in order: a `const`/`let`/`var`/`function`/`function*`/`class`
 * declaration of the name; a destructuring or array binding pattern that mentions
 * it before the pattern's `=`; an `as NAME` alias (`import { x as runEval }`,
 * `import * as runEval`); and a default import (`import runEval from …`).
 *
 * A plain `import { runEval } from "vigiles/testing"` is NOT a local binding —
 * that binds OUR name to OUR export, which is the case the gate exists for, and
 * none of the patterns match it.
 *
 * WHAT IT DELIBERATELY MISSES — run, not asserted (each input through the built
 * module, `agentDrivingApi` still returns the name):
 *
 *     "function f(runEval) { runEval({}); }"       → "runEval"   (parameter)
 *     "const { runEval } = await import('./x.js'); runEval({})"
 *                                                  → undefined   (suppressed —
 *                                                    a dynamic import of the REAL
 *                                                    API is silenced too)
 *
 * The first costs one warning and needs a scope analysis this module cannot have;
 * the second is the generosity above, paid in the same coin.
 */
function locallyBound(src: string, name: string): boolean {
  const tail = "(?![\\p{L}\\p{N}_$])";
  const head = "(?<![\\p{L}\\p{N}_$.])";
  return [
    `(?:const|let|var|function|class)\\s+(?:\\*\\s*)?${name}${tail}`,
    `(?:const|let|var)\\s*[{\\[][^=;]{0,400}?${head}${name}${tail}`,
    `${head}as\\s+${name}${tail}`,
    `${head}import\\s+${name}${tail}`,
  ].some((p) => new RegExp(p, "u").test(src));
}

/**
 * Words that, immediately before the name, make `name(` a DEFINITION rather than
 * a call — the shapes rule (b) below cannot see, because the construct carries no
 * body: a TS overload or ambient signature (`declare function runEval(o): void;`),
 * an `abstract` member.
 *
 * `async`/`get`/`set` are listed for completeness; their bodied forms are already
 * rejected by rule (b). A preceding `.` disqualifies the word, so the (ASI-only)
 * `const g = obj.get` + newline + `runEval(x)` stays a call.
 *
 * A generator's `*` is deliberately NOT listed: `a * runEval(x)` is
 * multiplication, and telling those apart needs the value/operator rule again —
 * while `*runEval() {}` is already a definition by rule (b).
 */
const DEFINITION_PREFIXES = new Set([
  "function",
  "declare",
  "abstract",
  "async",
  "get",
  "set",
]);

/** The identifier word ending just before `at`, and the character before IT. */
function wordBefore(src: string, at: number): { word: string; before: string } {
  let k = at - 1;
  while (k >= 0 && (src[k] ?? "").trim() === "") k--;
  let word = "";
  while (k >= 0 && /[A-Za-z_$]/.test(src[k] ?? ""))
    word = (src[k--] ?? "") + word;
  return { word, before: k >= 0 ? (src[k] ?? "") : "" };
}

/** Index of the `)` closing the `(` at `open`, or `-1` when it never closes. */
function matchingParen(src: string, open: number): number {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const ch = src[k];
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return k;
  }
  return -1;
}

/** Index of the first non-whitespace character at or after `from` (`-1` if none). */
function significantAt(src: string, from: number): number {
  let k = from;
  while (k < src.length && (src[k] ?? "").trim() === "") k++;
  return k < src.length ? k : -1;
}

/**
 * Whether the `name(` at `start` (its `(` at `paren`) is a CALL EXPRESSION rather
 * than a function/method DEFINITION — decided over the already-stripped source by
 * three POSITIONAL signals:
 *
 *   (a) the word before the name defines instead of invoking
 *       ({@link DEFINITION_PREFIXES}) — the bodiless TS signatures;
 *   (b) the `)` matching the `(` is followed by `{` — that is a body, so this is
 *       `function runEval() {}` / `class F { runEval() {} }` / `{ runEval() {} }`
 *       / `*runEval() {}`;
 *   (c) …or by `:` at all — a `)` followed by a colon is a TYPE ANNOTATION in
 *       every shape that matters here (see below).
 *
 * Sound because it reads POSITION, not spelling: a definition's parameter list is
 * followed by its body, and a call's argument list is followed by whatever the
 * surrounding expression continues with — `;`, `)`, `.`, a `}` closing an
 * interpolation, an operator, or end of input. `await runEval(x)`,
 * `obj.runEval(x)` and `` `${runEval(x)}` `` therefore stay calls, and the tests
 * pin each one.
 *
 * 🔴 A `)` FOLLOWED BY `:` ABSTAINS, AND THAT RULE IS INVERTED FROM WHAT IT WAS.
 * It used to ask whether a return type and a body followed, and treat "no body"
 * as proof of a CALL. That is backwards for the commonest TS shape there is —
 * a bodiless member signature:
 *
 *     agentDrivingApi("interface Runner { runEval(o: Opts): void; }")  → "runEval"
 *     agentDrivingApi("type R = { measureTriggerRate(o: O): Promise<number>; }")
 *                                                                → "measureTriggerRate"
 *
 * Both MEASURED against the built module 2026-08-12. A pure type-level test was
 * therefore told to rename itself out of its own vitest run — the harmful advice
 * this whole gate exists to prevent. (I had listed the interface case in a report
 * as a deliberate miss "toward silence". It was never silent; it fired. The claim
 * was written and never executed, which is why the shapes above are now pinned by
 * assertion rather than by prose.)
 *
 * So `):` is not a call. The three shapes it can be are a TS return-type
 * annotation, an object-literal method with a return type, and a ternary's colon;
 * the first two are definitions, and only the third is a call.
 *
 * WHAT THAT DELIBERATELY MISSES — verified by running each input, not asserted:
 *
 *     agentDrivingApi("const z = c ? runEval(a) : b;")     → undefined   (ternary)
 *     agentDrivingApi("runEval((")                          → undefined   (unbalanced)
 *     agentDrivingApi("runEval(x)\n{ y }")                  → undefined   (ASI block)
 *
 * All three cost one warning each. A real parse would decide them and is not
 * available here: this module is shared with the browser scan engine, whose
 * report is compared byte-for-byte with the disk engine's, so it must stay free
 * of native/runtime imports.
 *
 * ⚠️ THE REMAINING GAP, run rather than asserted — a CLASS overload signature:
 *
 *     agentDrivingApi("class C { runEval(o: A); runEval(o: B) { return 1; } }")
 *                                                              → "runEval"
 *
 * The five bodiless-member shapes that used to sit here are CLOSED, by blanking
 * type bodies as a region ({@link stripTypeRegions}) rather than by another shape
 * rule. A class body is the one that cannot be blanked — it holds real method
 * bodies, and a call inside one is a true positive the tests pin.
 */
function isCallSite(src: string, start: number, paren: number): boolean {
  const prev = wordBefore(src, start);
  // `.get`/`.set`/`.async` is a property read, not a definition keyword.
  if (DEFINITION_PREFIXES.has(prev.word) && prev.before !== ".") return false;
  const close = matchingParen(src, paren);
  if (close === -1) return false;
  const after = significantAt(src, close + 1);
  if (after === -1) return true;
  if (src[after] === "{") return false;
  if (src[after] === ":") return false;
  return true;
}

/**
 * The agent-driving vigiles API this source CALLS, or `undefined` when it calls
 * none. Exported for the tests; the engines reach it via {@link foreignRunnerTests}.
 *
 * 🔴 A DEFINITION IS NOT A CALL EITHER, and the previous version accepted one.
 * Once {@link stripNonCode} had removed comments and strings, a bare `name\s*\(`
 * was taken as proof of a call — so a surface-local `*.test.ts` that merely
 * DECLARES a helper (`function runEval() {}`) or a fake (`class Fake { runEval()
 * {} }`) was reported as driving an agent and told to rename itself. The same
 * substitution as the round before it (a lexical shape taken for the property),
 * one level in. Every match is now put through {@link isCallSite} and the FIRST
 * survivor is the evidence, so a file that defines a fake AND calls the real
 * thing is still a finding.
 */
export function agentDrivingApi(content: string): string | undefined {
  // Two region passes, in order: quotes/comments first (so brace counting is
  // sound), then type bodies (so a bodiless member is not read as a call).
  const src = stripTypeRegions(stripNonCode(content));
  AGENT_CALL_RE.lastIndex = 0;
  for (
    let m = AGENT_CALL_RE.exec(src);
    m !== null;
    m = AGENT_CALL_RE.exec(src)
  ) {
    if (isCallSite(src, m.index, m.index + m[0].length - 1)) {
      const name = m[0].replace(/\s*\($/, "");
      // A name this file binds ITSELF is not our API — see `locallyBound`.
      if (!locallyBound(src, name)) return name;
    }
  }
  return undefined;
}

/**
 * Harness surface dirs, in every form the loader accepts: bare (`skills/` — the
 * published-plugin shape) and under the materialize/user root (`.claude/skills/`
 * — what a normal Claude Code user has). Layout-driven, so a harness that names
 * its dirs differently is covered without touching this file.
 *
 * Scope is deliberate: `src/foo.test.ts` is an ordinary project test and none of
 * our business. Only a test sitting INSIDE a harness surface is a file whose
 * execution spawns an agent.
 */
export function harnessSurfaceDirs(layout: PluginLayout): readonly string[] {
  const base = [
    layout.skillDir,
    layout.agentDir,
    layout.commandDir,
    // `hooks/hooks.json` → `hooks`. Hook tests are the ones most likely to be
    // named `*.test.mjs`, since they read like ordinary unit tests.
    layout.hooksConventionPath.split("/")[0],
  ].filter((d) => d !== "");
  const roots = ["", layout.materializeRoot, layout.userSurfaceRoot ?? ""];
  const out = new Set<string>();
  for (const root of roots) {
    for (const dir of base) out.add(root === "" ? dir : `${root}/${dir}`);
  }
  return [...out];
}

function inHarnessSurface(path: string, dirs: readonly string[]): boolean {
  return dirs.some((d) => path.startsWith(`${d}/`));
}

/**
 * Classify ONE repo-relative POSIX path, or `undefined` when no default run
 * collects it. Exported for the tests — the engines call {@link foreignRunnerTests}.
 */
export function collectingRunners(path: string): ForeignRunner[] | undefined {
  const segments = path.split("/");
  const base = segments[segments.length - 1] ?? "";
  const runners: ForeignRunner[] = [];
  if (VITEST_NAME.test(base)) runners.push("vitest");
  if (JEST_NAME.test(base)) runners.push("jest");
  return runners.length > 0 ? runners : undefined;
}

/**
 * Which runners' defaults collect `path`, purely by name/location — the CHEAP
 * half, run before any file is read so the content gate below opens at most one
 * file per candidate rather than one per repo.
 */
function collectedBy(path: string): {
  runners: readonly ForeignRunner[];
  reason: "suffix" | "tests-dir";
} | null {
  const segments = path.split("/");
  const base = segments[segments.length - 1] ?? "";
  // jest's `__tests__` glob takes files by LOCATION — any js/ts file below
  // such a dir, whatever it is called. Checked on the DIRECTORY part only:
  // a file literally named `__tests__` is not a directory.
  if (segments.slice(0, -1).includes("__tests__") && EXT.test(base)) {
    return { runners: ["jest"], reason: "tests-dir" };
  }
  const runners = collectingRunners(path);
  return runners === undefined ? null : { runners, reason: "suffix" };
}

/**
 * Every harness file a DEFAULT vitest/jest run would collect AND that is known to
 * drive an agent. `list` yields repo-relative POSIX paths and `read` yields one
 * file's source — both injected, so the disk scan (walking the surface dirs) and
 * the browser scan (map lookups) share one predicate and cannot drift. Sorted,
 * because a report compared byte-for-byte cannot depend on walk order.
 *
 * `read` is REQUIRED, with no default. A default would be a silent fallback to
 * "assume it drives an agent", i.e. exactly the name-only rule whose false
 * positive is documented on {@link AGENT_DRIVING_APIS} — and an engine that
 * forgot to supply one would reintroduce it without a compile error. An
 * unreadable file (`undefined`) is likewise NOT a finding: no evidence, no
 * accusation.
 */
export function foreignRunnerTests(
  list: () => readonly string[],
  layout: PluginLayout,
  read: (path: string) => string | undefined,
): readonly ForeignRunnerTest[] {
  const dirs = harnessSurfaceDirs(layout);
  const out: ForeignRunnerTest[] = [];
  for (const path of list()) {
    if (!inHarnessSurface(path, dirs)) continue;
    const hit = collectedBy(path);
    if (hit === null) continue;
    // An `*.eval.*` name is the paid tier BY OUR OWN CONVENTION — the same class
    // of evidence as the API names, just declared in the filename instead of the
    // body, so it stands on its own and needs no read.
    const evidence = EVAL_NAME_RE.test(path)
      ? "eval-name"
      : agentDrivingApi(read(path) ?? "");
    if (evidence === undefined) continue;
    out.push({ path, runners: hit.runners, reason: hit.reason, evidence });
  }
  // Plain codepoint order, NOT `localeCompare` — the byte-parity gate compares
  // two engines' reports, and a locale-dependent sort makes that depend on the
  // machine's locale.
  return out.sort((a, b) => {
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
  });
}

/** Render one finding as a report warning. Shared, so the wording cannot drift. */
export function foreignRunnerTestWarning(f: ForeignRunnerTest): string {
  const runners = f.runners.join(" and ");
  const where =
    f.reason === "tests-dir"
      ? `sits under a \`__tests__/\` dir, and jest's default \`testMatch\` takes EVERY ` +
        `js/ts file below such a dir regardless of its name`
      : `matches the default test glob of ${runners}`;
  const fix =
    f.reason === "tests-dir"
      ? `Move it out of \`__tests__/\` (or rename the dir)`
      : `Rename it to \`*.harness.mjs\` / \`*.eval.mjs\``;
  const command = f.runners[0] === "jest" ? "npx jest" : "npx vitest run";
  return (
    `${f.path} ${where}, so a plain \`${command}\` ` +
    // No harness-specific dir name here: the fact that carries the point is the
    // EXCLUDE list, which is the runner's and is the same everywhere. Naming a
    // dir would also hard-code one harness's layout into shared code.
    `at the repo root COLLECTS AND EXECUTES it — those runners exclude only ` +
    `\`node_modules\` and \`.git\`, so living under a dot-dir protects nothing. ` +
    // A claim about THIS file, and it names its own evidence. The check no longer
    // guesses from the filename: it either read an agent-driving vigiles API out
    // of the body, or the name declares the paid tier. A file with neither is not
    // reported at all — see AGENT_DRIVING_APIS for the false positive that bought
    // this rule.
    (f.evidence === "eval-name"
      ? `This is an \`*.eval.*\` file: running it drives the REAL model, so a foreign ` +
        `runner burns model budget on every CI run. `
      : `It calls \`${f.evidence}\`, which spawns an agent, so a collected run drives ` +
        `the model outside the run you asked for. `) +
    `${fix} — vigiles collects those, and no third-party runner's defaults match them.`
  );
}
