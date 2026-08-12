/**
 * Chart geometry, expressed as bands rather than hand-tuned pixel tables.
 *
 * The yr-style chart is a vertical stack: chrome above the plot (day header +
 * hour labels), the temperature lane, a gap, the wind lane, and an optional
 * strip below the plot for the wind arrows. Every y-coordinate the renderer
 * needs is a boundary between two of them.
 *
 * Those coordinates used to be typed out per size — one table for the 262px
 * docked panel, another for the 560px expanded overlay — which is why the two
 * drifted out of proportion: the panel gives its header 15.3% of the chart and
 * the overlay 11.8%, for no reason anyone recorded. Declaring the bands once
 * and resolving them against a height makes a new size a number rather than a
 * new set of guesses.
 *
 * The split that matters is fixed versus flexible:
 *
 *  - The **header** holds the day label and the hour-label row, and the
 *    **arrow strip** holds a row of wind arrows. Both are type and glyphs, so
 *    they need the same pixels at every chart height — a taller chart does not
 *    want a taller day label, it wants more room for data.
 *  - The **lanes** are the data, and they take whatever is left, split by
 *    weight.
 *
 * Sizing the chrome proportionally is what made a short landscape phone and a
 * tall desktop overlay disagree about how big a chart's furniture should be.
 */

/** A chart's band structure: fixed chrome plus weighted lanes. */
export interface YrSpec {
  /**
   * Chrome above the plot — the day header and the hour-label row. Fixed: it
   * is text, and text does not want to grow with the chart.
   */
  headerPx: number;
  /**
   * Strip below the plot for wind-direction arrows. Fixed for the same reason.
   * Below {@link ARROW_STRIP_MIN} the renderer falls back to drawing the arrows
   * inside the wind lane.
   */
  arrowsPx: number;
  /** Temperature lane weight. Precipitation bars hang off its baseline. */
  temp: number;
  /** Weight of the breathing room between the temperature and wind lanes. */
  gap: number;
  /** Wind lane weight. */
  wind: number;
}

/** Resolved y-coordinates for one chart height. */
export interface YrBands {
  height: number;
  plotTop: number;
  tempTop: number;
  tempBase: number;
  windTop: number;
  windBase: number;
  plotBottom: number;
}

/**
 * Below this, the strip under the plot is too short to hold an arrow legibly
 * and the renderer draws the arrows inside the wind lane instead. Matches the
 * threshold `windArrowY` has always applied.
 */
export const ARROW_STRIP_MIN = 22;

/**
 * Smallest lane stack worth drawing. Under this the chart is chrome with a
 * sliver of data, so the fixed bands give way proportionally rather than
 * squeezing the lanes to nothing.
 */
const MIN_LANE_STACK = 60;

/**
 * Resolve a spec against a chart height.
 *
 * Boundaries are rounded to whole pixels, each from its own running total
 * rather than by accumulating rounded band heights — so error cannot compound
 * down the stack and the last boundary lands where the spec says it should.
 *
 * When a chart is too short to afford its fixed chrome, the chrome is scaled
 * down together rather than the lanes being crushed: a 120px chart is still a
 * readable chart, just a cramped one.
 */
export function resolveYrBands(spec: YrSpec, height: number): YrBands {
  const { temp, gap, wind } = spec;
  const flexTotal = temp + gap + wind;

  let headerPx = spec.headerPx;
  let arrowsPx = spec.arrowsPx;
  const fixed = headerPx + arrowsPx;
  const available = height - fixed;
  if (available < MIN_LANE_STACK && fixed > 0) {
    const shrink = Math.max(0, height - MIN_LANE_STACK) / fixed;
    headerPx = Math.floor(headerPx * shrink);
    arrowsPx = Math.floor(arrowsPx * shrink);
  }

  const laneStack = Math.max(0, height - headerPx - arrowsPx);
  const at = (offset: number): number =>
    headerPx + (flexTotal > 0 ? Math.round((offset / flexTotal) * laneStack) : 0);

  const plotTop = headerPx;
  const tempBase = at(temp);
  const windTop = at(temp + gap);
  const windBase = at(temp + gap + wind);

  return {
    height,
    plotTop,
    // The temperature lane starts at the plot's ceiling; the same edge, named
    // twice because the renderer reads it in two different contexts.
    tempTop: plotTop,
    tempBase,
    windTop,
    windBase,
    plotBottom: windBase,
  };
}

/** Whether a resolved chart has room for a dedicated wind-arrow strip. */
export function hasArrowStrip(bands: YrBands): boolean {
  return bands.height - bands.plotBottom >= ARROW_STRIP_MIN;
}

/**
 * A phone in landscape gives the chart column only ~120–230px of visible
 * height; a low floor keeps a chart filling its space rather than clipping.
 */
export const MIN_FIT_HEIGHT = 60;

/**
 * Every SVG that makes up one chart. All of them are stretched by the same
 * fit, because they share the plot's y-scale — the left value axis, the plot
 * itself, and the right-hand precipitation axis.
 *
 * Declared here rather than written out at the call site so that adding a
 * fourth strip to the chart cannot silently leave it unscaled. That is exactly
 * how the expanded overlay ended up stretching its plot while its precip axis
 * stayed at full height, pointing the mm ticks at the wrong gridlines.
 */
export const CHART_FIT_SELECTORS = [
  ".yr-axis",
  ".yr-plot",
  ".yr-axis-right",
] as const;

/** The uniform scale from a chart's base coordinates to screen pixels. */
export interface ChartFit {
  scale: number;
  heightPx: number;
}

/**
 * Work out how to fit a `baseHeight` chart into `availH` px, or null when the
 * space is too small to be worth scaling into.
 */
export function resolveChartFit(
  baseHeight: number,
  availH: number,
  minHeight: number = MIN_FIT_HEIGHT,
): ChartFit | null {
  if (!(baseHeight > 0) || !(availH >= minHeight)) return null;
  return { scale: availH / baseHeight, heightPx: availH };
}

/**
 * Width of a chart element under a fit — deliberately fractional.
 *
 * Rounding here would make the horizontal scale `round(w·s)/w` rather than `s`,
 * so the drawing would no longer agree with the `s` that the pointer and scroll
 * maths multiply by: the scrub cursor lands beside the column it names, and by
 * a little more the further right you scrub.
 */
export function fittedWidth(baseWidth: number, fit: ChartFit): number {
  return baseWidth * fit.scale;
}

/** Y offset of a sticky lane chip under a fit. Fractional, for the same reason. */
export function fittedLaneY(baseY: number, fit: ChartFit): number {
  return baseY * fit.scale;
}

/** Gap between the hour-label baseline and the top of the plot. */
const HOUR_LABEL_GAP = 8;

/**
 * Baselines for the two rows of chrome in the header. SVG text sits on its
 * baseline, so the day label drops by roughly its cap height and the hour row
 * sits a fixed gap above the plot — both derived from the header the bands
 * actually resolved to, which is what stops a label from landing inside the
 * plot when a chart is resized.
 */
export function yrHeaderBaselines(
  bands: YrBands,
  dayLabelSize: number,
): { dayLabelY: number; hourLabelY: number } {
  return {
    dayLabelY: Math.round(dayLabelSize * 1.15),
    hourLabelY: Math.max(
      Math.round(dayLabelSize * 1.15) + 2,
      bands.plotTop - HOUR_LABEL_GAP,
    ),
  };
}

/**
 * Y positions of the three sticky lane chips (temperature, precipitation,
 * wind).
 *
 * The temperature and wind chips tuck just inside the top of their lane. The
 * precipitation chip sits above the tallest bar the lane can draw — bars rise
 * from the temperature baseline, so `precipCap` is what it has to clear.
 */
export function yrLaneChipY(
  bands: YrBands,
  precipCap: number,
): [number, number, number] {
  const inset = 8;
  return [
    bands.plotTop + inset,
    Math.max(bands.plotTop + inset, bands.tempBase - precipCap - 2),
    bands.windTop + inset,
  ];
}

/**
 * The one yr chart spec, shared by every size.
 *
 * Lane weights come from the docked panel, which had the more generous
 * temperature lane of the two originals (48% of its chart against the
 * overlay's 45%) — the temperature line is the thing people read first.
 *
 * The fixed chrome is sized for its contents rather than inherited from either
 * original: 44px holds a 16px day label above an 11px hour row with room to
 * breathe (the panel proved 40px is enough for 13px + 10px), and 26px clears
 * {@link ARROW_STRIP_MIN} so every size draws its arrows in the same place
 * instead of the panel hiding them inside the wind lane.
 *
 * Against the old hand-tuned tables this gives the expanded overlay 22px back
 * from its oversized header and hands it to the lanes, and moves the panel's
 * arrows out of the wind lane where they overlapped the line.
 */
export const YR_SPEC: YrSpec = {
  headerPx: 44,
  arrowsPx: 26,
  temp: 126,
  gap: 16,
  wind: 68,
};

/**
 * The docked panel's original bands, kept so the tests can show exactly what
 * moved when the two charts were unified. Not used by the renderer.
 */
export const LEGACY_COMPACT_SPEC: YrSpec = {
  headerPx: 40,
  arrowsPx: 12,
  temp: 126,
  gap: 16,
  wind: 68,
};

/**
 * The expanded overlay's original bands. Not used by the renderer — see
 * {@link LEGACY_COMPACT_SPEC}.
 */
export const LEGACY_FULLSCREEN_SPEC: YrSpec = {
  headerPx: 66,
  arrowsPx: 74,
  temp: 254,
  gap: 36,
  wind: 130,
};
