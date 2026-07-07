import { agent } from "vigiles/spec";
export default agent({
  name: "implementer",
  description: "Implement the plan and prove the build passes.",
  tools: ["Read", "Edit", "Write", "Bash"],
});
