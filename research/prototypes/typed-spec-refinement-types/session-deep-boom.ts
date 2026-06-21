/**
 * PROTOTYPE S1 (the WALL) — where full session types stop being practical in TS.
 *
 * session-railway.ts checks handoffs SHALLOWLY (per adjacent pair). The TEMPTING
 * "real" session type is a RECURSIVE WALK over the whole protocol — at each of N
 * steps, accumulate the error-union and re-prove the handoff, unfolding the chain
 * in the type. That walk is peano recursion over the step list, and TS's recursive
 * conditional-type evaluator hits its instantiation-depth guard.
 *
 * This file REPRODUCES TS2589 deterministically. It is the honest answer to the
 * brief's "how heavy does TS get / where does it stop being practical": the
 * branching/recursive session type is EXPRESSIBLE, and a SHALLOW unfold compiles
 * (DeepProtocol<8>, below) — but a DEEP protocol walk (DeepProtocol<5000>) exceeds
 * the depth guard, which is exactly why session-railway.ts uses the shallow
 * per-link encoding. A realistic railway is ≤ a handful of steps, so the practical
 * slice is fine; this proves the ceiling, it does not pretend it isn't there.
 *
 * The TS2589 line is LIVE (not commented out): this file is EXPECTED to fail tsc.
 *
 *   npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
 *     --target es2022 session-deep-boom.ts
 *   → error TS2589: Type instantiation is excessively deep and possibly infinite.
 */

// A protocol unfolded as a tuple of N step-frames — the type-level "walk" a naive
// full-session encoding builds to re-prove every handoff/error-arm in one type.
// (Peano over the step count; each frame would carry the accumulated err-union.)
type DeepProtocol<
  N extends number,
  Acc extends unknown[] = [],
> = Acc["length"] extends N
  ? Acc
  : DeepProtocol<N, [...Acc, { frame: unknown }]>;

// A SHALLOW protocol (a realistic railway: a handful of steps) — compiles fine.
type Shallow = DeepProtocol<8>;
type _ShallowLen = Shallow["length"]; // 8
const _shallowOk: _ShallowLen = 8;
void _shallowOk;

// A DEEP protocol walk — exceeds the instantiation-depth guard → TS2589.
// (5000 reproduces the blow-up reliably and fast; the real lesson is that the
// recursive WALK, not the count itself, is the unbounded construct.)
type Deep = DeepProtocol<5000>;
const _boom = null as unknown as Deep;
void _boom;

export type { Shallow, Deep };
