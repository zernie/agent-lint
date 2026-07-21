/**
 * Normalized Compression Distance (NCD) — the model-free similarity engine.
 *
 * Extracted from proofs.ts as a NODE-FREE leaf: it depends only on `gzipSync`
 * (aliased to `pako` in the browser build) and `TextEncoder` (a Web/Node global),
 * so the description-overlap detector can reach it WITHOUT dragging proofs.ts's
 * `node:crypto` (hash.js) import into the in-browser audit bundle. proofs.ts
 * re-exports `ncd` for its existing consumers; the detector imports it from here.
 *
 * `TextEncoder` (not `Buffer.from`) keeps the byte input identical across Node and
 * the browser and removes the node-only `Buffer` global — utf-8 bytes are the same
 * either way, so gzip sees identical input and the compressed length matches.
 */
import { gzipSync } from "node:zlib";

const utf8 = new TextEncoder();

/**
 * Compressed size of a string via gzip — approximates Kolmogorov complexity
 * (the length of the shortest program that produces the string).
 */
function compressedSize(s: string): number {
  return gzipSync(utf8.encode(s), { level: 9 }).length;
}

/**
 * Normalized Compression Distance — information-theoretic similarity.
 *
 *   NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y))
 *
 * Range: [0, 1+ε] where 0 = identical information content.
 * Deterministic. No model dependency. Approximates the universal distance metric.
 *
 * Reference: Li, Chen, Li, Ma, Vitányi (2004) "The Similarity Metric"
 */
export function ncd(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0 && b.length === 0) return 0;

  const ca = compressedSize(a);
  const cb = compressedSize(b);
  const cab = compressedSize(a + b);

  const minC = Math.min(ca, cb);
  const maxC = Math.max(ca, cb);

  if (maxC === 0) return 0;
  return (cab - minC) / maxC;
}
