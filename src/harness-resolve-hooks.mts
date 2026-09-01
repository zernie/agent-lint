/**
 * Module-resolution hook for HARNESS scripts: make a bare `vigiles` import
 * resolve to the CLI's OWN installation.
 *
 * 🔴 WHY. A harness file does `import { runHook } from "vigiles"`, so the
 * package has to sit in a `node_modules` Node can reach from that file. In a
 * repo that already has a `package.json`, the obvious way to put it there is
 * `npm install` in the root — which installs the whole dependency tree. Measured
 * by an adopter (#184): **840 packages in 2 minutes** where vigiles alone is 42
 * and about 90 MB; the other 798 were a model-eval framework and an agent SDK
 * that the gate — `lint` and `test`, both deterministic reads — never touches.
 * One run sat 11 minutes in that step before being cancelled. Their workaround
 * was installing into a directory outside the workspace and symlinking the tree
 * back in, which works and is not something every adopter should reinvent.
 *
 * ⚠️ `NODE_PATH` does NOT solve this, and that was measured rather than assumed:
 * Node ignores it for ESM resolution, and a harness is ESM. So the only ways to
 * resolve a bare specifier from elsewhere are a real `node_modules` entry (the
 * symlink) or a resolver hook. This is the hook.
 *
 * Scope is deliberately narrow: ONLY the `vigiles` specifier and its subpaths,
 * and only when the normal resolution fails. A harness that has vigiles
 * installed locally keeps resolving to the local copy, so nothing changes for a
 * repo that already worked — this only fills the hole where resolution would
 * otherwise throw.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

type ResolveContext = { parentURL?: string; conditions: string[] };
type Resolved = { url: string; format?: string | null; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => Resolved | Promise<Resolved>;

/** The CLI's own package root, handed in by the parent process. */
const SELF = process.env.VIGILES_SELF_ROOT ?? "";

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<Resolved> {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Only rescue OUR specifier, and only after normal resolution failed, so a
    // locally installed vigiles always wins and no other package is affected.
    if (!SELF) throw err;
    if (specifier !== "vigiles" && !specifier.startsWith("vigiles/")) throw err;
    const require = createRequire(pathToFileURL(`${SELF}/package.json`));
    // Resolve through the package's own `exports` map rather than guessing a
    // file path, so a subpath like `vigiles/eval` obeys the same contract it
    // would from a normal install.
    const target = require.resolve(specifier, { paths: [SELF] });
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }
}
