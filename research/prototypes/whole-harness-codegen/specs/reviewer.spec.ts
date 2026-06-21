import { agent, result } from "../spec-shim.js";

export default agent({
  name: "reviewer",
  description: "Review the diff for correctness.",
  tools: ["Read", "Grep"],
  output: result(
    { approved: "boolean", notes: "string" },
    { reason: "string" },
  ),
});
