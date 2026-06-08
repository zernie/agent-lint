---
name: switch-name-format
description: Switch name rendering to "last, first"
---

<!-- vigiles:result "npm test" -->

# Switch to "last, first" name format

The product now renders people's names as `last, first` (for example
`Lovelace, Ada` instead of `Ada Lovelace`).

Update the source under `src/` so names render in the new format everywhere
they appear. The behaviour is covered by the tests under `test/`.
