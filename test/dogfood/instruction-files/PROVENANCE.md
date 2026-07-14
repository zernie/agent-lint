# Vendored OSS instruction files (routing dogfood)

Real, verbatim `AGENTS.md` files from permissively-licensed OSS Python projects,
committed so `src/rule-routing-oss.test.ts` can assert the deterministic rule
router's behaviour against REAL content in CI (not just synthetic fixtures).
Only MIT-licensed upstreams are vendored, matching this repo's dogfood policy.

| File | Source | License | Fetched |
| --- | --- | --- | --- |
| `langchain.AGENTS.md` | github.com/langchain-ai/langchain `master:AGENTS.md` | MIT | 2026-07-14 |
| `browser-use.AGENTS.md` | github.com/browser-use/browser-use `main:AGENTS.md` | MIT | 2026-07-14 |

Each is the upstream file unmodified. The routing test asserts stable INVARIANTS
(a real docstring rule routes to `pylint:missing-function-docstring`, no
cross-language false positives in a pure-Python doc, the "hard to codify" lane is
populated) — not brittle exact counts — so it survives router improvements.
