import { railway, delegate } from "vigiles/spec";
export default railway({ name: "ship", steps: [delegate("planner"), delegate("implementer")] });
