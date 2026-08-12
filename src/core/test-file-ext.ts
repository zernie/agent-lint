/**
 * Which extension to WRITE a generated test with.
 *
 * Convention first, configuration only to disagree — the Rails/Next posture the
 * rest of this rule already takes. A project that looks like TypeScript gets a
 * `.ts` test without being asked; the config field exists for the cases detection
 * cannot get right (a monorepo with mixed packages, a JS project carrying a
 * stray `tsconfig.json`, a deliberate choice to keep tests in JS).
 *
 * 🔴 THE FIELD IS NOT WRITTEN BY `init`, ON PURPOSE. A value recorded at
 * initialisation is a decision that goes stale in silence: the project migrates to
 * TypeScript six months later and the config still says otherwise, with nobody
 * remembering it is there. Detection re-runs every time; the file stays empty
 * unless somebody actively disagrees, and an empty config means "I agree with all
 * of it".
 *
 * ## Why `.ts` and not `.mts`
 *
 * Measured on Node 22.22, both package kinds: a `.ts` file using `import` runs in
 * a package with `type: module` AND in one without it — type stripping detects
 * module syntax rather than trusting the package type. So the `.mts` special case
 * a careful reader expects here is not needed, and `.mts` stays what it is: a
 * file kind we ACCEPT (it is real, TS 4.7+) but never generate.
 *
 * ## Why `.mjs` and not `.js` for the non-TypeScript default
 *
 * `.js` in a package without `type: module` is CommonJS, and every generated test
 * uses `import`. `.mjs` is ESM regardless of the package, so the generated file
 * runs in a repo whose package.json nobody has touched.
 *
 * ## Why "looks like TypeScript" is not enough
 *
 * A suggestion is only worth making if `vigiles test` will RUN the file. Detection
 * used to stop at `tsconfig.json` / a `typescript` dependency and never ask whether
 * anything here can execute a `.ts` script — so on Node 20 (this repo's own CI) in a
 * project without `tsx`, the finding said "add `foo.harness.ts`" and the runner then
 * threw `Cannot run TypeScript test script`. The `canRunTypeScript` signal closes
 * that: a MEASURED `false` falls back to `.mjs`, which runs everywhere.
 *
 * Pure: signals in, an extension out. No filesystem — the two engines (disk and
 * browser) each gather the signals their own way and cannot drift on the decision.
 */

/** Extensions the generator is willing to emit. `.mts`/`.cts` are accepted by the
 * detector but never written — see the module header. */
const EMITTABLE = new Set(["ts", "mts", "cts", "js", "mjs", "cjs"]);

export interface TestExtSignals {
  /** `testExtension` from `.vigilesrc.json`, when the author disagreed. */
  readonly configured?: string | undefined;
  /** A `tsconfig.json` at the scan root. */
  readonly hasTsconfig: boolean;
  /** Raw `package.json` text, or undefined. Scanned for a `typescript` dependency
   *  — parsed leniently on purpose: a malformed package.json is another rule's
   *  finding, and this decision must not throw on it. */
  readonly packageJson?: string | undefined;
  /**
   * Can `vigiles test` actually EXECUTE a TypeScript script here — is `tsx`
   * installed, or does Node strip types natively (>= 22.6)? The same disjunction
   * the runner branches on; see `src/ts-runner-caps.ts#canRunTypeScript`.
   *
   * 🔴 A MEASURED `false` OVERRIDES DETECTION. "This project is TypeScript" and
   * "this project can run a TypeScript test" are different questions, and only the
   * first was being asked. On Node 20 — which this repo's own CI still runs — a
   * project with a `tsconfig.json` and no local `tsx` was told to write
   * `foo.harness.ts`, and `interpreterArgs` then threw on the very file the
   * finding had asked for. A remedy the tool refuses to run is worse than silence:
   * the author does the work and is told no.
   *
   * `undefined` means NOBODY MEASURED, and absence of measurement is not evidence
   * of absence — the browser engine has no Node to ask, and a caller who never
   * looked must not silently downgrade every TypeScript repo to `.mjs`.
   */
  readonly canRunTypeScript?: boolean | undefined;
}

/** Does the project declare a `typescript` dependency in any of the dep maps. */
function dependsOnTypescript(raw: string | undefined): boolean {
  if (!raw) return false;
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof doc !== "object" || doc === null) return false;
  const rec = doc as Record<string, unknown>;
  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = rec[key];
    if (
      typeof deps === "object" &&
      deps !== null &&
      Object.prototype.hasOwnProperty.call(deps, "typescript")
    )
      return true;
  }
  return false;
}

/**
 * The extension a generated test should use.
 *
 * An unrecognised `configured` value is IGNORED rather than honoured or thrown on:
 * writing `foo.harness.rb` because somebody typed `rb` would produce a file no
 * runner executes, and the untested finding would then point at a path that can
 * never satisfy it.
 */
export function testFileExt(signals: TestExtSignals): string {
  const configured = signals.configured?.replace(/^\./, "");
  // An EXPLICIT `testExtension: "ts"` is still honoured with no runner: the field
  // exists precisely to disagree with detection, and an author who typed it may be
  // adding `tsx` in the same breath. Only the INFERRED `.ts` is withdrawn.
  if (configured && EMITTABLE.has(configured)) return configured;
  const looksTypeScript =
    signals.hasTsconfig || dependsOnTypescript(signals.packageJson);
  return looksTypeScript && signals.canRunTypeScript !== false ? "ts" : "mjs";
}
