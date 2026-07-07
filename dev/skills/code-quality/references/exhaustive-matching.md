# Exhaustive matching

**Principle.** When you branch on a tagged union, make the compiler **prove you handled every case**. A `switch` on the discriminant with `default: assertNever(x)` turns "someone added a variant and forgot a branch" from a silent runtime fall-through into a **compile error**.

This is the natural partner of _make-illegal-states-irrepresentable_: once the data is a tagged union, exhaustive matching is how you consume it safely.

## The smells

- An `if`/`else if` chain on `"x" in obj` or `typeof` with an implicit "else = the last case."
- A `switch` on a union discriminant with **no `default`**, or a `default` that silently returns/ignores.
- Adding a new union variant and hunting for every `switch` by hand.

## The pattern

```ts
import { assertNever } from "…/assertNever"; // throws on `never`

function handle(p: ReadyProbe): Result {
  switch (p.kind) {
    case "exec": return …;
    case "log":  return …;
    case "tcp":  return …;
    /* v8 ignore next 2 -- exhaustiveness guard, unreachable given ReadyProbe */
    default: return assertNever(p); // add a variant → this line stops compiling
  }
}
```

`assertNever(x: never): never { throw new Error(...) }` — the parameter is `never`, so if any case is unhandled, `p` isn't narrowed to `never` and the call is a type error.

## Real example (from the R3 refactor)

`probeReady` went from a fall-through `if`-chain to a `switch (probe.kind)` with `assertNever` — so a future `ready: { http }` kind is a compile error until it's handled, and the "tcp on a service with no port" combo throws explicitly instead of probing port 0.

## Coverage note

The `default: assertNever` line is unreachable by construction, so under a 100%-line coverage gate mark it `/* v8 ignore next 2 */` (it's a guard, not dead code). That's honest — you're excluding the unreachable exhaustiveness backstop, not gaming a real branch.

## Rule of thumb

Any `switch` on a union you own gets an `assertNever` default. If you're tempted to leave it off "because all cases are covered today," that's exactly the future regression the default prevents.
