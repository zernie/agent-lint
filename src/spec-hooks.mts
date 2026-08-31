/**
 * Module customization hooks for the spec host — vigiles' OWN loader for `.ts`
 * specs, replacing "whichever loader happens to be installed".
 *
 * Why vigiles owns this rather than shelling to `tsx`:
 *
 *   - **No install, no network.** `typescript` is already a runtime dependency
 *     of this package (`dependencies`, and `core/compile-generator.ts` uses it),
 *     so `ts.transpileModule` costs nothing extra. The bug that started this
 *     work was a consuming repo without `tsx`, where `npx tsx` went to the
 *     registry and every one of 50 specs blew a 15s budget.
 *   - **One resolution contract.** Before this, a spec's module resolution
 *     depended on the user's Node version and on which loader won — so a spec
 *     could load locally and fail in CI under different rules. A tool that
 *     audits other tools for that kind of quiet divergence should not have it.
 *
 * Scope is deliberately small and documented as such: `.ts`/`.mts` sources, the
 * `./x.js` → `./x.ts` specifier rewrite, and bare specifiers. NOT tsconfig
 * `paths`, JSX, or decorator configuration — specs are configuration modules,
 * not applications.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type ResolveContext = { parentURL?: string; conditions: string[] };
type Resolved = { url: string; format?: string | null; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => Resolved | Promise<Resolved>;

type LoadContext = { format?: string | null; conditions: string[] };
type Loaded = {
  format: string;
  source?: string | ArrayBuffer;
  shortCircuit?: boolean;
};
type NextLoad = (url: string, context: LoadContext) => Loaded | Promise<Loaded>;

const TS_SOURCE = /\.m?ts$/;

/**
 * `./x.js` → `./x.ts` when the sibling exists.
 *
 * This is the TypeScript ESM convention (`tsc` under `nodenext` requires the
 * `.js` extension in the source), which `tsx` implements and native Node does
 * not. It is the ONE divergence that matters in practice: this repository's own
 * dogfood specs import `src/core/spec.js`, a file that does not exist on disk.
 * Attempted only AFTER normal resolution fails, so it can never shadow a real
 * `.js` file.
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<Resolved> {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith(".js") && context.parentURL) {
      const candidate = new URL(
        specifier.slice(0, -3) + ".ts",
        context.parentURL,
      );
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, format: "module", shortCircuit: true };
      }
    }
    throw err;
  }
}

/** Transpile `.ts`/`.mts` with the TypeScript this package already ships. */
export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad,
): Promise<Loaded> {
  if (!TS_SOURCE.test(new URL(url).pathname)) return nextLoad(url, context);

  const fileName = fileURLToPath(url);
  const { outputText } = ts.transpileModule(readFileSync(fileName, "utf-8"), {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      // Erasing types is the whole job; anything that changes SEMANTICS is not
      // ours to decide for a spec.
      verbatimModuleSyntax: false,
      isolatedModules: true,
    },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
