// T1 (negative) — the monadic pipeline CANNOT be asserted to a precise surface.
//
// This file is EXPECTED TO FAIL `tsc`. It is the dual of the passing proof in
// selective-applicative.ts: there we proved the monadic surface WIDENS to all
// legs; here we prove you CANNOT recover the precise surface by claiming it.
//
// An author who (wrongly) believes their dynamic, data-dependent pipeline only
// touches {fs-read, fs-write} writes the assertion below. The type system
// rejects it — because a monadic `bind`'s continuation is an opaque function of
// a runtime value, the surface is `AllLegs`, which is NOT assignable to the
// narrower claim. The compiler refuses to let the blast-radius under-state
// itself. That refusal is the SOUND behaviour: losing precision is loud, not
// silent.

type Leg = "fs-read" | "fs-write" | "net" | "exec";
type AllLegs = Leg;

interface ToolLegs {
  Read: "fs-read";
  Edit: "fs-write";
  Bash: "exec";
}
type LegsOf<T extends keyof ToolLegs> = ToolLegs[T];

interface Step<L extends Leg> {
  readonly tool: keyof ToolLegs;
  readonly _legs?: L;
}
function step<T extends keyof ToolLegs>(tool: T): Step<LegsOf<T>> {
  return { tool };
}

interface MonadicBind<A> {
  readonly _kind: "monadic";
  readonly first: Step<Leg>;
  readonly cont: (a: A) => Step<Leg>;
}
function bind<A>(first: Step<Leg>, cont: (a: A) => Step<Leg>): MonadicBind<A> {
  return { _kind: "monadic", first, cont };
}

// The monadic surface is the conservative top — ALL legs.
type MonadicSurface<P> = P extends MonadicBind<infer _A> ? AllLegs : never;

const dynamic = bind<string>(step("Read"), (contents) =>
  contents.includes("FIXME") ? step("Edit") : step("Bash"),
);

type DynamicSurface = MonadicSurface<typeof dynamic>;

// THE FAILURE: the author claims the dynamic pipeline only reads + writes.
// tsc rejects it — the real surface is AllLegs (incl. "net" | "exec"), so it is
// not assignable to the narrower {"fs-read" | "fs-write"} the author asserts.
// `assertSurface` demands the actual surface be a SUBTYPE of the claim.
function assertSurface<Claimed extends Leg>(
  _pipe: { _kind: "monadic" } & object,
  ..._proof: [DynamicSurface] extends [Claimed] ? [] : [error: never]
): void {}
// (directive removed)
assertSurface<"fs-read" | "fs-write">(dynamic);

// Control: claiming the FULL surface is accepted (proves the harness isn't just
// always-failing — the widening is real, and only an honest claim type-checks).
assertSurface<Leg>(dynamic); // OK — AllLegs ⊆ Leg.

export {};
