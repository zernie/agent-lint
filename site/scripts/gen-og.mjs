/**
 * Regenerate the social/OG card: `npm run gen:og` (from site/).
 *
 * Screenshots scripts/og-card.html at 1200x630 with deviceScaleFactor 2 and
 * writes site/public/og.png (2400x1260 — the size index.html declares in
 * og:image:width / og:image:height).
 *
 * WHY A SCRIPT AND NOT A DRAWING: the card it replaced was hand-made, so it
 * could not be diffed, could not be re-rendered when a claim changed, and had
 * drifted into naming a category ("Truthful refs") the product does not have.
 * The card is a claim surface like any other page; it should be built the same
 * way.
 *
 * OFFLINE BY REQUIREMENT. It loads a local file:// page whose fonts are system
 * fonts and whose only image is a relative path into ../public. Nothing is
 * fetched. A remote webfont would not fail loudly here — the browser would
 * substitute silently and every line break in the card would move, so the
 * render would stop matching what you reviewed.
 *
 * Uses the container's pre-installed Chromium via playwright-core; never run
 * `playwright install` (see .claude/skills/screenshot).
 */
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SOURCE = here("./og-card.html");
const OUT = here("../public/og.png");

// The declared OG size (index.html) is 2400x1260 = this viewport at 2x.
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error(
    "playwright-core not found. Run `npm ci` at the repo root (workspaces hoist it), " +
      "or `npm install --no-save playwright-core`. Do NOT run `playwright install` — " +
      "the browser is pre-installed at $PLAYWRIGHT_BROWSERS_PATH.",
  );
  process.exit(1);
}

const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const exe = [
  `${base}/chromium-1194/chrome-linux/chrome`,
  `${base}/chromium/chrome-linux/chrome`,
  `${base}/chromium_headless_shell-1194/chrome-linux/headless_shell`,
].find(existsSync);
if (!exe) {
  console.error(`no Chromium under ${base} — set PLAYWRIGHT_BROWSERS_PATH.`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});

// Fail LOUD if the page reaches for the network: an unnoticed remote font is
// exactly the failure this script is built to avoid, and it is invisible in the
// output (a substituted font renders, it just renders differently).
const offSite = [];
page.on("request", (r) => {
  if (!r.url().startsWith("file:")) offSite.push(r.url());
});

await page.goto(pathToFileURL(SOURCE).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

if (offSite.length > 0) {
  console.error(
    `og-card.html requested ${String(offSite.length)} off-file resource(s) — ` +
      `the render is not reproducible offline:\n  ${offSite.join("\n  ")}`,
  );
  await browser.close();
  process.exit(1);
}

mkdirSync(here("../public"), { recursive: true });
await page.screenshot({
  path: OUT,
  clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
});
await browser.close();

console.log(
  `wrote ${OUT} (${String(WIDTH * SCALE)}x${String(HEIGHT * SCALE)}) — now LOOK at it before committing.`,
);
