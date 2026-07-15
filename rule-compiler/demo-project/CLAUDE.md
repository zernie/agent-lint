# Project rules (prose) — the input to the compiler

- Never use `console.log`; use the project logger.        (R1)
- Keep functions under 40 lines.                          (R2)
- Do not import from the deprecated design system
  (`@acme/legacy-ui`).                                    (R3)
- All exported functions must be prefixed with `mk`.      (R4)
- Never hardcode secrets (passwords, API keys, tokens).   (R5)
- Prefer composition over inheritance.                    (R6, semantic)
- Write clear, self-documenting code.                     (R7, semantic)
