# Pure functions + injected IO seams

**Principle.** Separate the **decision/parse/build** (pure: same input → same output, no side effects) from the **IO** (spawn, network, filesystem, clock, randomness) by **injecting** the IO as a seam. Test the pure part exhaustively with fakes; keep the real-IO part thin and mark it as the untestable boundary.

This is what makes the other techniques testable — a pure `parseX` / `decideX` is trivial to unit-test; a function that both computes and spawns a subprocess is not.

## The smells

- One function that **both computes a result and performs IO** (builds args _and_ `spawnSync`s them).
- A unit test that needs a real database / network / binary to check pure logic.
- `Date.now()` / `Math.random()` / `process.env` read **inside** logic you want to test deterministically.

## The pattern

```ts
// PURE: builders + decisions (100% unit-testable, no IO)
export function dockerRunArgs(spec, name): string[] { … }
export function decide(opts): Decision { … }

// SEAM: the IO, injected (default real, override with a fake in tests)
export type DockerExec = (args: readonly string[]) => ExecResult;
export function makeRuntime(deps: { exec?: DockerExec } = {}) {
  const exec = deps.exec ?? realDockerExec; // real IO behind the default
  return { start(spec) { const a = dockerRunArgs(spec, name); return exec(a); } };
}
```

- The pure functions carry the coverage gate.
- The **real** seam (`realDockerExec` = `spawnSync`, `realNetProbe` = a socket) is `/* v8 ignore */`'d — exercised only by a gated integration test, never the unit gate. Same shape as `src/sandbox.ts` (`decideSandbox` pure vs `runSandboxed` real) and `src/services-docker.ts`.

## Rule of thumb

If you can't unit-test a function without standing up infrastructure, split it: pull the decision into a pure function, and pass the IO in. The pure half is where the logic (and the bugs) live; the seam is a thin, boring adapter you fake in tests and confine in one integration test.
