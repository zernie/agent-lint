import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { aliases } from "./vite.aliases";

// Static multi-file build for GitHub Pages. `base: "./"` makes every asset
// reference relative, so the built site works whether it's served at the domain
// root (vigiles.sh) OR under a subpath (…github.io/vigiles/) — the Pages-routing
// decision is left open without hard-coding a base into the bundle.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: aliases },
  build: {
    outDir: "dist",
    commonjsOptions: {
      // The engine dist lives OUTSIDE the site root; let @rollup/plugin-commonjs
      // transform those `require()` graphs too (not just node_modules).
      include: [/dist\//, /node_modules/],
    },
  },
});
