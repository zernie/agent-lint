import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Report } from "@/Report";
import { SAMPLE } from "@/sample";
import type { AuditReport } from "@/schema";

// The CLI replaces the placeholder string in index.html with the AuditReport
// object; until then (dev, or an unfilled template) fall back to the sample.
const injected = (window as unknown as { __VIGILES_DATA__?: unknown })
  .__VIGILES_DATA__;
const data: AuditReport =
  injected && typeof injected === "object" ? (injected as AuditReport) : SAMPLE;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Report data={data} />
  </StrictMode>,
);
