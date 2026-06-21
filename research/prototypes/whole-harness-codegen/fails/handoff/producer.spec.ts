import { agent, result } from "../../spec-shim.js";

// Produces diff as a STRING.
export default agent({
  name: "producer",
  description: "Produces a diff string.",
  delegatesTo: ["consumer"],
  output: result({ diff: "string" }, { reason: "string" }),
});
