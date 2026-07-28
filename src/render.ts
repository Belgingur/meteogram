import { symbolUrl } from "./symbols";
import type { Labels } from "./i18n";
import type { HourPoint } from "./types";

/**
 * SVG meteogram — stacked, labelled data lanes sharing one hour axis. Fixed
 * px-per-hour, never shrinks to fit; the card scrolls horizontally instead.
 *
 * Two geometries, selected via the `layout` argument:
 *   LAYOUT_FULL (Mimir mobile handoff v3) — 34px/h, height 358, a horizontal
 *     scrub track between the symbol row and the temp lane.
 *   LAYOUT_COMPACT (Mimir map-panel handoff 1b) — 27px/h, height 252, a
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
  gridX1: number;
  axisX: number;
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
  padL: 36,
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
  gridX1: 30,
  axisX: 6,
  axisFont: 10,
  dayFont: 11,
  tempFont: 11,
  hourFont: 10.5,
  scrubTop: 39,
  scrubBottom: 336,
  hasTrack: true,
  hitY: 24,
  hitH: 30,
  handleR: 5.5,
  dotTempR: 4.5,
  dotWindR: 4,
};

export const LAYOUT_COMPACT: MeteogramLayout = {
  colW: 27,
  padL: 32,
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
  gridX1: 28,
  axisX: 5,
  axisFont: 9.5,
  dayFont: 10.5,
  tempFont: 10,
  hourFont: 10,
  scrubTop: 18,
  scrubBottom: 238,
  hasTrack: false,
  hitY: 6,
  hitH: 26,
  handleR: 5,
  dotTempR: 4,
  dotWindR: 3.6,
};

// Back-compat exports (previously module constants; now the full layout's)
export const COL_W = LAYOUT_FULL.colW;
export const PAD_L = LAYOUT_FULL.padL;

/** Whether the wind-gust series carries any data. Datasets without a gust
 *  variable (e.g. ECMWF-IS) yield all-null gustMs; the gust line + legend entry
 *  are then omitted rather than crashing or duplicating the wind line (A2). */
export function hasGustSeries(points: HourPoint[]): boolean {
  return points.some((p) => p.gustMs !== null);
}

// Temperature color rule: > 0 °C red, < 0 °C blue, exactly 0 °C neutral
export function tempColor(t: number): string {
  return t > 0 ? "#D14B4B" : t < 0 ? "#2E6FB2" : "#6B7A86";
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
): string {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="Nunito, system-ui, sans-serif">${esc(label)}</text>`;
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

/** Nice gridline values (integer °C steps) covering the temperature range */
export function temperatureTicks(temps: number[]): number[] {
  if (!temps.length) return [0, 2, 4, 6, 8];
  const min = Math.min(...temps);
  const max = Math.max(...temps);
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
 * Wind lane domain: 0–20 m/s per the handoff; extended to the next multiple
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
): { svg: string; geo: MeteogramGeometry } {
  const L = layout;
  const n = points.length;
  const width = meteogramWidth(n, L);
  const cx = (i: number): number => L.padL + i * L.colW + L.colW / 2;
  const hasGust = hasGustSeries(points);

  const temps = points
    .map((p) => p.tempC)
    .filter((v): v is number => v !== null);
  const ticks = temperatureTicks(temps);
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const ty = (v: number): number =>
    L.tempTop + ((hi - v) / (hi - lo)) * (L.tempBottom - L.tempTop);

  const ph = (mm: number): number => Math.min(L.precipCap, mm * L.precipPerMm);
  const wMax = windMax(points);
  const wy = (v: number): number =>
    L.windBase - (Math.min(v, wMax) / wMax) * L.windSpan;

  const parts: string[] = [];

  // Gridlines + left axis labels: temperature ticks, precip at 1/2 mm, wind
  for (const v of ticks) {
    parts.push(
      `<line x1="${L.gridX1}" x2="${width}" y1="${ty(v)}" y2="${ty(v)}" stroke="#EEF1F4" stroke-width="1"/>`,
      text(L.axisX, ty(v) + 3.5, `${v}°`, "#94A2AC", L.axisFont, 700),
    );
  }
  for (const mm of [1, 2]) {
    const y = L.precipBase - ph(mm);
    parts.push(
      `<line x1="${L.gridX1}" x2="${width}" y1="${y}" y2="${y}" stroke="#EEF1F4" stroke-width="1"/>`,
      text(L.axisX, y + 3.5, `${mm}`, "#94A2AC", L.axisFont, 700),
    );
  }
  for (const v of [wMax / 2, wMax]) {
    parts.push(
      `<line x1="${L.gridX1}" x2="${width}" y1="${wy(v)}" y2="${wy(v)}" stroke="#EEF1F4" stroke-width="1"/>`,
      text(L.axisX, wy(v) + 3.5, `${v}`, "#94A2AC", L.axisFont, 700),
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
      const x = L.padL + i * L.colW;
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
    // the neighbouring day header (task C1).
    const nextStart = k + 1 < dayStarts.length ? dayStarts[k + 1] : n;
    const availPx = (nextStart - i) * L.colW - 8;
    const estTextPx = label.length * L.dayFont * 0.6;
    if (estTextPx <= availPx) {
      parts.push(
        text(L.padL + i * L.colW + 6, L.dayLabelY, label, "#6B7A86", L.dayFont, 800),
      );
    }
  }

  // Úrkoma lane: hámarksúrkoma bar behind, mean úrkoma in front
  for (let i = 0; i < n; i++) {
    const pm = points[i].precipMaxMm;
    if (pm > 0) {
      const h = ph(pm);
      parts.push(
        `<rect x="${cx(i) - L.precipMaxW / 2}" y="${L.precipBase - h}" width="${L.precipMaxW}" height="${h}" rx="2" fill="#A8CBEA"/>`,
      );
    }
  }
  for (let i = 0; i < n; i++) {
    const mm = points[i].precipMm;
    if (mm > 0) {
      const h = ph(mm);
      parts.push(
        `<rect x="${cx(i) - L.precipW / 2}" y="${L.precipBase - h}" width="${L.precipW}" height="${h}" rx="2" fill="#3D82C4"/>`,
      );
    }
  }

  // Hiti lane: temperature polyline
  parts.push(
    `<path d="${linePath(points, (p) => p.tempC, cx, ty)}" fill="none" stroke="#D14B4B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Weather symbols every 2 h, centered per column
  for (let i = 0; i < n; i += 2) {
    const url = symbolUrl(points[i].symbol);
    if (url) {
      parts.push(
        `<image x="${cx(i) - L.symbolSize / 2}" y="${L.symbolY}" width="${L.symbolSize}" height="${L.symbolSize}" href="${esc(url)}"/>`,
      );
    }
  }

  // Lane dividers
  for (const y of L.dividers) {
    parts.push(
      `<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="#EAEEF1" stroke-width="1.5"/>`,
    );
  }

  // Vindur lane: gust line first (dashed), wind line on top. The gust line is
  // omitted entirely when the dataset has no gust series (task A2).
  if (hasGust) {
    parts.push(
      `<path d="${linePath(points, (p) => p.gustMs, cx, wy)}" fill="none" stroke="#7FB394" stroke-width="1.8" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  parts.push(
    `<path d="${linePath(points, (p) => p.windMs, cx, wy)}" fill="none" stroke="#3E8E63" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Temperature value labels every 3 h, above the curve, temp-colored
  for (let i = 1; i < n; i += 3) {
    const v = points[i].tempC;
    if (v !== null) {
      parts.push(
        text(cx(i), ty(v) + L.tempLabelDy, `${Math.round(v)}°`, tempColor(Math.round(v)), L.tempFont, 800, "middle"),
      );
    }
  }

  // Wind direction arrows every 3 h (rotated to where the wind blows toward
  // = meteorological direction + 180°)
  const ah = L.arrowHalf;
  const k = ah / 7; // scale the arrowhead with the shaft
  const head = `M${(-4 * k).toFixed(1)} ${(2 * k).toFixed(1)} L0 ${(7.5 * k).toFixed(1)} L${(4 * k).toFixed(1)} ${(2 * k).toFixed(1)}`;
  for (let i = 1; i < n; i += 3) {
    const dir = points[i].dirDeg;
    if (dir !== null) {
      parts.push(
        `<g transform="translate(${cx(i)} ${L.arrowY}) rotate(${(dir + 180) % 360})">` +
          `<line x1="0" y1="${-ah}" x2="0" y2="${ah}" stroke="#6B7A86" stroke-width="2" stroke-linecap="round"/>` +
          `<path d="${head}" fill="none" stroke="#6B7A86" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
          `</g>`,
      );
    }
  }

  // Hour ticks every 3 h
  for (let i = 0; i < n; i += 3) {
    const hh = String(points[i].local.getUTCHours()).padStart(2, "0");
    parts.push(text(cx(i), L.hourLabelY, hh, "#94A2AC", L.hourFont, 700, "middle"));
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
    `<line class="scrub-cursor" x1="${sx}" x2="${sx}" y1="${L.scrubTop}" y2="${L.scrubBottom}" stroke="#14202B" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.5"/>`,
    `<circle class="scrub-dot-temp" cx="${sx}" cy="${sTemp === null ? 0 : ty(sTemp)}" r="${L.dotTempR}" fill="#D14B4B" stroke="#ffffff" stroke-width="1.5"${sTemp === null ? ' visibility="hidden"' : ""}/>`,
    `<circle class="scrub-dot-wind" cx="${sx}" cy="${sWind === null ? 0 : wy(sWind)}" r="${L.dotWindR}" fill="#3E8E63" stroke="#ffffff" stroke-width="1.5"${sWind === null ? ' visibility="hidden"' : ""}/>`,
    `<circle class="scrub-handle" cx="${sx}" cy="${L.scrubTop}" r="${L.handleR}" fill="#14202B" stroke="#ffffff" stroke-width="2"/>`,
    // Invisible touch strip around the track: drags here scrub; touches
    // elsewhere on the chart scroll it horizontally as normal.
    `<rect class="scrub-hit" x="0" y="${L.hitY}" width="${width}" height="${L.hitH}" fill="transparent" style="touch-action:none;cursor:ew-resize"/>`,
  );

  const svg = `<svg width="${width}" height="${L.height}" viewBox="0 0 ${width} ${L.height}" style="display:block" role="img">${parts.join("")}</svg>`;

  const geo: MeteogramGeometry = {
    width,
    count: n,
    cx,
    tempY: ty,
    windY: wy,
    indexAt: (localX) =>
      Math.max(0, Math.min(n - 1, Math.round((localX - L.padL - L.colW / 2) / L.colW))),
  };
  return { svg, geo };
}
