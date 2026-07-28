/**
 * Production weather symbol set (yr.no convention), copied from
 * WOD widgets-2. In the library build Vite inlines these as data URLs,
 * so the bundle stays self-contained.
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
