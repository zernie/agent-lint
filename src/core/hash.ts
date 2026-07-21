import { createHash } from "node:crypto";

// `assertNever` lives in a node-free leaf (no crypto), re-exported here so every
// existing `import { assertNever } from "./hash.js"` is unchanged while a
// browser-bound module can import it from ./assert-never.js without pulling crypto.
export { assertNever } from "./assert-never.js";

const HASH_LENGTH = 16;

declare const __brand: unique symbol;
export type SHA256Hash = string & { readonly [__brand]: "SHA256Hash" };

export function sha256short(data: string | Buffer): SHA256Hash {
  return createHash("sha256")
    .update(data)
    .digest("hex")
    .slice(0, HASH_LENGTH) as SHA256Hash;
}
