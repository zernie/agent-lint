---
name: screenshot
description: Render a local web page / built site and capture full-page screenshots (desktop + mobile) using the pre-installed Chromium. Use when asked to screenshot, render, or "see how it looks" for the vigiles landing site (site/), the audit report (report/), or any local HTML/dev server. Handles the scroll-reveal gotcha (below-the-fold cards captured blank) automatically.
---

# screenshot — render a local page and capture it

Contributor dev skill. Drives the container's **pre-installed Chromium** (no `playwright install`,
no browser download) via `playwright-core` to full-page-screenshot a locally-served page. Built
from the hard-won gotchas of doing this by hand (see below).

## When to use

- "screenshot the landing page / site", "how does the report look", "render `site/` and show me".
- Verifying a UI change in `site/` (the landing) or `report/` (the audit report) before committing.

## Procedure

1. **Build the target** (if it's a Vite app, you need `dist/`):
   - Landing: `cd site && npm install && npm run build` → `site/dist/`
   - Report: it builds with the root `npm run build` → `dist/audit-report.template.html`
2. **Serve it** on a port (relative asset refs need the dir as web root):
   ```bash
   cd site/dist && python3 -m http.server 8899 >/tmp/httpd.log 2>&1 &
   sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/   # expect 200
   ```
3. **Ensure the driver** (no browser download — uses `PLAYWRIGHT_BROWSERS_PATH`):
   ```bash
   node -e "require.resolve('playwright-core')" 2>/dev/null || npm install --no-save playwright-core
   ```
4. **Shoot** with the bundled script → writes `<outDir>/<name>-desktop.png` + `-mobile.png`:
   ```bash
   node .claude/skills/screenshot/scripts/shot.mjs http://localhost:8899/ "$SCRATCHPAD" landing
   ```
   Override viewports with `SHOT_WIDTHS="1440x900,768x1024,390x844"`.
5. **Look before sending**: `Read` the desktop PNG to sanity-check it rendered, THEN `SendUserFile`
   (display: render) so the user sees it. Send to the scratchpad dir, not the repo.

## Gotchas this skill encodes (don't relearn them)

- **Scroll-reveal = blank cards.** Sections that fade in on scroll (`opacity-0` + IntersectionObserver)
  are captured INVISIBLE by a naive `fullPage` screenshot — the hero renders, everything below the fold
  is blank. The script scrolls top→bottom to trigger the reveals, then returns to top before shooting.
  If cards are blank, this is why.
- **Chromium is pre-installed** at `/opt/pw-browsers/chromium-*/chrome-linux/chrome`; pass it as
  `executablePath` + `--no-sandbox`. NEVER run `playwright install` (blocked; wastes time).
- **CJS-from-ESM import**: `playwright-core`'s entry is CJS, and a script run from the scratchpad can't
  resolve the repo's `node_modules` by a bare import — use `createRequire(cwd + '/package.json')`
  (the script does this).
- **Mobile uploads sometimes 400** on `SendUserFile` — retry once, or send desktop alone.

## Not shipped

This is a `.claude/` contributor skill (this repo's own harness), not a published consumer skill.
