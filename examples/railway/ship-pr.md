<!-- vigiles:sha256:aacbda14c3ac1dd1 compiled from examples/railway/ship-pr.md.spec.ts -->

# Railway: ship-pr

Dispatch these subagents on the **success track**, in order. Each returns a result block (`vigiles:ok` / `vigiles:err`). If a step returns an error, stop the success track and run the error handler with that error payload.

## Success track

1. **planner** — break the request into an ordered plan
2. **implementer** — implement the plan; prove build + tests pass
3. **reviewer** — review the diff for correctness

## Recovery

If a step errors, retry it via **fixer** up to 2× before falling to the error track.

## On error

Run **reporter** with the failing step's error payload.
