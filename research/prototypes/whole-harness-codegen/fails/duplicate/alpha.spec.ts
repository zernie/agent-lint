import { agent, result } from "../../spec-shim.js";

// BUG: two specs (alpha.spec.ts + beta.spec.ts) both declare name "reviewer".
export default agent({
  name: "reviewer",
  description: "First reviewer.",
  output: result({ ok: "boolean" }, { reason: "string" }),
});
