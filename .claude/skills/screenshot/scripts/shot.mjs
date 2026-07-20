// Reusable screenshot script — drives the pre-installed Chromium via playwright-core.
//
//   node .claude/skills/screenshot/scripts/shot.mjs <url> <outDir> [name]
//
// Env knobs: SHOT_WIDTHS="1440x900,390x844" (comma list of WxH; default desktop+mobile).
// Captures a FULL-PAGE screenshot per width, scrolling top→bottom first so scroll-reveal
// (IntersectionObserver opacity-0→in) content is actually visible — the #1 gotcha a naive
// fullPage shot hits (blank cards below the fold). Requires a server already serving <url>.
import { createRequire } from "module";
import { existsSync } from "fs";

const [, , url = "http://localhost:8899/", outDir = ".", name = "shot"] = process.argv;

// Resolve playwright-core from the repo root (this script may run from a scratchpad path).
const require = createRequire(process.cwd() + "/package.json");
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error(
    "playwright-core not found — run: npm install --no-save playwright-core (browser NOT re-downloaded; uses PLAYWRIGHT_BROWSERS_PATH)",
  );
  process.exit(1);
}

// The pre-installed Chromium (env note: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const candidates = [
  `${base}/chromium-1194/chrome-linux/chrome`,
  `${base}/chromium/chrome-linux/chrome`,
];
const exe = candidates.find(existsSync);
if (!exe) {
  console.error(`no chromium under ${base} — checked ${candidates.join(", ")}`);
  process.exit(1);
}

const widths = (process.env.SHOT_WIDTHS || "1440x900,390x844")
  .split(",")
  .map((s) => s.trim().split("x").map(Number))
  .map(([width, height]) => ({ width, height }));

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
for (const vp of widths) {
  const label = vp.width <= 600 ? "mobile" : "desktop";
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "networkidle" });
  // Trigger scroll-reveal animations, then return to top before the full-page shot.
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y <= h; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(500);
  const path = `${outDir}/${name}-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
  await page.close();
}
await browser.close();
