/**
 * FAIL CASE for affine-capability.ts — REJECTED by `tsc` alone.
 *
 *   npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
 *     --target es2022 affine-fails.ts
 *
 * The pipeline uses the once-only `deploy` capability TWICE — an affine
 * violation. The type of the argument collapses to the `__AFFINE_VIOLATION`
 * error naming the cap used twice.
 */
import { railway, step } from "./affine-capability.js";

// FAILURE — two `deploy` steps (deploy is use-at-most-once).
export const doubleDeploy = railway([
  step("deploy-staging", "deploy"),
  step("smoke", "read"),
  step("deploy-prod", "deploy"),
]);

// FAILURE — two `push` steps.
export const doublePush = railway([
  step("push-1", "push"),
  step("push-2", "push"),
]);
