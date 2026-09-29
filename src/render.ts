import { DATA_COLORS } from "./colors";
import { symbolUrl } from "./symbols";
import type { Labels } from "./i18n";
import type { HourPoint } from "./types";

/**
 * SVG meteogram — stacked, labelled data lanes sharing one hour axis. Fixed
 * px-per-hour, never shrinks to fit; the card scrolls horizontally instead.
 *
 * The value axes are NOT part of the scrolling plot: `buildMeteogram` returns
 * them as two separate SVG strips (temperature + wind on the left, precipitation
 * on the right) that the caller mounts as pinned flex siblings of the scroller,
 * matching the desktop `.chart` structure in map-panel-graph.ts. Both strips
 * are positioned with the very same scale closures as the plot's gridlines, so
 * labels and gridlines cannot drift apart at any scroll offset.
 *
 * Two geometries, selected via the `layout` argument:
 *   LAYOUT_FULL — 34px/h, height 358, a horizontal
 *     scrub track between the symbol row and the temp lane.
 *   LAYOUT_COMPACT — 27px/h, height 252, a
 *     top-anchored scrubber (no track), for the docked desktop panel.
 */

/** All the tunable geometry of one meteogram layout */
export interface MeteogramLayout {
  colW: number;
  padL: number;
  padR: number;
  height: number;
  tempTop: number;
  tempBottom: number;
  precipBase: number;
  precipPerMm: number;
  precipCap: number;
  precipMaxW: number;
  precipW: number;
  windBase: number;
  windSpan: number;
  symbolY: number;
  symbolSize: number;
  dividers: [number, number];
  dayTop: number;
  dayBottom: number;
  dayLabelY: number;
  /** Short day marks ("Wed 8") vs the full "Wed 8. July" */
  dayLabelShort: boolean;
  tempLabelDy: number;
  arrowY: number;
  arrowHalf: number;
  hourLabelY: number;
  /** Width of the pinned left axis strip (temperature + wind ticks) */
  axisW: number;
  /** Width of the pinned right axis strip (precipitation ticks) */
  rightAxisW: number;
  /** Tick-label inset from the strip edge that faces the plot */
  axisInset: number;
  axisFont: number;
  dayFont: number;
  tempFont: number;
  hourFont: number;
  /** y of the scrub handle + top of the cursor line */
  scrubTop: number;
  scrubBottom: number;
  /** Draw the horizontal scrub track (v3) or not (compact) */
  hasTrack: boolean;
  hitY: number;
  hitH: number;
  handleR: number;
  dotTempR: number;
  dotWindR: number;
}

export const LAYOUT_FULL: MeteogramLayout = {
  colW: 34,
  // The value axes are pinned strips outside the scroller, so the plot needs no
  // left gutter of its own; `padL` is a plain leading pad and stays 0.
  padL: 0,
  padR: 14,
  height: 358,
  tempTop: 44,
  tempBottom: 140,
  precipBase: 226,
  precipPerMm: 28,
  precipCap: 62,
  precipMaxW: 20,
  precipW: 16,
  windBase: 306,
  windSpan: 58,
  symbolY: 14,
  symbolSize: 20,
  dividers: [150, 236],
  dayTop: 14,
  dayBottom: 336,
  dayLabelY: 12,
  dayLabelShort: false,
  tempLabelDy: -9,
  arrowY: 322,
  arrowHalf: 7,
  hourLabelY: 350,
  axisW: 30,
  rightAxisW: 22,
  axisInset: 5,
  axisFont: 10,
  dayFont: 11,
  tempFont: 11,
  hourFont: 10.5,
  scrubTop: 39,
  scrubBottom: 336,
  hasTrack: true,
  hitY: 24,
  // 44px is the platform floor for a touch target; the old 30 was below it, and
  // this strip is the continuous-drag scrub surface. (A tap anywhere on the plot
  // also works now — see wireTapToScrub.)
  hitH: 44,
  handleR: 5.5,
  dotTempR: 4.5,
  dotWindR: 4,
};

export const LAYOUT_COMPACT: MeteogramLayout = {
  colW: 27,
  padL: 0,
  padR: 12,
  height: 252,
  tempTop: 30,
  tempBottom: 104,
  precipBase: 162,
  precipPerMm: 22,
  precipCap: 46,
  precipMaxW: 16,
  precipW: 12,
  windBase: 228,
  windSpan: 54,
  symbolY: 122,
  symbolSize: 16,
  dividers: [118, 186],
  dayTop: 12,
  dayBottom: 238,
  dayLabelY: 11,
  dayLabelShort: true,
  tempLabelDy: -8,
  arrowY: 240,
  arrowHalf: 6,
  hourLabelY: 250,
  axisW: 28,
  rightAxisW: 20,
  axisInset: 5,
  axisFont: 9.5,
  dayFont: 10.5,
  tempFont: 10,
  hourFont: 10,
  scrubTop: 18,
  scrubBottom: 238,
  hasTrack: false,
  hitY: 6,
  hitH: 34,
  handleR: 5,
  dotTempR: 4,
  dotWindR: 3.6,
};

/** Whether the wind-gust series carries any data. Datasets without a gust
 *  variable (e.g. ECMWF-IS) yield all-null gustMs; the gust line + legend entry
 *  are then omitted rather than crashing or duplicating the wind line (A2). */
export function hasGustSeries(points: HourPoint[]): boolean {
  return points.some((p) => p.gustMs !== null);
}

// Temperature color rule: > 0 °C red, < 0 °C blue, exactly 0 °C neutral.
// The hues come from DATA_COLORS so this table agrees with both charts.
export function tempColor(t: number): string {
  return t > 0
    ? DATA_COLORS.temp
    : t < 0
      ? DATA_COLORS.tempCold
      : DATA_COLORS.neutral;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function text(
  x: number,
  y: number,
  label: string,
  fill: string,
  size: number,
  weight: number,
  anchor: "start" | "middle" | "end" = "start",
  /** Draw a white casing behind the glyphs. `paint-order` puts the stroke behind
   *  the fill, so the letterform stays crisp — it only buys separation where the
   *  label unavoidably lands on other ink (weather symbols, the scrub cursor). */
  halo = false,
): string {
  const casing = halo
    ? ` stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`
    : "";
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="Nunito, system-ui, sans-serif"${casing}>${esc(label)}</text>`;
}

/** Polyline through non-null values, breaking the pen across gaps */
function linePath(
  points: HourPoint[],
  value: (p: HourPoint) => number | null,
  cx: (i: number) => number,
  y: (v: number) => number,
): string {
  let path = "";
  let pen = false;
  for (let i = 0; i < points.length; i++) {
    const v = value(points[i]);
    if (v === null) {
      pen = false;
      continue;
    }
    path += `${pen ? "L" : "M"}${cx(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  }
  return path.trim();
}

/* ── Axis ticks: the single source of tick values, units and formatting ─────
   Shared by BOTH chart renderers (this module's mobile meteogram and the
   desktop panel chart in map-panel-graph.ts) so a scale never reads differently
   between the two. Each renderer still owns its own y-domains and geometry —
   only the tick values and their text come from here. */

/** Tick label colours */
export const TICK_COLOR = DATA_COLORS.none;
export const PRECIP_TICK_COLOR = DATA_COLORS.precipText;

/** Precipitation tick + gridline values, in mm */
export const PRECIP_TICKS: readonly number[] = [1, 2];

/** Minimum vertical gap between two tick labels before they read as crowded */
export const TICK_MIN_GAP = 22;

/**
 * Precipitation ticks for a lane that can draw up to `maxMm` before its bars
 * hit their cap.
 *
 * The old fixed [1, 2] happened to be right for both charts, because both cap
 * at ~2mm — but it was fixed, so any change to `precipCap` or `precipPerMm`
 * would have left the axis labelling millimetres the bars can no longer reach,
 * or stopping short of ones they can.
 */
export function precipTicksFor(maxMm: number): number[] {
  if (!(maxMm > 0)) return [];
  const steps = [0.5, 1, 2, 5, 10, 20];
  const step =
    steps.find((s) => Math.floor(maxMm / s) <= 3) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let v = step; v <= maxMm + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(2)));
  }
  return ticks;
}

/**
 * How many labels fit in `lanePx` without crowding, clamped to `[2, max]`.
 * Feeding this the on-screen pixel count — not the base-geometry one — is what
 * keeps a scaled-down landscape chart from carrying a desktop's worth of ticks.
 */
export function maxLabelsFor(lanePx: number, max = 8): number {
  return Math.max(2, Math.min(max, Math.floor(lanePx / TICK_MIN_GAP)));
}

/**
 * Baseline offset that drops a tick label onto its gridline: SVG text sits on
 * its baseline, so half the cap height has to be added back to centre it.
 */
export const TICK_LABEL_DY = 3.5;

/**
 * Cap height of Nunito as a fraction of font-size. Digits and the degree sign
 * both reach cap height and neither has a descender, so for a temperature label
 * this fraction IS the glyph box: `[baseline - cap, baseline]`.
 */
export const TEMP_LABEL_CAP = 0.705;

/**
 * Baseline y for the temperature value label of a point drawn at `tempY`.
 *
 * The label wants to sit above its point, but the band above the temp lane is
 * chrome — the weather-symbol row and the scrub track/handle live there — and
 * all of it is painted AFTER the labels, so a label that strays up gets a grey
 * bar drawn straight through it. On LAYOUT_FULL that made the top 14% of the
 * lane unsafe, and since the tick range always brackets the data, the day's
 * maximum lands in the top step of the scale essentially every time.
 *
 * So the label box stays below all of it: when placing it above would push the
 * glyphs past that ceiling, it flips under the point instead, where a peak has
 * room. One rule covers all three collisions because the symbol row, the track
 * and the handle all sit above the lane — with one wrinkle: the handle is a
 * circle centred ON the lane's top edge, so it reaches `handleR` INTO the lane
 * and the ceiling has to be the lower of the two, not `tempTop` alone.
 */
export function tempLabelBaselineY(tempY: number, L: MeteogramLayout): number {
  const cap = L.tempFont * TEMP_LABEL_CAP;
  const ceiling = Math.max(L.tempTop, L.scrubTop + L.handleR);
  const above = tempY + L.tempLabelDy;
  return above - cap < ceiling ? tempY - L.tempLabelDy + cap : above;
}

/** Minimum vertical gap between wind tick labels before they read as crowded */
const WIND_TICK_MIN_GAP = 20;

/** A step reads as round on a m/s scale: 1, 2, or a whole multiple of 5 */
function isRoundStep(step: number): boolean {
  return Number.isInteger(step) && (step <= 2 || step % 5 === 0);
}

/**
 * Wind tick values for a 0…`max` lane that is `lanePx` tall: cut the lane into
 * as many equal intervals as still clear {@link WIND_TICK_MIN_GAP}, keeping the
 * step round. A short mobile lane gets [10, 20] where a tall desktop one gets
 * [5, 10, 15, 20] — one rule instead of per-layout hardcoded tick arrays.
 *
 * Subdividing `max` (rather than counting a fixed step ladder upwards) is what
 * keeps the top tick exactly on the lane ceiling. That matters because the
 * mobile `max` is data-driven: a storm pushes it to 30 m/s, and a ladder step of
 * 20 would then label 20 and leave the ceiling — the number the reader wants
 * most — unlabelled.
 */
export function windTicksFor(max: number, lanePx: number): number[] {
  const maxTicks = Math.max(2, Math.floor(lanePx / WIND_TICK_MIN_GAP));
  let step = max; // no round subdivision fits: label the ceiling alone
  for (let k = maxTicks; k >= 2; k--) {
    if (isRoundStep(max / k)) {
      step = max / k;
      break;
    }
  }
  const count = Math.round(max / step);
  return Array.from({ length: count }, (_, i) => (i + 1) * step);
}

/** Tick text — the units live here so both platforms label scales identically */
export function formatTempTick(v: number): string {
  return `${v}°`;
}
export function formatWindTick(v: number): string {
  return `${v}`;
}
export function formatPrecipTick(mm: number): string {
  return `${mm}`;
}

/** Gap between a day's left divider and its header text. */
export const DAY_LABEL_PAD = 8;

/** How far a touch may travel and still count as a tap rather than a pan. */
const TAP_SLOP_PX = 10;
/** How long a touch may rest and still count as a tap rather than a hold. */
const TAP_MAX_MS = 500;

/**
 * Treat a tap on the plot as "scrub to this hour", while leaving drags to pan.
 *
 * The chart scrolls horizontally, so the plot itself cannot be a scrub surface —
 * every drag would hijack the pan. That is why scrubbing was confined to a
 * narrow strip along the top, which readers could not find and which is an
 * unkind target for a large finger or poor eyesight. A tap is distinguishable
 * from a pan by how far the pointer travelled, so both gestures can share the
 * same surface: drag to move through the forecast, tap to read one hour.
 *
 * Mouse pointers are left alone — they already scrub on hover.
 */
export function wireTapToScrub(
  el: Element,
  scrubFrom: (e: PointerEvent) => void,
): void {
  let start: { x: number; y: number; at: number } | null = null;
  el.addEventListener("pointerdown", (event) => {
    const e = event as PointerEvent;
    if (e.pointerType === "mouse") return;
    start = { x: e.clientX, y: e.clientY, at: Date.now() };
  });
  el.addEventListener("pointercancel", () => {
    start = null;
  });
  el.addEventListener("pointerup", (event) => {
    const e = event as PointerEvent;
    const from = start;
    start = null;
    if (!from || e.pointerType === "mouse") return;
    const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
    if (moved > TAP_SLOP_PX || Date.now() - from.at > TAP_MAX_MS) return;
    scrubFrom(e);
  });
}

/**
 * Keep each day's header inside the visible part of its own day.
 *
 * The plot scrolls horizontally inside its container while the day labels ride
 * in the SVG, so a label anchored to its day's left edge slides out through the
 * viewport's left edge the moment the reader scrolls into that day — which is
 * what left a clipped fragment of a weekday name ("rz" for "Sob. 12 wrz") in the
 * top-left corner, reading as a rendering fault rather than as a label.
 *
 * Each label now travels along its own day: it starts at the day's left edge,
 * follows the viewport while that day is on screen, and stops short of the next
 * day's divider so two headers never meet. The clamp bounds are baked into the
 * element as data attributes when the SVG is built, so this re-derives no chart
 * geometry on scroll.
 *
 * Shared by both chart builders — the docked panel and the phone card have the
 * same scrolling plot, and had the same bug.
 */
export function wireStickyDayLabels(
  scroll: HTMLElement,
  displayScale: () => number = () => 1,
): void {
  const labels = Array.from(
    scroll.querySelectorAll<SVGTextElement>("text.day-label"),
  );
  if (!labels.length) return;
  const place = (): void => {
    const scale = displayScale() || 1;
    const left = scroll.scrollLeft / scale;
    for (const el of labels) {
      const x0 = Number(el.dataset.x0);
      const x1 = Number(el.dataset.x1);
      if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
      // A sliver of a day can leave no room to travel; pin it to its own edge.
      const x = Math.min(Math.max(x0, left + DAY_LABEL_PAD), Math.max(x0, x1));
      el.setAttribute("x", String(x));
    }
  };
  scroll.addEventListener("scroll", place, { passive: true });
  place();
}

/**
 * Nice gridline values (integer °C steps) covering the temperature range.
 *
 * Guards the range rather than trusting the caller's filter. A single
 * non-finite reading makes `min`/`max` NaN, and every arithmetic step after
 * that stays NaN: `Math.floor(NaN / step)` is NaN, the tick loop's `v <= hi`
 * is false on the first test, and the function returns an EMPTY array. Its
 * caller then reads `ticks[0]` as the domain's low edge, gets `undefined`, and
 * every y-coordinate on the chart — including the ones with real data behind
 * them — comes out NaN. That is how one ragged API response erased the whole
 * temperature line, so the fallback ladder covers a non-finite range too.
 */
export function temperatureTicks(temps: number[]): number[] {
  const finite = temps.filter((v) => Number.isFinite(v));
  if (!finite.length) return [0, 2, 4, 6, 8];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const steps = [1, 2, 5, 10, 20, 50];
  const step =
    steps.find((s) => Math.ceil(max / s) * s - Math.floor(min / s) * s <= s * 5) ??
    steps[steps.length - 1];
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return ticks;
}

/**
 * Wind lane domain: 0–20 m/s; extended to the next multiple
 * of 10 when the data exceeds it so storm-force wind still reads.
 */
export function windMax(points: HourPoint[]): number {
  const peak = Math.max(
    0,
    ...points.map((p) => Math.max(p.windMs ?? 0, p.gustMs ?? 0)),
  );
  return Math.max(20, Math.ceil(peak / 10) * 10);
}

export function meteogramWidth(
  hours: number,
  layout: MeteogramLayout = LAYOUT_FULL,
): number {
  return layout.padL + hours * layout.colW + layout.padR;
}

/**
 * The resolved y-scales of one meteogram. Built once per render and handed to
 * the plot AND both axis strips, which is what guarantees a tick label sits on
 * its gridline: they are the same closure, not two copies of the same formula.
 */
interface MeteogramScales {
  tempTicks: number[];
  windTicks: number[];
  ty: (v: number) => number;
  wy: (v: number) => number;
  ph: (mm: number) => number;
}

function meteogramScales(
  points: HourPoint[],
  L: MeteogramLayout,
): MeteogramScales {
  // `Number.isFinite`, not `!== null`: the type says a reading is `number |
  // null`, but a short API series hands back `undefined` past its end, and
  // that slips through a null check straight into the scale arithmetic.
  const temps = points
    .map((p) => p.tempC)
    .filter((v): v is number => Number.isFinite(v));
  const tempTicks = temperatureTicks(temps);
  const [lo, hi] = [tempTicks[0], tempTicks[tempTicks.length - 1]];
  const wMax = windMax(points);
  return {
    tempTicks,
    windTicks: windTicksFor(wMax, L.windSpan),
    ty: (v) => L.tempTop + ((hi - v) / (hi - lo)) * (L.tempBottom - L.tempTop),
    wy: (v) => L.windBase - (Math.min(v, wMax) / wMax) * L.windSpan,
    ph: (mm) => Math.min(L.precipCap, mm * L.precipPerMm),
  };
}

/** Lane dividers, repeated into the axis strips so the lanes read continuously */
function dividerLines(L: MeteogramLayout, width: number): string {
  return L.dividers
    .map(
      (y) =>
        `<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="#EAEEF1" stroke-width="1.5"/>`,
    )
    .join("");
}

/**
 * Pinned LEFT axis strip: temperature (°C) over wind (m/s), right-anchored so
 * the numbers hug the plot edge. Mounted outside the scroller by the caller.
 */
function buildAxisStrip(L: MeteogramLayout, s: MeteogramScales): string {
  const ax = L.axisW - L.axisInset;
  const parts: string[] = [dividerLines(L, L.axisW)];
  for (const v of s.tempTicks) {
    parts.push(
      text(ax, s.ty(v) + TICK_LABEL_DY, formatTempTick(v), TICK_COLOR, L.axisFont, 700, "end"),
    );
  }
  for (const v of s.windTicks) {
    parts.push(
      text(ax, s.wy(v) + TICK_LABEL_DY, formatWindTick(v), TICK_COLOR, L.axisFont, 700, "end"),
    );
  }
  return `<svg class="mg-axis" width="${L.axisW}" height="${L.height}" viewBox="0 0 ${L.axisW} ${L.height}" style="display:block;flex:none" aria-hidden="true">${parts.join("")}</svg>`;
}

/**
 * Pinned RIGHT axis strip: precipitation (mm), in the precip blue. Precip shares
 * the temperature baseline, so its ticks cannot live in the left gutter without
 * colliding with the temp labels — same reasoning (and same side) as the desktop
 * chart's right-hand scale.
 */
function buildRightAxisStrip(L: MeteogramLayout, s: MeteogramScales): string {
  const parts: string[] = [dividerLines(L, L.rightAxisW)];
  for (const mm of PRECIP_TICKS) {
    parts.push(
      text(
        L.axisInset,
        L.precipBase - s.ph(mm) + TICK_LABEL_DY,
        formatPrecipTick(mm),
        PRECIP_TICK_COLOR,
        L.axisFont,
        700,
      ),
    );
  }
  return `<svg class="mg-axis-right" width="${L.rightAxisW}" height="${L.height}" viewBox="0 0 ${L.rightAxisW} ${L.height}" style="display:block;flex:none" aria-hidden="true">${parts.join("")}</svg>`;
}

/** Everything needed to position the scrubber after the SVG is in the DOM */
export interface MeteogramGeometry {
  width: number;
  count: number;
  cx: (i: number) => number;
  tempY: (v: number) => number;
  windY: (v: number) => number;
  /** Column index for an x offset local to the SVG, clamped */
  indexAt: (localX: number) => number;
}

export function buildMeteogram(
  points: HourPoint[],
  t: Labels,
  scrubIdx: number,
  layout: MeteogramLayout = LAYOUT_FULL,
  /** Column holding "now", or -1 when now is outside the series (no marker) */
  nowIdx = -1,
): {
  svg: string;
  axisSvg: string;
  rightAxisSvg: string;
  geo: MeteogramGeometry;
} {
  const L = layout;
  const n = points.length;
  const width = meteogramWidth(n, L);
  const cx = (i: number): number => L.padL + i * L.colW + L.colW / 2;
  const hasGust = hasGustSeries(points);

  const s = meteogramScales(points, L);
  const { ty, wy, ph } = s;

  const parts: string[] = [];

  // Gridlines only — the tick LABELS live in the pinned axis strips, driven by
  // these same scale closures. Lines span the full plot from x=0: there is no
  // left gutter to skip any more.
  for (const v of s.tempTicks) {
    parts.push(
      `<line x1="0" x2="${width}" y1="${ty(v)}" y2="${ty(v)}" stroke="#EEF1F4" stroke-width="1"/>`,
    );
  }
  for (const mm of PRECIP_TICKS) {
    const y = L.precipBase - ph(mm);
    parts.push(
      `<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="#EEF1F4" stroke-width="1"/>`,
    );
  }
  for (const v of s.windTicks) {
    parts.push(
      `<line x1="0" x2="${width}" y1="${wy(v)}" y2="${wy(v)}" stroke="#EEF1F4" stroke-width="1"/>`,
    );
  }

  // Day boundaries (local midnight) + day labels; label the first column too.
  const dayStarts: number[] = [0];
  for (let i = 1; i < n; i++) {
    if (points[i].local.getUTCHours() === 0) dayStarts.push(i);
  }
  for (let k = 0; k < dayStarts.length; k++) {
    const i = dayStarts[k];
    if (i > 0) {
      // On the 00:00 column's centre, with the rest of that hour's marks: the
      // hour label, the readings, the bars. The column's left EDGE — where this
      // sat — is half an hour early, and reads as a misplaced line.
      const x = cx(i);
      parts.push(
        `<line x1="${x}" x2="${x}" y1="${L.dayTop}" y2="${L.dayBottom}" stroke="#DCE3E8" stroke-width="1" stroke-dasharray="3 3"/>`,
      );
    }
    const d = points[i].local;
    const wd = t.weekdays[d.getUTCDay()];
    const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
    const label = L.dayLabelShort
      ? `${cap} ${d.getUTCDate()}`
      : t.dayLabel(cap, d.getUTCDate(), t.months[d.getUTCMonth()]);
    // Skip the label when its day span is too narrow to hold the text — the
    // first/last day can be a sliver near midnight and would otherwise overlap
    // the neighbouring day header.
    const nextStart = k + 1 < dayStarts.length ? dayStarts[k + 1] : n;
    const availPx = (nextStart - i) * L.colW - 8;
    const estTextPx = label.length * L.dayFont * 0.6;
    if (estTextPx <= availPx) {
      const x0 = (i > 0 ? cx(i) : L.padL) + 6;
      // Made sticky within its own day after mount by wireStickyDayLabels
      // (below), which reads these bounds. Anchored to the day's left edge
      // alone, the header scrolls out through the viewport's left edge and
      // leaves a clipped fragment of a weekday name in the corner.
      parts.push(
        text(x0, L.dayLabelY, label, DATA_COLORS.neutral, L.dayFont, 800).replace(
          "<text ",
          `<text class="day-label" data-x0="${x0}" data-x1="${(nextStart < n ? cx(nextStart) : L.padL + n * L.colW) - 6 - estTextPx}" `,
        ),
      );
    }
  }

  // Úrkoma lane: hámarksúrkoma bar behind, mean úrkoma in front
  for (let i = 0; i < n; i++) {
    const pm = points[i].precipMaxMm;
    if (pm > 0) {
      const h = ph(pm);
      parts.push(
        `<rect x="${cx(i) - L.precipMaxW / 2}" y="${L.precipBase - h}" width="${L.precipMaxW}" height="${h}" rx="2" fill="${DATA_COLORS.precipMax}"/>`,
      );
    }
  }
  for (let i = 0; i < n; i++) {
    const mm = points[i].precipMm;
    if (mm > 0) {
      const h = ph(mm);
      parts.push(
        `<rect x="${cx(i) - L.precipW / 2}" y="${L.precipBase - h}" width="${L.precipW}" height="${h}" rx="2" fill="${DATA_COLORS.precip}"/>`,
      );
    }
  }

  // Hiti lane: temperature polyline
  parts.push(
    `<path d="${linePath(points, (p) => p.tempC, cx, ty)}" fill="none" stroke="${DATA_COLORS.temp}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Weather symbols on every timestep, centered per column
  for (let i = 0; i < n; i += 1) {
    const url = symbolUrl(points[i].symbol);
    if (url) {
      parts.push(
        `<image x="${cx(i) - L.symbolSize / 2}" y="${L.symbolY}" width="${L.symbolSize}" height="${L.symbolSize}" href="${esc(url)}"/>`,
      );
    }
  }

  // Lane dividers — same helper as the axis strips, so the three SVGs cannot
  // end up with dividers at different weights or colours.
  parts.push(dividerLines(L, width));

  // Vindur lane: gust line first (dashed), wind line on top. The gust line is
  // omitted entirely when the dataset has no gust series.
  if (hasGust) {
    parts.push(
      `<path d="${linePath(points, (p) => p.gustMs, cx, wy)}" fill="none" stroke="${DATA_COLORS.gust}" stroke-width="1.8" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  parts.push(
    `<path d="${linePath(points, (p) => p.windMs, cx, wy)}" fill="none" stroke="${DATA_COLORS.wind}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Temperature value labels on every timestep, temp-colored. Placement (above
  // the curve, or flipped under it near the top of the lane) is
  // tempLabelBaselineY's job; the halo keeps them readable, since every column
  // now carries a weather symbol as well as a label.
  for (let i = 0; i < n; i += 1) {
    const v = points[i].tempC;
    if (v !== null) {
      parts.push(
        text(cx(i), tempLabelBaselineY(ty(v), L), `${Math.round(v)}°`, tempColor(Math.round(v)), L.tempFont, 800, "middle", true),
      );
    }
  }

  // Wind direction arrows on every timestep, pointing where the wind blows to.
  // The glyph is drawn tip-down (= pointing south at rotate(0)), so the
  // meteorological from-direction is the rotation: a wind from 0° blows south.
  const ah = L.arrowHalf;
  const k = ah / 7; // scale the arrowhead with the shaft
  const head = `M${(-4 * k).toFixed(1)} ${(2 * k).toFixed(1)} L0 ${(7.5 * k).toFixed(1)} L${(4 * k).toFixed(1)} ${(2 * k).toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const dir = points[i].dirDeg;
    if (dir !== null) {
      parts.push(
        `<g transform="translate(${cx(i)} ${L.arrowY}) rotate(${((dir % 360) + 360) % 360})">` +
          `<line x1="0" y1="${-ah}" x2="0" y2="${ah}" stroke="${DATA_COLORS.neutral}" stroke-width="2" stroke-linecap="round"/>` +
          `<path d="${head}" fill="none" stroke="${DATA_COLORS.neutral}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
          `</g>`,
      );
    }
  }

  // Hour ticks every 3 h
  for (let i = 0; i < n; i += 3) {
    const hh = String(points[i].local.getUTCHours()).padStart(2, "0");
    parts.push(text(cx(i), L.hourLabelY, hh, DATA_COLORS.neutral, L.hourFont, 700, "middle"));
  }

  // "Now" marker: the accent line the desktop panel chart draws too, so the
  // current hour reads the same on both. Under the scrubber, which starts on the
  // same column and must stay on top once the reader moves it away.
  if (nowIdx >= 0 && nowIdx < n) {
    const nx = cx(nowIdx);
    const nowTemp = points[nowIdx].tempC;
    parts.push(
      `<line class="chart-now" x1="${nx}" x2="${nx}" y1="${L.scrubTop}" y2="${L.scrubBottom}" stroke="${DATA_COLORS.now}" stroke-width="2"/>`,
    );
    if (nowTemp !== null) {
      parts.push(
        `<circle class="chart-now-dot" cx="${nx}" cy="${ty(nowTemp)}" r="${L.dotTempR}" fill="${DATA_COLORS.temp}" stroke="#ffffff" stroke-width="1.5"/>`,
      );
    }
  }

  // Scrubber (time cursor), drawn above the data: optional horizontal track,
  // handle + dashed cursor line + value dots on the temp/wind curves.
  const si = Math.max(0, Math.min(n - 1, scrubIdx));
  const sx = cx(si);
  const sTemp = points[si]?.tempC ?? null;
  const sWind = points[si]?.windMs ?? null;
  if (L.hasTrack) {
    parts.push(
      `<line class="scrub-track" x1="${cx(0)}" x2="${cx(n - 1)}" y1="${L.scrubTop}" y2="${L.scrubTop}" stroke="#DCE3E8" stroke-width="4" stroke-linecap="round"/>`,
    );
  }
  parts.push(
    `<line class="scrub-cursor" x1="${sx}" x2="${sx}" y1="${L.scrubTop}" y2="${L.scrubBottom}" stroke="#14202B" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.55"/>`,
    `<circle class="scrub-dot-temp" cx="${sx}" cy="${sTemp === null ? 0 : ty(sTemp)}" r="${L.dotTempR}" fill="${DATA_COLORS.temp}" stroke="#ffffff" stroke-width="1.5"${sTemp === null ? ' visibility="hidden"' : ""}/>`,
    `<circle class="scrub-dot-wind" cx="${sx}" cy="${sWind === null ? 0 : wy(sWind)}" r="${L.dotWindR}" fill="${DATA_COLORS.wind}" stroke="#ffffff" stroke-width="1.5"${sWind === null ? ' visibility="hidden"' : ""}/>`,
    `<circle class="scrub-handle" cx="${sx}" cy="${L.scrubTop}" r="${L.handleR}" fill="#14202B" stroke="#ffffff" stroke-width="2"/>`,
    // Invisible touch strip around the track: drags here scrub; touches
    // elsewhere on the chart scroll it horizontally as normal.
    `<rect class="scrub-hit" x="0" y="${L.hitY}" width="${width}" height="${L.hitH}" fill="transparent" style="touch-action:none;cursor:ew-resize"/>`,
  );

  const svg = `<svg class="mg-plot" width="${width}" height="${L.height}" viewBox="0 0 ${width} ${L.height}" style="display:block" aria-hidden="true">${parts.join("")}</svg>`;

  const geo: MeteogramGeometry = {
    width,
    count: n,
    cx,
    tempY: ty,
    windY: wy,
    indexAt: (localX) =>
      Math.max(0, Math.min(n - 1, Math.round((localX - L.padL - L.colW / 2) / L.colW))),
  };
  return {
    svg,
    axisSvg: buildAxisStrip(L, s),
    rightAxisSvg: buildRightAxisStrip(L, s),
    geo,
  };
}
