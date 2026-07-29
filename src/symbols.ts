/**
 * Production weather symbol set, copied from WOD widgets-2. In the library
 * build Vite inlines these as data URLs, so the bundle stays self-contained.
 *
 * The artwork is Yr weather symbols (c) 2015 Yr/NRK, modified, under
 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ — NOT under this
 * project's MIT licence. Because the SVGs end up inlined, the attribution has
 * to ride along in the bundle: see the `banner` in vite.config.ts, and the
 * Licence section of the README before redistributing.
 */
const files = import.meta.glob<string>("./assets/symbols/*.svg", {
  eager: true,
  import: "default",
});

/** Resolve a symbol code like "02d" to an image URL; "" when unknown. */
export function symbolUrl(code: string): string {
  if (!code) return "";
  return files[`./assets/symbols/${code}.svg`] ?? "";
}
