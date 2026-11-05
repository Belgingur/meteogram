import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Legal banner. The bundle inlines the weather symbols as data URLs, so a
 * consumer who receives only bel-meteogram.js still receives the CC BY 4.0
 * artwork — the attribution has to travel in the file itself, not just in
 * the repo README. See the Licence section of the README.
 */
const banner = `/*!
 * bel-meteogram — Belgingur meteogram web component
 * Copyright (c) 2026 Belgingur. Licensed under the MIT License.
 *
 * Bundled weather symbols: Yr weather symbols (c) 2015 Yr/NRK, modified
 * (re-exported, recoloured and renamed to numeric symbol codes).
 * Licensed under CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
 * Originals: https://github.com/nrkno/yr-weather-symbols
 *
 * Bundled icon: Lucide "award" — https://lucide.dev/icons/award
 * ISC License
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */`;

/**
 * Prepend the banner in `generateBundle`, which runs after every `renderChunk`
 * hook — including Vite's esbuild minifier, which strips `/*!` comments and so
 * silently swallows `rollupOptions.output.banner`. Attribution is a licence
 * obligation, so it must not depend on minifier comment handling.
 */
function legalBanner() {
  return {
    name: "bel-meteogram:legal-banner",
    enforce: "post" as const,
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      for (const chunk of Object.values(bundle)) {
        const c = chunk as { type: string; code?: string };
        if (c.type === "chunk" && c.code) c.code = `${banner}\n${c.code}`;
      }
    },
  };
}

export default defineConfig({
  plugins: [legalBanner()],
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
