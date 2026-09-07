/**
 * ONE rescue for the bare `vigiles` specifier, shared by both module-resolution
 * hooks this package registers.
 *
 * 🔴 WHY IT EXISTS. A spec does `import { instructionFile } from "vigiles/spec"`
 * and a harness does `import { runHook } from "vigiles"`, so the package has to
 * sit in a `node_modules` Node can reach from that file. In a repo that already
 * has a `package.json`, the obvious way to put it there is `npm install` in the
 * root — which installs the whole dependency tree. Measured by an adopter
 * (#184): **840 packages in 2 minutes** where vigiles alone is 42 and about
 * 90 MB; the other 798 were a model-eval framework and an agent SDK that the
 * gate — `lint`, `compile` and `test`, all deterministic reads — never touches.
 * One run sat 11 minutes in that step before being cancelled. In a repo with NO
 * `package.json` at all (Python, Rust, Go) there is no install to run: the
 * typed-spec path was simply unavailable, and `compile` exited 1 with
 * `ERR_MODULE_NOT_FOUND`.
 *
 * ⚠️ `NODE_PATH` does NOT solve this, and that was measured rather than assumed:
 * Node ignores it for ESM resolution, and both a spec and a harness are ESM. So
 * the only ways to resolve a bare specifier from elsewhere are a real
 * `node_modules` entry (a symlink) or a resolver hook. This is the hook half.
 *
 * 🔴 WHY IT IS SHARED. It was written once for harness scripts and the spec host
 * did not get it, so `vigiles test` worked on a repo without `package.json` and
 * `vigiles compile` did not — the same question answered two different ways by
 * two files. Copying the branch into the second hook would have made that
 * divergence permanent instead of closing it (`one-detector-no-drift`), so the
 * branch lives here and both hooks call it.
 *
 * Scope is deliberately narrow: ONLY the `vigiles` specifier and its subpaths,
 * and only when normal resolution has already FAILED. A repo that has vigiles
 * installed locally keeps resolving to the local copy — the caller tries
 * `nextResolve` first and only reaches this on the way out — so nothing changes
 * for a repo that already worked. This only fills the hole where resolution
 * would otherwise throw.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** The shape a Node resolve hook must return. */
export type SelfResolved = {
  url: string;
  format?: string | null;
  shortCircuit?: boolean;
};

/**
 * Resolve `vigiles` / `vigiles/<subpath>` against the CLI's OWN installation,
 * or `null` when this is not our specifier / we cannot serve it.
 *
 * `null` rather than a throw of its own: the caller is inside a `catch` and the
 * ORIGINAL resolution error is the accurate one to re-raise. An unknown subpath
 * (`vigiles/nope`) would otherwise surface as `ERR_PACKAGE_PATH_NOT_EXPORTED`
 * from our rescue, blaming the rescue for the author's typo.
 *
 * The root is read from the environment at CALL time, not at module load, so a
 * test can drive both branches in one process.
 */
export function resolveSelfSpecifier(specifier: string): SelfResolved | null {
  // Handed in by the parent process (the CLI), which knows where it is
  // installed. Absent = nobody promised us a root; stay out of the way.
  const self = process.env.VIGILES_SELF_ROOT;
  if (!self) return null;
  if (specifier !== "vigiles" && !specifier.startsWith("vigiles/")) return null;
  try {
    const require = createRequire(pathToFileURL(`${self}/package.json`));
    // Resolve through the package's own `exports` map rather than guessing a
    // file path, so a subpath like `vigiles/eval` obeys the same contract it
    // would from a normal install. Node's self-reference rule is what makes
    // this work when `self` IS the vigiles package rather than a copy inside
    // some `node_modules`.
    return {
      url: pathToFileURL(require.resolve(specifier, { paths: [self] })).href,
      shortCircuit: true,
    };
  } catch {
    return null;
  }
}
