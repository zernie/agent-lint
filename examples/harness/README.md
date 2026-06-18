# Testing & eval examples

Run them with the CLI:

```bash
npx vigiles test            # the deterministic *.harness.mjs tiers (no API key)
npx vigiles eval --trials=6 # the real-model *.eval.mjs tiers (keyed)
```

Everything here is documented in the **[harness-testing guide](../../docs/harness-testing.md)**
(the three tiers, the per-file walkthrough, and the canonical examples). The
`oh-my-claudecode-*` files walk one real plugin across every tier.
