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
  /** A reading the model does not carry. Also the axis tick labels, so it has
      to pass 4.5:1 as text: the old #94A2AC was 2.6:1 on white. */
  none: "#5E6B76",
  /** Precipitation: bars and swatch. */
  precip: "#3D82C4",
  /** Precipitation as TEXT (values, ticks): the bar blue is 4.0:1 on white,
      short of 4.5:1, so type uses this darker step. Shifted toward cyan so
      it cannot be mistaken for `tempCold`, the sub-zero blue. */
  precipText: "#146C94",
  /** The lighter upper bound of a precipitation range. */
  precipMax: "#A8CBEA",
  /** Wind speed. */
  wind: "#3E8E63",
  /** Wind speed as TEXT, for the same reason as `precipText`. */
  windText: "#2F7C55",
  /** Gusts — the same hue, lightened, always dashed. Held at 3:1 on white
      (non-text minimum); the old #7FB394 was 2.4:1. */
  gust: "#5E9E78",
  /** Direction arrows, hour and day labels: present but not a reading of its
      own. 5.4:1 on white, 4.7:1 on the frost page background. */
  neutral: "#5E6B76",
  /** The "now" marker line — the same accent on the phone and desktop charts.
      3.1:1 on white, the non-text minimum; the old #F0A32F was 2.1:1. */
  now: "#D17F00",
} as const;
