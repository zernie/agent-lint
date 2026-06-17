/**
 * `vigiles/linting` — Pillar 1 entry point: the **linting layer** for instruction
 * files. Re-exports the spec builders/types, the compiler, and the linter
 * cross-referencing engine under one concern-named import. This is the canonical
 * pillar-1 surface; the spec builders are also at the package root (`vigiles`).
 */
export * from "./core/spec.js";
export * from "./core/compile.js";
export * from "./core/linters.js";
