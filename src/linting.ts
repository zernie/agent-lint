/**
 * `vigiles/linting` — Pillar 1 entry point: the **linting layer** for instruction
 * files. Re-exports the spec builders/types and the compiler under one
 * concern-named import. The granular paths (`vigiles/spec`, `vigiles/compile`)
 * keep working; this just groups them so the import name matches the pillar.
 */
export * from "./spec.js";
export * from "./compile.js";
