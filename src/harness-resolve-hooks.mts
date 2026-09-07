/**
 * Module-resolution hook for HARNESS scripts (`vigiles test` / `vigiles eval`):
 * make a bare `vigiles` import resolve to the CLI's OWN installation.
 *
 * The rescue itself — why it exists, what it refuses to touch — lives in
 * `./self-resolve.mjs`, because the spec host registers the same branch from
 * `./spec-hooks.mjs` and two copies of it is exactly the divergence that put
 * `test` and `compile` on different answers to the same question.
 *
 * What stays here is the hook PROTOCOL: try normal resolution first, and only
 * consider the rescue on the way out of the failure.
 */
import { resolveSelfSpecifier } from "./self-resolve.mjs";

type ResolveContext = { parentURL?: string; conditions: string[] };
type Resolved = { url: string; format?: string | null; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => Resolved | Promise<Resolved>;

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<Resolved> {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Only AFTER normal resolution failed, so a locally installed vigiles always
    // wins and no other package is affected.
    const rescued = resolveSelfSpecifier(specifier);
    if (!rescued) throw err;
    return rescued;
  }
}
