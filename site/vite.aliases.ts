import { fileURLToPath } from "node:url";

/**
 * The site's resolve aliases — shared by `vite.config.ts` (build) and
 * `vitest.config.ts` (browser tests) so the demo engine resolves identically in
 * both. `@engine/*` points at the BUILT `dist/` CJS (the literally-same compiled
 * code the CLI runs), and `node:zlib` swaps to a pako shim — the one node-builtin
 * the engine needs (gzip, for the NCD description-overlap check).
 */
export const aliases: Record<string, string> = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@engine/scan-files": fileURLToPath(
    new URL("../dist/scan-files.js", import.meta.url),
  ),
  "@engine/audit-report": fileURLToPath(
    new URL("../dist/audit-report.js", import.meta.url),
  ),
  "node:zlib": fileURLToPath(
    new URL("./src/lib/zlib-shim.ts", import.meta.url),
  ),
};
