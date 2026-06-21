/**
 * spec-shim.ts — a self-contained, minimal copy of the parts of
 * `src/core/spec.ts` the prototype needs. We DO NOT import the real spec (this
 * prototype must not depend on the repo build), but the types are byte-faithful
 * to the shipped `agent()` / `result()` / `Shape` / `Supplies<>` surface so the
 * findings transfer directly.
 *
 * Each fixture spec file `export default`s one of these values. The generated
 * registry imports them and folds them into one typed program.
 */

export type OutputFieldType = "string" | "number" | "boolean" | "string[]";
export type Shape = Readonly<Record<string, OutputFieldType>>;

export interface OutputContract<
  Ok extends Shape = Shape,
  Err extends Shape = Shape,
> {
  readonly _ref: "output";
  readonly ok: Ok;
  readonly err: Err;
}

export function result<const Ok extends Shape, const Err extends Shape>(
  ok: Ok,
  err: Err,
): OutputContract<Ok, Err> {
  return { _ref: "output", ok, err };
}

declare const __outcome: unique symbol;
export interface TypedOutcome<Ok extends Shape, Err extends Shape> {
  readonly [__outcome]: { readonly ok: Ok; readonly err: Err };
}

export interface AgentSpec {
  readonly _specType: "agent";
  /** The agent's dispatch name — also its registry key. A string-literal type so
   *  the registry can key a union on it (the basis of the duplicate-name check). */
  readonly name: string;
  readonly description: string;
  readonly tools?: readonly string[];
  /** Names this agent delegates to (the cross-file reference we lift to the type
   *  level). A real `railway()` carries these as `delegate("x")` steps. */
  readonly delegatesTo?: readonly string[];
  readonly output?: OutputContract;
}

export type TypedAgentSpec<
  Name extends string,
  Ok extends Shape,
  Err extends Shape,
  Deps extends string = never,
> = Omit<AgentSpec, "output"> &
  TypedOutcome<Ok, Err> & {
    /** Preserve the LITERAL ok/err shapes on the value's `output` (the base
     *  `AgentSpec.output` erases to `OutputContract`), so the registry can read
     *  `registry[k]["output"]["ok"]` as the literal shape for handoff checks. */
    readonly output?: OutputContract<Ok, Err>;
    /** Phantom carriers — type-level only, erased at runtime. */
    readonly __name: Name;
    readonly __deps: Deps;
  };

export interface AgentSpecInput<
  Name extends string,
  Ok extends Shape,
  Err extends Shape,
  Deps extends string,
> {
  readonly name: Name;
  readonly description: string;
  readonly tools?: readonly string[];
  readonly delegatesTo?: readonly Deps[];
  readonly output?: OutputContract<Ok, Err>;
}

/**
 * Define a subagent. Generic over its NAME, its ok/err SHAPES, and its
 * delegate-target DEPS — all captured into the returned `TypedAgentSpec` so the
 * generated registry can cross-check them across files.
 */
export function agent<
  const Name extends string,
  const Ok extends Shape = Record<string, never>,
  const Err extends Shape = Record<string, never>,
  const Deps extends string = never,
>(
  spec: AgentSpecInput<Name, Ok, Err, Deps>,
): TypedAgentSpec<Name, Ok, Err, Deps> {
  return { _specType: "agent", ...spec } as AgentSpec as TypedAgentSpec<
    Name,
    Ok,
    Err,
    Deps
  >;
}

// ---------------------------------------------------------------------------
// The registry cross-checks (the whole-harness layer the codegen unlocks)
// ---------------------------------------------------------------------------

/**
 * `Supplies<Producer, Consumer>` — true iff Producer's `ok` shape provides every
 * field Consumer needs, with matching types. Shallow per-field mapped type (no
 * recursion) — the TS2589-safe encoding. Byte-faithful to the shipped one.
 */
export type Supplies<Producer extends Shape, Consumer extends Shape> = {
  [K in keyof Consumer]: K extends keyof Producer
    ? Producer[K] extends Consumer[K]
      ? true
      : {
          readonly __mismatch: K;
          readonly expected: Consumer[K];
          readonly got: Producer[K];
        }
    : { readonly __missing: K; readonly required: Consumer[K] };
}[keyof Consumer];

/** Extract the union of every delegate-target name declared across the registry. */
export type AllDeps<R extends Record<string, { readonly __deps: string }>> = {
  [K in keyof R]: R[K]["__deps"];
}[keyof R];

/**
 * DANGLING-DELEGATE check (registry-level). For each agent, every name in its
 * `__deps` must be a key of the registry `R`. Collapses to a descriptive error
 * object naming the dangling target, else `true`. Shallow (a per-entry mapped
 * type keyed on the registry).
 */
export type NoDanglingDelegates<
  R extends Record<string, { readonly __deps: string }>,
> = {
  [K in keyof R]: [R[K]["__deps"]] extends [never]
    ? true
    : R[K]["__deps"] extends keyof R
      ? true
      : {
          readonly __dangling_delegate: R[K]["__deps"];
          readonly from: K;
        };
}[keyof R];

/**
 * A HANDOFF assertion between two named registry entries: producer P's `ok` must
 * supply consumer C's `needs`. Used by the generated registry to encode the
 * pipeline edges declared in the harness. Shallow — one `Supplies` per edge.
 */
export type Handoff<ProducerOk extends Shape, ConsumerNeeds extends Shape> =
  Supplies<ProducerOk, ConsumerNeeds> extends true
    ? true
    : { readonly __handoff_error: Supplies<ProducerOk, ConsumerNeeds> };
