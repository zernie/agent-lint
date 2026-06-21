import { agent, result } from "../spec-shim.js";

export default agent({
  name: "planner",
  description: "Produce an implementation plan from a task.",
  tools: ["Read", "Grep"],
  delegatesTo: ["implementer"],
  output: result({ plan: "string", files: "string[]" }, { reason: "string" }),
});
