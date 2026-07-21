/**
 * `assertNever` — the exhaustive-switch guard, in its own NODE-FREE leaf so a
 * consumer can import it WITHOUT pulling `core/hash.ts` (which imports
 * `node:crypto` for `sha256short`) into a browser bundle. The deterministic audit
 * engine reaches this via `core/effects.ts`; `hash.ts` re-exports it so every
 * existing `import { assertNever } from "./hash.js"` is unchanged.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}
