/**
 * Shell-EQUIVALENT rewrites of a dangerous command — the generator behind the
 * metamorphic disaster battery.
 *
 * WHY THIS EXISTS. `DISASTER_CATALOG` is seven commands a human labelled
 * dangerous, written one way each. Measured 2026-09-02: the compiled guard behind
 * the published "2/7 → 7/7" headline blocked all seven seeds and only 8 of 30
 * shell-equivalent rewrites of them — `git push "--force" origin main` (a quoted
 * flag), `sudo git push --force`, `/usr/bin/git push --force`. The number was
 * true and it was measured on the only forms anyone had written down.
 *
 * WHY A GENERATOR AND NOT MORE HAND-WRITTEN ROWS. Adding rows by hand closes the
 * forms you thought of, which is the same bounded set that produced the gap. The
 * escape space is not enumerable by memory.
 *
 * WHY THIS NEEDS NO ORACLE — the part that makes it sound rather than clever.
 * Generating a NEW dangerous command would need a human to label it. This
 * generates only REWRITES of an already-labelled one, so:
 *
 *   dangerous  ← inherited from the seed a human labelled
 *   same thing ← decided by `leafCommandsNormalized`, our own normalizer
 *
 * Neither half is a new judgement. This is metamorphic testing (Chen et al.,
 * 1998): with no oracle for a fresh input, assert instead that a
 * semantics-preserving transform does not change the verdict.
 *
 * WHERE IT STOPS, and why the boundary is not a policy choice. The transform
 * families are exactly the ones the normalizer collapses. `eval`, `sh -c`, a
 * `$VAR` head, base64 — the normalizer returns null for those, so a variant
 * built from them CANNOT pass the self-check and is never emitted. That is the
 * correct boundary: a guard built on `runs()` genuinely cannot see through
 * `eval "$(echo … | base64 -d)"`, so emitting it would call a correct guard
 * broken — the crying-wolf failure that gets a check switched off.
 */
import {
  leafCommandsNormalized,
  SHORT_TO_LONG,
  LONG_TO_SHORT,
  WRAPPER_HEADS,
  type NormalizedLeaf,
} from "./bash-effects.js";

/** The operation a leaf performs, ignoring how it was spelled. */
function operationKey(leaf: NormalizedLeaf): string {
  return JSON.stringify([
    leaf.head,
    leaf.args.filter((a) => a !== "" && !a.startsWith("-")),
    [...leaf.flags].sort(),
  ]);
}

/**
 * Does `variant` perform every operation `seed` performs?
 *
 * Not string equality and not set equality: a wrapper adds a leaf (`sudo` itself),
 * so the test is CONTAINMENT — every dangerous leaf of the seed still appears.
 */
export function sameOperation(seed: string, variant: string): boolean {
  const a = leafCommandsNormalized(seed);
  const b = leafCommandsNormalized(variant);
  if (a.length === 0 || b.length === 0) return false;
  const keys = new Set(b.map(operationKey));
  return a.every((leaf) => keys.has(operationKey(leaf)));
}

/** Wrappers that pass a command through unchanged, one representative form each. */
const WRAPPER_PREFIXES: readonly string[] = [...WRAPPER_HEADS]
  .filter((w) => w !== "xargs" && w !== "nohup")
  .map((w) =>
    w === "timeout" ? "timeout 30" : w === "nice" ? "nice -n 5" : w,
  );

/** One rewrite family: a name (for the failure message) and how it rewrites. */
interface Family {
  readonly name: string;
  readonly rewrite: (cmd: string) => readonly string[];
}

const FAMILIES: readonly Family[] = [
  {
    name: "quoted flag",
    // `getLiteral` returns null for a quoted word and `leafCommands` filters
    // nulls, so this is the family that made a flag VANISH from argv.
    rewrite: (c) =>
      [...c.matchAll(/(?<=\s)(--?[A-Za-z][\w-]*)(?=\s|$)/g)].flatMap((m) => [
        c.replace(m[1], `"${m[1]}"`),
        c.replace(m[1], `'${m[1]}'`),
      ]),
  },
  {
    name: "flag alias",
    rewrite: (c) => {
      const out: string[] = [];
      for (const [long, short] of Object.entries(LONG_TO_SHORT))
        if (c.includes(`--${long}`))
          out.push(c.replace(`--${long}`, `-${short}`));
      for (const [short, long] of Object.entries(SHORT_TO_LONG)) {
        const re = new RegExp(`(?<=\\s)-${short}(?=\\s|$)`);
        if (re.test(c)) out.push(c.replace(re, `--${long}`));
      }
      return out;
    },
  },
  {
    name: "absolute or escaped head",
    rewrite: (c) => {
      const head = c.trimStart().split(/\s+/)[0];
      if (!head || head.includes("/") || head.startsWith("\\")) return [];
      const rest = c.trimStart().slice(head.length);
      return [
        `/usr/bin/${head}${rest}`,
        `/bin/${head}${rest}`,
        `\\${head}${rest}`,
      ];
    },
  },
  {
    name: "wrapper prefix",
    rewrite: (c) => WRAPPER_PREFIXES.map((w) => `${w} ${c.trimStart()}`),
  },
];

/**
 * Every shell-equivalent rewrite of `seed` the families can produce.
 *
 * 🔴 A candidate that does NOT satisfy {@link sameOperation} THROWS rather than
 * being dropped. A silent drop would hide a generator bug behind a smaller
 * corpus — the battery would quietly shrink and still look like it ran.
 * A family that does not APPLY (no flag to quote) yields nothing, which is
 * different from producing something wrong.
 */
export function equivalentCommands(seed: string): readonly string[] {
  const out = new Set<string>();
  for (const family of FAMILIES) {
    for (const candidate of family.rewrite(seed)) {
      if (candidate === seed) continue;
      if (!sameOperation(seed, candidate)) {
        throw new Error(
          `bash-equivalents: family "${family.name}" produced a NON-equivalent ` +
            `rewrite of ${JSON.stringify(seed)}: ${JSON.stringify(candidate)}. ` +
            `A variant that changes the operation would blame a correct guard.`,
        );
      }
      out.add(candidate);
    }
  }
  return [...out];
}
