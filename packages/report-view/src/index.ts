// @vigiles/report-view — the shared audit report view.
//
// Rendered from an `AuditReport` (the CLI's versioned JSON product boundary) so
// the `report/` template, the landing `site/`, and the hosted demo all show the
// SAME artifact — never a screenshot, never a duplicated component. See
// research/audit-lighthouse-design.md and the landing-site skill.
export { Report } from "./Report";
export { Ring } from "./components/Ring";
export { SAMPLE } from "./sample";
export * from "./schema";
export * from "./lib/band";
export { cn } from "./lib/utils";
