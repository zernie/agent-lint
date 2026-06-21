import { agent, result } from "../../spec-shim.js";

export default agent({
  name: "real",
  description: "A real worker that exists.",
  output: result({ y: "number" }, { reason: "string" }),
});
