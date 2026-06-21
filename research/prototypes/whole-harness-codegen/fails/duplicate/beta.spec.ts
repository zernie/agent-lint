import { agent, result } from "../../spec-shim.js";

// BUG: same name "reviewer" as alpha.spec.ts — a duplicate-name collision.
export default agent({
  name: "reviewer",
  description: "Second reviewer (name collision).",
  output: result({ ok: "boolean" }, { reason: "string" }),
});
