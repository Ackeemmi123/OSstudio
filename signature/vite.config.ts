import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { splitKinetic } from "./src/build/kinetic";

/** Splits moving headlines into letters at build time, so no script has to. */
const kinetic = (): Plugin => ({
  name: "signature-kinetic",
  transformIndexHtml: (html) => splitKinetic(html),
});

// The lab is a plain multi-page site, built the way Signature sites will be: static pages first.
export default defineConfig({
  root: resolve(import.meta.dirname, "lab"),
  base: "./",
  publicDir: resolve(import.meta.dirname, "lab/public"),
  plugins: [kinetic()],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    rolldownOptions: {
      input: {
        lab: resolve(import.meta.dirname, "lab/index.html"),
        scen: resolve(import.meta.dirname, "lab/scen/index.html"),
        bibliotek: resolve(import.meta.dirname, "lab/bibliotek/index.html"),
        visning: resolve(import.meta.dirname, "lab/visning/index.html"),
        "404": resolve(import.meta.dirname, "lab/404.html"),
      },
    },
  },
  server: { port: 4316, strictPort: true },
  preview: { port: 4317, strictPort: true },
});
