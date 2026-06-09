# vigiles — 60-second demo

`INSTRUCTIONS.md` reads fine. But two of its references **lie** — and
`vigiles audit` catches both, while the two truthful ones pass silently.

From the repo root:

```bash
npm run demo
```

What you'll see:

```text
Symbol reference check:
  ✗ INSTRUCTIONS.md:9 "refreshSession" is not defined in src/auth.ts

MCP reference check:
  ✗ INSTRUCTIONS.md:14 MCP tool "helper#purge_all" not found — did you mean "purge"?
```

Why each one lies:

- **`verifyToken`** is real (`src/auth.ts`) → passes. **`refreshSession`** was
  renamed away → caught.
- **`helper#log`** is a real tool on the MCP server → passes. **`helper#purge_all`**
  isn't (the server exposes `purge`) → caught, with a "did you mean".

Nobody hand-checks these. The agent reads the instruction, gets nothing, and
continues silently. vigiles turns that silent lie into a build error. The MCP
check even starts the real server (`.mcp.json`) and lists its tools.
