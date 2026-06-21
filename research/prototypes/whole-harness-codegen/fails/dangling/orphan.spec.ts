import { agent, result } from "../../spec-shim.js";

// BUG: delegates to "ghost", which has no spec file in this dir.
export default agent({
  name: "orphan",
  description: "Delegates to a nonexistent worker.",
  delegatesTo: ["ghost"],
  output: result({ x: "string" }, { reason: "string" }),
});
