/**
 * `vigiles/experimental` — ⚠️ EXPERIMENTAL, UNSTABLE public surface.
 *
 * Everything re-exported here is a DRAFT. It is deliberately quarantined behind
 * the `experimental` subpath (and the `experimental_` name prefix on runtime
 * exports) so the import itself signals the risk at the call site:
 *
 *   import { experimental_startServices } from "vigiles/experimental";
 *
 * NOT covered by the stability guarantee (STABILITY.md): the shape may change or
 * be removed WITHOUT a major-version bump. Do not depend on it in production.
 *
 * Current contents — the R3 disposable-service tier (real side-effect testing;
 * see docs/measuring-skills.md § Experimental and src/services.ts).
 *
 * ⚠️ SAFETY: R3 runs a model-driven skill FOR REAL. The disposable container is
 * the ONLY isolation vigiles provides — it does not confine the skill's filesystem
 * or network. Run it in a disposable environment with NO production access and
 * keep real credentials out of the run. See the SAFETY note in src/services.ts and
 * docs/measuring-skills.md § Experimental.
 *
 * @experimental
 * @module vigiles/experimental
 */
export {
  experimental_startServices,
  experimental_withServices,
  type ServiceSpec,
  type ServiceReady,
  type ServiceReset,
  type ServiceHandle,
  type ServiceSession,
  type ContainerRuntime,
} from "./services.js";

export {
  experimental_dockerRuntime,
  makeDockerRuntime,
  type DockerExec,
  type NetProbe,
} from "./services-docker.js";
