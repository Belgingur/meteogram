/**
 * Data-encoding colours — ONE source for every surface that draws a reading.
 *
 * The widget renders the same quantities through three different code paths:
 * the DOM (`styles.ts`, cards and tables), the phone chart (`render.ts`) and
 * the map-panel chart (`map-panel-graph.ts`). They used to each spell their own
 * hex, and they drifted: temperature was `#C81D25` in the map panel and on the
 * table values, but `#D14B4B` on the phone chart and its legend swatch, so the
 * same line changed colour when the panel crossed the width threshold. The day
 * summary printed precipitation in the sub-zero blue.
 *
 * Encoding colours are not theme tokens — they carry meaning, so they live here
 * as plain values that both the CSS template and the SVG builders import.
 */
export const DATA_COLORS = {
  /** Temperature at or above 0 °C — also the line, the dots and the swatch. */
  temp: "#C81D25",
  /** Temperature below 0 °C. */
  tempCold: "#2E6FB2",
  /** A reading the model does not carry. */
  none: "#94A2AC",
  /** Precipitation: bars, values, swatch. */
  precip: "#3D82C4",
  /** The lighter upper bound of a precipitation range. */
  precipMax: "#A8CBEA",
  /** Wind speed. */
  wind: "#3E8E63",
  /** Gusts — the same hue, lightened, always dashed. */
  gust: "#7FB394",
  /** Direction arrows, tick labels: present but not a reading of its own. */
  neutral: "#6B7A86",
} as const;
