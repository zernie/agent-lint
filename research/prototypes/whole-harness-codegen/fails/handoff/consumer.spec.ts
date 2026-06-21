import { agent, result } from "../../spec-shim.js";

export default agent({
  name: "consumer",
  description: "Consumes a diff — but expects string[] (mismatch).",
  output: result({ verdict: "boolean" }, { reason: "string" }),
});
