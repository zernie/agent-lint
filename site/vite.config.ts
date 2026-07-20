import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static multi-file build for GitHub Pages. `base: "./"` makes every asset
// reference relative, so the built site works whether it's served at the domain
// root (vigiles.sh) OR under a subpath (…github.io/vigiles/) — the Pages-routing
// decision is left open without hard-coding a base into the bundle.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
  },
});
