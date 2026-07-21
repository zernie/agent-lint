/**
 * Browser stand-in for `node:zlib`, aliased in `vite.config.ts`.
 *
 * The audit engine's ONLY node-builtin dependency is `node:zlib`'s `gzipSync`,
 * used by `src/core/ncd.js` (the Normalized-Compression-Distance similarity engine
 * behind description-overlap). pako's `gzip` is a synchronous, pure-JS gzip that
 * returns a `Uint8Array` — byte-identical output to Node's zlib at the same level —
 * so it satisfies the exact `gzipSync(bytes, { level }) => { length }` shape ncd.js
 * calls. The browser-parity test asserts the resulting grade is identical to Node's.
 */
import { gzip, type DeflateFunctionOptions } from "pako";

export function gzipSync(
  data: Uint8Array,
  opts?: { level?: number },
): Uint8Array {
  // ncd.js passes `{ level: 9 }`; pako types `level` as a 0–9 literal union, so
  // the widened `number` is cast at this single boundary (parse-don't-validate).
  return gzip(data, opts as DeflateFunctionOptions | undefined);
}
