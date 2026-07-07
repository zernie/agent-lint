# Make illegal states irrepresentable

**Principle.** Reach for a type that **cannot express the bad state** before you reach for a runtime check that hopes to catch it. If a value can be "absent," model absence (`?:` / a union) instead of a sentinel. If only some combinations of flags are valid, use a **tagged/discriminated union** so the invalid combos don't compile.

Bounded by decidability: this works for **structural, closed-vocabulary** properties. It can't make a behavioral property ("this string is a valid SQL query") irrepresentable — that's a boundary parse or a runtime guard.

## The smells

- A field that is **always the same placeholder**: `url: ""`, `id: 0`, `error: null` on the success path. A field that's always empty is a **lie** — drop it or make it optional.
- A **sentinel** for "none": `0` / `-1` / `""` / `"NONE"` where `undefined` or a variant means it.
- **Boolean-flag soup**: `{ isLoading, isError, isDone }` where `{loading:true, done:true}` is nonsense but compiles.
- An **optional field gated by another field** ("`notice` is set only when `kind === 'notice'`") enforced by a comment, not the type.

## Grep for it

```
: ""            # empty-string field / sentinel
url: ""         # a field that's always a placeholder
\?: boolean     # multiple related optional booleans → maybe a union
```

## Before → after (real, from the R3 refactor)

**Sentinels → optional (absence is a real state):**

```ts
// before — 0 means "no port", "" means "no url" (both are lies you must decode)
interface ServiceHandle {
  port: number;
  url: string;
} // port:0, url:""

// after — absence is representable and the compiler forces you to handle it
interface ServiceHandle {
  port?: number;
  url?: string;
}
```

Downstream, the illegal "endpoint on port 0" simply can't be built:

```ts
if (handle.port !== undefined) endpoints.push(`${handle.host}:${handle.port}`);
```

**Boolean soup → tagged union** (general shape):

```ts
// before
type State = { loading: boolean; data?: T; error?: E }; // impossible combos compile
// after
type State =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "err"; error: E }; // only valid states exist
```

## Rule of thumb

When you write a runtime check for "this can't happen," ask whether a type could have made it un-writable. If yes, change the type. If the check is genuinely at a dynamic boundary, keep it — but parse there (see parse-dont-validate), don't sprinkle it.
