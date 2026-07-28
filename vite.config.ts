import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/bel-meteogram.ts"),
      name: "bel-meteogram",
      formats: ["es"],
      fileName: () => "bel-meteogram.js",
    },
    outDir: "dist",
  },
});
