# Parse, don't validate

**Principle.** Turn loose or untrusted input into a typed, normalized value **once, at the boundary** — then pass the typed value inward. Never re-validate the same primitive at each use site. A parse produces a value that _by its type_ can't be in the bad shape; a validate just checks and hopes the next reader remembers to check too.

## The smells

- A **magic value** standing in for "absent" or "failed": `return 0`, `?? ""`, `-1`, `NaN`, `null`-that-means-something.
- The **same string parsed in more than one place**, or `JSON.parse` scattered across call sites.
- Repeated **`"x" in obj`** / `typeof` / `Array.isArray` checks on the same value as it flows through the code.
- `as`-casts at use sites (a cast is validate-and-pray; a parse returns the real type).

## Grep for it

```
=== 0            # magic-number sentinel
?? ""            # empty-string sentinel
 in ready        # repeated structural probing of one value
as [A-Z]         # casts at use sites
```

## Before → after (real, from the R3 refactor)

**Magic `0` → "a port or nothing":**

```ts
// before — every caller must remember `0 means none`
export function parseDockerPort(out: string): number {
  /* … */ return 0;
}

// after — the type says it: parse once, no downstream `=== 0`
export function parseDockerPort(out: string): number | undefined {
  /* … */ return undefined;
}
```

**Re-validated-every-poll → parsed once into a tagged shape:**

```ts
// before — probeReady re-checks `"exec" in ready` on EVERY poll
function probeReady(ctx, ready: ServiceReady) {
  if ("exec" in ready) { … }
  if ("log" in ready) { … }
  return ctx.netProbe(ctx.hostPort);
}

// after — parse ONCE at the boundary, then poll a tagged value
function parseReady(ready: ServiceReady): ReadyProbe { /* one place */ }
async function waitReady(ctx, ready, timeout) {
  const probe = parseReady(ready);   // ← the boundary
  for (;;) { if (await probeReady(ctx, probe)) return; … }
}
```

## Rule of thumb

If two different functions both inspect the raw shape of one value, you have a missing parse. Put the inspection in one `parseX(raw): Typed`, call it at the edge, and delete the downstream checks.
