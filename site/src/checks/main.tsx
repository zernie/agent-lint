import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { CheckPage } from "./CheckPage";

/**
 * MPA entry for a per-check explainer page. The generated index.html for each check
 * sets `window.__CHECK_SLUG__` inline before this module runs (one shared entry, one
 * HTML per slug — see site/scripts/gen-check-pages.ts). The slug also falls out of the
 * path (`/checks/<slug>/`) as a fallback, so the page is correct even if the inline
 * global is stripped.
 */
declare global {
  interface Window {
    __CHECK_SLUG__?: string;
  }
}

function resolveSlug(): string {
  if (window.__CHECK_SLUG__) return window.__CHECK_SLUG__;
  const m = window.location.pathname.match(/\/checks\/([^/]+)\/?$/);
  return m ? m[1] : "";
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CheckPage slug={resolveSlug()} />
    </StrictMode>,
  );
}
