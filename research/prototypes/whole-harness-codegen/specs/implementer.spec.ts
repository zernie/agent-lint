import { agent, result } from "../spec-shim.js";

export default agent({
  name: "implementer",
  description: "Apply the plan, producing a diff.",
  tools: ["Read", "Write", "Edit"],
  delegatesTo: ["reviewer"],
  output: result(
    { diff: "string", touched: "string[]" },
    { reason: "string", retryable: "boolean" },
  ),
});
