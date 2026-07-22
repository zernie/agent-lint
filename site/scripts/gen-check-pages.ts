/**
 * Generate one static HTML entry per audit check under `site/checks/<slug>/index.html`,
 * from the typed single source `src/checks/checks.ts`. Runs as a `prebuild`/`predev`
 * step (via tsx) so the Vite MPA input glob in `vite.config.ts` sees the pages.
 *
 * This is what makes each check a real, INDEXABLE page: its own <title>/description/
 * OG/canonical baked into static HTML — SEO for a shareable reference URL — with NO
 * client router, NO SSR, NO backend. Each page is a normal Vite entry that mounts the
 * shared React <CheckPage>; the engine demo and the landing are untouched.
 *
 * Clean URLs on GitHub Pages: emitting `checks/<slug>/index.html` serves at
 * `/checks/<slug>` and `/checks/<slug>/` with no rewrite rules. Asset/script paths
 * are relative so they hold under Vite's `base: "./"`.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { allChecks } from "../src/checks/checks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, "..");

const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const page = (slug: string, title: string, gist: string): string => {
  const pageTitle = `${title} — vigiles checks`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="../../logo.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(pageTitle)}</title>
    <meta name="description" content="${esc(gist)}" />
    <meta property="og:title" content="${esc(pageTitle)}" />
    <meta property="og:description" content="${esc(gist)}" />
    <meta property="og:type" content="article" />
    <link rel="canonical" href="https://vigiles.sh/checks/${esc(slug)}/" />
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__CHECK_SLUG__ = ${JSON.stringify(slug)};
    </script>
    <script type="module" src="/src/checks/main.tsx"></script>
  </body>
</html>
`;
};

// Clean regen so a removed check drops its page.
rmSync(join(siteRoot, "checks"), { recursive: true, force: true });
for (const c of allChecks) {
  const dir = join(siteRoot, "checks", c.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page(c.slug, c.title, c.gist));
}
console.log(
  `[gen-check-pages] wrote ${String(allChecks.length)} check page(s)`,
);
