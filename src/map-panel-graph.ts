import type { Labels } from "./i18n";
import {
  arrowSvg,
  compassLabel,
  scrubTimeLabel,
  windText,
} from "./graph-card";
import {
  esc,
  formatPrecipTick,
  formatTempTick,
  formatWindTick,
  hasGustSeries,
  maxLabelsFor,
  PRECIP_TICK_COLOR,
  precipTicksFor,
  temperatureTicks,
  TICK_COLOR,
  TICK_LABEL_DY,
  windTicksFor,
} from "./render";
import {
  CHART_FIT_SELECTORS,
  fittedLaneY,
  fittedWidth,
  hasArrowStrip,
  resolveChartFit,
  resolveYrBands,
  YR_SPEC,
  yrHeaderBaselines,
  yrLaneChipY,
  type YrSpec,
} from "./layout";
import { symbolUrl } from "./symbols";
import type { HourPoint } from "./types";

/** Map-panel 2a temperature colour (§6) */
export function tempColorYr(t: number): string {
  return t > 0 ? "#C81D25" : t < 0 ? "#2E6FB2" : "#6B7A86";
}

interface YrLayout {
  colW: number;
  height: number;
  axisW: number;
  /** Width of the pinned right-hand precipitation strip */
  rightAxisW: number;
  /** Type size of the numeric tick labels in both gutters */
  axisFont: number;
  plotTop: number;
  plotBottom: number;
  tempTop: number;
  tempBase: number;
  /** Filled by resolveYrLayout from the displayed data */
  tempLo: number;
  tempHi: number;
  tempTicks: number[];
  windTop: number;
  windBase: number;
  windMax: number;
  /** Filled by resolveYrLayout from the lane height (shared tick rule) */
  windTicks: number[];
  precipBase: number;
  precipPerMm: number;
  precipCap: number;
  precipMaxW: number;
  precipW: number;
  symbolScale: number;
  symbolSize: number;
  plotPad: number;
  dayLabelY: number;
  dayLabelSize: number;
  hourLabelY: number;
  hourLabelSize: number;
  tempLabelEvery: number;
  windLabelEvery: number;
  symbolEvery: number;
  arrowEvery: number;
  gridEvery: number;
  tempStroke: number;
  windStroke: number;
  laneChipY: [number, number, number];
}

/**
 * Band boundaries for one chart height, plus the precipitation baseline —
 * which is the temperature lane's baseline, since the bars hang off it.
 */
function yrBandsFor(
  spec: YrSpec,
  height: number,
  chrome: { dayLabelSize: number; precipCap: number },
) {
  const bands = resolveYrBands(spec, height);
  return {
    ...bands,
    precipBase: bands.tempBase,
    ...yrHeaderBaselines(bands, chrome.dayLabelSize),
    laneChipY: yrLaneChipY(bands, chrome.precipCap),
  };
}

const YR_COMPACT: YrLayout = {
  colW: 26,
  axisW: 46,
  rightAxisW: 24,
  axisFont: 9.5,
  ...yrBandsFor(YR_SPEC, 262, { dayLabelSize: 13, precipCap: 44 }),
  tempLo: 0,
  tempHi: 10,
  tempTicks: [0, 5, 10],
  windMax: 15,
  windTicks: [5, 10],
  precipPerMm: 22,
  precipCap: 44,
  precipMaxW: 16,
  precipW: 10,
  symbolScale: 0.58,
  symbolSize: 20,
  plotPad: 8,
  dayLabelSize: 13,
  hourLabelSize: 10,
  tempLabelEvery: 0,
  windLabelEvery: 0,
  symbolEvery: 2,
  arrowEvery: 2,
  gridEvery: 2,
  tempStroke: 2.4,
  windStroke: 2.1,
};

const YR_FULLSCREEN: YrLayout = {
  colW: 42,
  axisW: 52,
  rightAxisW: 28,
  axisFont: 11,
  ...yrBandsFor(YR_SPEC, 560, { dayLabelSize: 16, precipCap: 84 }),
  tempLo: 0,
  tempHi: 10,
  tempTicks: [0, 5, 10],
  windMax: 20,
  windTicks: [5, 10, 15, 20],
  precipPerMm: 40,
  precipCap: 84,
  precipMaxW: 18,
  precipW: 12,
  symbolScale: 0.82,
  symbolSize: 26,
  plotPad: 16,
  dayLabelSize: 16,
  hourLabelSize: 11,
  // No inline temp/wind value labels on the lines — every other view (compact
  // desktop, landscape) omits them, so the expanded two-column view matches
  // instead of being the odd one out. Values are read from the scrub readout.
  tempLabelEvery: 0,
  windLabelEvery: 0,
  symbolEvery: 2,
  arrowEvery: 2,
  gridEvery: 1,
  tempStroke: 2.8,
  windStroke: 2.4,
};

export interface YrGeometry {
  width: number;
  count: number;
  cx: (i: number) => number;
  tempY: (v: number) => number;
  windY: (v: number) => number;
  indexAt: (localX: number) => number;
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

function isNightHour(p: HourPoint): boolean {
  const h = p.local.getUTCHours();
  return h < 5 || h >= 22;
}

function dayHeaderLabel(p: HourPoint, t: Labels): string {
  const d = p.local;
  const wd = t.weekdays[d.getUTCDay()];
  const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
  const mon = t.monthsShort[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${cap} ${day} ${mon}`;
}

function nightBands(
  points: HourPoint[],
  L: YrLayout,
): { x: number; w: number }[] {
  const bands: { x: number; w: number }[] = [];
  let start: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const night = isNightHour(points[i]);
    if (night && start === null) start = i;
    if ((!night || i === points.length - 1) && start !== null) {
      const end = night && i === points.length - 1 ? i + 1 : i;
      bands.push({
        x: start * L.colW,
        w: (end - start) * L.colW,
      });
      start = null;
    }
  }
  return bands;
}

/**
 * Nice-step temp domain for the yr axis, thinned to at most `maxLabels`.
 *
 * Two values are never thinned away: the top of the scale, which is the number
 * a reader looks for first (the day's peak sits in the top step nearly every
 * time), and 0°C, which is where water freezes and the one gridline on the
 * chart that means something in itself.
 */
function yrTempScale(
  points: HourPoint[],
  maxLabels: number,
): { lo: number; hi: number; ticks: number[] } {
  const temps = points
    .map((p) => p.tempC)
    .filter((v): v is number => v !== null);
  const all = temperatureTicks(temps);
  const lo = all[0];
  const hi = all[all.length - 1];
  if (all.length <= maxLabels) {
    return { lo, hi, ticks: all };
  }
  // Too many nice ticks: subsample evenly (keep the nice step spacing) rather
  // than linear-interpolating, which produced uneven labels like 8·10·11·13.
  const stride = Math.ceil((all.length - 1) / (maxLabels - 1));
  const kept = new Set<number>();
  for (let i = 0; i < all.length; i += stride) kept.add(all[i]);
  kept.add(hi);
  if (lo < 0 && hi > 0 && all.includes(0)) kept.add(0);
  const ticks = [...kept].sort((a, b) => a - b);
  return { lo, hi, ticks };
}

/**
 * Fill in the data-dependent parts of a layout: the temperature domain and
 * both tick ladders.
 *
 * `displayScale` is how much the chart will be stretched on screen — pass the
 * fit's scale, not 1, whenever the chart is fitted. Tick density is a question
 * about pixels the reader actually sees: choosing it from the base geometry
 * gave a landscape phone scaled to 0.6 the same number of labels as a desktop
 * panel at 1.0, crammed into 60% of the room.
 */
function resolveYrLayout(
  base: YrLayout,
  points: HourPoint[],
  displayScale = 1,
): YrLayout {
  const scale = displayScale > 0 ? displayScale : 1;
  const tempLanePx = (base.tempBase - base.tempTop) * scale;
  const windLanePx = (base.windBase - base.windTop) * scale;
  const { lo, hi, ticks } = yrTempScale(points, maxLabelsFor(tempLanePx));
  return {
    ...base,
    tempLo: lo,
    tempHi: hi,
    tempTicks: ticks,
    // Derived from the shared tick rule rather than hardcoded per layout, so the
    // wind scale reads the same here as on the mobile chart.
    windTicks: windTicksFor(base.windMax, windLanePx),
  };
}

/** Whether two resolved layouts would draw the same ladders in both gutters. */
function sameTicks(a: YrLayout, b: YrLayout): boolean {
  const same = (x: number[], y: number[]): boolean =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  return same(a.tempTicks, b.tempTicks) && same(a.windTicks, b.windTicks);
}

function tempSpan(L: YrLayout): number {
  const span = L.tempHi - L.tempLo;
  return span > 0 ? span : 1;
}

/** Y for wind-direction arrows — dedicated strip below plot or inside wind lane. */
function windArrowY(L: YrLayout): number {
  const tail = L.height - L.plotBottom;
  if (hasArrowStrip(L)) return L.plotBottom + tail / 2;
  return L.windBase - 14;
}

function buildAxisSvg(L: YrLayout): string {
  const ty = (v: number): number =>
    L.tempBase - ((v - L.tempLo) / tempSpan(L)) * (L.tempBase - L.tempTop);
  const wy = (v: number): number =>
    L.windBase - (Math.min(v, L.windMax) / L.windMax) * (L.windBase - L.windTop);
  const parts: string[] = [
    `<rect x="0" y="0" width="${L.axisW}" height="${L.height}" fill="#fff"/>`,
  ];
  const ax = L.axisW - 5;
  for (const v of L.tempTicks) {
    parts.push(
      text(ax, ty(v) + TICK_LABEL_DY, formatTempTick(v), TICK_COLOR, L.axisFont, 700, "end"),
    );
  }
  // Precip shares the temperature baseline, so numeric precip ticks in this
  // gutter would collide with the temp labels. The bars are read relative to
  // the legend + the exact mm in the scrub readout instead.
  for (const v of L.windTicks) {
    parts.push(
      text(ax, wy(v) + TICK_LABEL_DY, formatWindTick(v), TICK_COLOR, L.axisFont, 700, "end"),
    );
  }
  // No rotated "Hiti (°C)" / "Vindur (m/s)" axis titles: they only rendered in
  // the expanded view, making it the odd one out. The lane chips + legend name
  // the series everywhere, so the numeric scale alone is enough here too.
  return `<svg class="yr-axis" width="${L.axisW}" height="${L.height}" viewBox="0 0 ${L.axisW} ${L.height}" style="display:block;flex:none">${parts.join("")}</svg>`;
}

/**
 * Pinned precipitation (mm) scale on the RIGHT of the chart. Precip shares the
 * temperature baseline, so its numeric ticks can't live in the left gutter
 * (they'd collide with the temp labels) — they go here instead, in the precip
 * blue, and stay fixed while the chart scrolls horizontally.
 */
function buildRightAxisSvg(L: YrLayout): string {
  const rightW = L.rightAxisW;
  const ph = (mm: number): number => Math.min(L.precipCap, mm * L.precipPerMm);
  const size = L.axisFont;
  const parts: string[] = [
    `<rect x="0" y="0" width="${rightW}" height="${L.height}" fill="#fff"/>`,
  ];
  for (const mm of precipTicksFor(L.precipCap / L.precipPerMm)) {
    parts.push(
      text(
        5,
        L.precipBase - ph(mm) + TICK_LABEL_DY,
        formatPrecipTick(mm),
        PRECIP_TICK_COLOR,
        size,
        700,
        "start",
      ),
    );
  }
  return `<svg class="yr-axis-right" width="${rightW}" height="${L.height}" viewBox="0 0 ${rightW} ${L.height}" style="display:block;flex:none">${parts.join("")}</svg>`;
}

function buildPlotSvg(
  points: HourPoint[],
  t: Labels,
  scrubIdx: number,
  nowIdx: number,
  anaIdx: number,
  L: YrLayout,
): { svg: string; geo: YrGeometry } {
  const n = points.length;
  const width = n * L.colW + L.plotPad;
  const cx = (i: number): number => i * L.colW + L.colW / 2;
  const ty = (v: number): number =>
    L.tempBase - ((v - L.tempLo) / tempSpan(L)) * (L.tempBase - L.tempTop);
  const wy = (v: number): number =>
    L.windBase - (Math.min(v, L.windMax) / L.windMax) * (L.windBase - L.windTop);
  const ph = (mm: number): number => Math.min(L.precipCap, mm * L.precipPerMm);

  const parts: string[] = [
    `<rect x="0" y="${L.plotTop}" width="${width}" height="${L.plotBottom - L.plotTop}" fill="#FCFDFE"/>`,
  ];

  for (const b of nightBands(points, L)) {
    parts.push(
      `<rect x="${b.x}" y="${L.plotTop}" width="${b.w}" height="${L.plotBottom - L.plotTop}" fill="rgba(90,112,140,0.055)"/>`,
    );
  }

  for (let i = 0; i < n; i += L.gridEvery) {
    parts.push(
      `<line x1="${cx(i)}" x2="${cx(i)}" y1="${L.plotTop}" y2="${L.plotBottom}" stroke="#EEF1F4" stroke-width="1"/>`,
    );
  }

  for (const v of L.tempTicks) {
    parts.push(
      `<line x1="0" x2="${width}" y1="${ty(v)}" y2="${ty(v)}" stroke="#E7EBEE" stroke-width="1"/>`,
    );
  }
  for (const v of L.windTicks) {
    parts.push(
      `<line x1="0" x2="${width}" y1="${wy(v)}" y2="${wy(v)}" stroke="#DCE3E8" stroke-width="1"/>`,
    );
  }
  // Faint dashed precip gridlines (mm) so the right-hand precip scale is readable.
  for (const mm of precipTicksFor(L.precipCap / L.precipPerMm)) {
    const y = L.precipBase - ph(mm);
    parts.push(
      `<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="#CFE0F1" stroke-width="1" stroke-dasharray="2 3"/>`,
    );
  }

  const dayStarts: number[] = [0];
  for (let i = 1; i < n; i++) {
    if (points[i].local.getUTCHours() === 0) dayStarts.push(i);
  }
  for (let k = 0; k < dayStarts.length; k++) {
    const i = dayStarts[k];
    const x = i * L.colW;
    // Solid day divider (skip index 0 — that's the plot's own left edge).
    if (i > 0) {
      parts.push(
        `<line x1="${x}" x2="${x}" y1="${L.dayLabelY - 8}" y2="${L.plotBottom}" stroke="#C2CBD2" stroke-width="1"/>`,
      );
    }
    // Left-anchored header pinned just right of the divider. A day is normally
    // ≥24 columns wide so headers don't collide — but the FIRST (and last) day
    // can be a thin sliver near midnight, where the label would pile onto the
    // next day's ("Mið 15 júl16 júl"). Skip a label when its day's span is too
    // narrow to hold the text (task C1); the divider still marks the boundary.
    const label = dayHeaderLabel(points[i], t);
    const nextStart = k + 1 < dayStarts.length ? dayStarts[k + 1] : n;
    const availPx = (nextStart - i) * L.colW - 10;
    const estTextPx = label.length * L.dayLabelSize * 0.6;
    if (estTextPx <= availPx) {
      parts.push(
        text(x + 8, L.dayLabelY, label, "#14202B", L.dayLabelSize, 900, "start"),
      );
    }
  }

  for (const y of [L.plotTop, L.tempBase, L.windTop, L.plotBottom]) {
    parts.push(`<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="#C2CBD2" stroke-width="1"/>`);
  }

  for (let i = 0; i < n; i++) {
    const pm = points[i].precipMaxMm;
    if (pm > 0) {
      const h = ph(pm);
      parts.push(
        `<rect x="${cx(i) - L.precipMaxW / 2}" y="${L.precipBase - h}" width="${L.precipMaxW}" height="${h}" rx="1.5" fill="#B9D6EF"/>`,
      );
    }
  }
  for (let i = 0; i < n; i++) {
    const mm = points[i].precipMm;
    if (mm > 0) {
      const h = ph(mm);
      parts.push(
        `<rect x="${cx(i) - L.precipW / 2}" y="${L.precipBase - h}" width="${L.precipW}" height="${h}" rx="1.5" fill="#3D82C4"/>`,
      );
    }
  }

  for (let i = 0; i < n; i += L.symbolEvery) {
    const url = symbolUrl(points[i].symbol);
    const temp = points[i].tempC;
    const sy =
      temp === null
        ? L.plotTop + 4
        : Math.max(L.plotTop - 6, ty(temp) - 30);
    if (url) {
      const sz = L.symbolSize;
      parts.push(
        `<image x="${cx(i) - sz / 2}" y="${sy}" width="${sz}" height="${sz}" href="${esc(url)}"/>`,
      );
    }
  }

  parts.push(
    `<path d="${linePath(points, (p) => p.tempC, cx, ty)}" fill="none" stroke="#C81D25" stroke-width="${L.tempStroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  // Dashed gust line, drawn under the wind line — omitted when the dataset has
  // no gust series (task A2).
  if (hasGustSeries(points)) {
    parts.push(
      `<path d="${linePath(points, (p) => p.gustMs, cx, wy)}" fill="none" stroke="#7FB394" stroke-width="1.6" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  parts.push(
    `<path d="${linePath(points, (p) => p.windMs, cx, wy)}" fill="none" stroke="#3E8E63" stroke-width="${L.windStroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Tip-down glyph (points south at rotate(0)), so the meteorological
  // from-direction is the rotation: a wind from 0° blows toward the south.
  const ah = L.colW >= 40 ? 7 : 6;
  const head = L.colW >= 40 ? `M-4 2 L0 7.5 L4 2` : `M-3.5 1.8 L0 6.5 L3.5 1.8`;
  const arrowRow = windArrowY(L);
  for (let i = 0; i < n; i += L.arrowEvery) {
    const dir = points[i].dirDeg;
    if (dir !== null) {
      parts.push(
        `<g transform="translate(${cx(i)} ${arrowRow}) rotate(${((dir % 360) + 360) % 360})">` +
          `<line x1="0" y1="-${ah}" x2="0" y2="${ah}" stroke="#6B7A86" stroke-width="2" stroke-linecap="round"/>` +
          `<path d="${head}" fill="none" stroke="#6B7A86" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
          `</g>`,
      );
    }
  }

  if (L.tempLabelEvery > 0) {
    for (let i = 0; i < n; i += L.tempLabelEvery) {
      const v = points[i].tempC;
      if (v !== null) {
        parts.push(
          text(cx(i), ty(v) - 8, `${Math.round(v)}°`, tempColorYr(Math.round(v)), 11, 800, "middle"),
        );
      }
    }
  }

  if (L.windLabelEvery > 0) {
    for (let i = 1; i < n; i += L.windLabelEvery) {
      const v = points[i].windMs;
      if (v !== null) {
        parts.push(text(cx(i), wy(v) - 9, `${Math.round(v)}`, "#2F7C55", 10.5, 800, "middle"));
      }
    }
  }

  const hourStep = L.gridEvery === 1 ? 1 : 2;
  for (let i = 0; i < n; i += hourStep) {
    const hh = String(points[i].local.getUTCHours()).padStart(2, "0");
    parts.push(text(cx(i), L.hourLabelY, hh, "#6B7A86", L.hourLabelSize, 700, "middle"));
  }

  const anaX = cx(Math.max(0, Math.min(n - 1, anaIdx)));
  const nowX = cx(Math.max(0, Math.min(n - 1, nowIdx)));
  const nowTemp = points[nowIdx]?.tempC ?? null;
  parts.push(
    `<line class="yr-ana" x1="${anaX}" x2="${anaX}" y1="${L.plotTop}" y2="${L.plotBottom}" stroke="#F0A32F" stroke-width="2"/>`,
    `<line class="yr-now" x1="${nowX}" x2="${nowX}" y1="${L.plotTop}" y2="${L.plotBottom}" stroke="#6B7A86" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  );
  if (nowTemp !== null) {
    parts.push(
      `<circle class="yr-now-dot" cx="${nowX}" cy="${ty(nowTemp)}" r="4.5" fill="#C81D25" stroke="#fff" stroke-width="1.5"/>`,
    );
  }

  const si = Math.max(0, Math.min(n - 1, scrubIdx));
  const sx = cx(si);
  const sTemp = points[si]?.tempC ?? null;
  const sWind = points[si]?.windMs ?? null;
  parts.push(
    `<line class="scrub-cursor" x1="${sx}" x2="${sx}" y1="${L.plotTop}" y2="${L.plotBottom}" stroke="#14202B" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.55"/>`,
    `<circle class="scrub-dot-temp" cx="${sx}" cy="${sTemp === null ? 0 : ty(sTemp)}" r="4" fill="#C81D25" stroke="#fff" stroke-width="1.5"${sTemp === null ? ' visibility="hidden"' : ""}/>`,
    `<circle class="scrub-dot-wind" cx="${sx}" cy="${sWind === null ? 0 : wy(sWind)}" r="4" fill="#3E8E63" stroke="#fff" stroke-width="1.5"${sWind === null ? ' visibility="hidden"' : ""}/>`,
  );

  const svg = `<svg class="yr-plot" width="${width}" height="${L.height}" viewBox="0 0 ${width} ${L.height}" style="display:block;touch-action:none;cursor:crosshair" role="img">${parts.join("")}</svg>`;
  const geo: YrGeometry = {
    width,
    count: n,
    cx,
    tempY: ty,
    windY: wy,
    indexAt: (localX) =>
      Math.max(0, Math.min(n - 1, Math.round((localX - L.colW / 2) / L.colW))),
  };
  return { svg, geo };
}

function laneChip(translateY: number, swatch: string, label: string): string {
  return (
    `<div class="lane-chip-wrap yr-lane" style="transform:translateY(${translateY}px)">` +
    `<div class="lane-chip yr-chip"><span class="chip-swatch-${swatch} yr-swatch-${swatch}"></span>${esc(label)}</div></div>`
  );
}

const fsExpandSvg =
  `<svg width="14" height="14" viewBox="0 0 16 16"><path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4" fill="none" stroke="#14202B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const fsCollapseSvg =
  `<svg width="14" height="14" viewBox="0 0 16 16"><path d="M2 6h4V2M14 6h-4V2M6 14v-4H2M10 14v-4h4" fill="none" stroke="#14202B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export interface MapPanelGraphOptions {
  scrubIdx: number;
  nowIdx: number;
  anaIdx: number;
  onScrub: (idx: number) => void;
  onFullscreen?: () => void;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
  /** True when the graph is shown in the expanded panel — flips the toggle
   *  button from an expand to a collapse affordance. */
  expanded?: boolean;
  /** Scale the (tall) chart to fill the available height instead of scrolling
   *  vertically — used by the full-screen landscape layout. */
  fit?: boolean;
  metaLine?: string;
  placeName?: string;
  t: Labels;
}

function wireScrub(
  el: Element,
  geo: YrGeometry,
  getIdx: () => number,
  setIdx: (i: number) => void,
  onScrub: (i: number) => void,
  update: () => void,
  displayScale: () => number = () => 1,
): void {
  const scrubFrom = (e: PointerEvent): void => {
    const rect = el.getBoundingClientRect();
    const scale = displayScale() || 1;
    const i = geo.indexAt((e.clientX - rect.left) / scale);
    if (i !== getIdx()) {
      setIdx(i);
      update();
      onScrub(i);
    }
  };
  el.addEventListener("pointerdown", (e) => {
    try {
      el.setPointerCapture((e as PointerEvent).pointerId);
    } catch {
      /* unsupported */
    }
    scrubFrom(e as PointerEvent);
  });
  el.addEventListener("pointermove", (e) => {
    const pe = e as PointerEvent;
    if (pe.pointerType === "mouse" || pe.buttons > 0) scrubFrom(pe);
  });
}

function scrollToScrub(
  scrollEl: HTMLElement,
  geo: YrGeometry,
  idx: number,
  colW: number,
  displayScale: () => number = () => 1,
): void {
  const scale = displayScale() || 1;
  const x = (idx * colW + colW / 2) * scale;
  scrollEl.scrollLeft = Math.max(0, x - scrollEl.clientWidth / 2);
}

/**
 * Scale a rendered yr chart so its `baseHeight` viewBox fills `availH` px of
 * screen, keeping the scrub geometry intact: the ratio is recorded on the root
 * and read back by the pointer/scroll maths via {@link chartDisplayScale}.
 *
 * Every surface that fits a chart comes through here — the landscape phone and
 * the expanded desktop overlay used to have a function each, which is how the
 * overlay ended up never scaling its right-hand precip axis: that axis kept its
 * unscaled height while the plot beside it stretched, so the mm ticks pointed
 * at the wrong gridlines at every height except exactly 560px.
 */
function fitChart(
  root: HTMLElement,
  baseHeight: number,
  availH: number,
): number {
  const fit = resolveChartFit(baseHeight, availH);
  if (!fit || !root.querySelector(".yr-plot")) {
    return chartDisplayScale(root)();
  }

  root.dataset.chartScale = String(fit.scale);

  for (const selector of CHART_FIT_SELECTORS) {
    const svg = root.querySelector<SVGSVGElement>(selector);
    if (!svg) continue;
    const baseWidth = parseFloat(svg.getAttribute("width") || "0");
    svg.style.height = `${fit.heightPx}px`;
    svg.style.width = `${fittedWidth(baseWidth, fit).toFixed(2)}px`;
  }

  // Sticky lane chips are HTML, positioned against the plot's y-coordinates.
  root.querySelectorAll<HTMLElement>(".yr-lane").forEach((el) => {
    const match = /translateY\(([\d.]+)px\)/.exec(el.style.transform);
    if (match && !el.dataset.laneY) el.dataset.laneY = match[1];
    const base = Number(el.dataset.laneY ?? match?.[1] ?? 0);
    el.style.transform = `translateY(${fittedLaneY(base, fit).toFixed(2)}px)`;
  });

  return fit.scale;
}

/** The scale {@link fitChart} last applied to this chart, or 1 if unfitted. */
function chartDisplayScale(root: HTMLElement): () => number {
  return () => {
    const raw = root.dataset.chartScale;
    const scale = raw ? parseFloat(raw) : 1;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  };
}

/**
 * One rendered chart: the pinned left axis, the scrolling plot and the pinned
 * right axis, in the flex row that keeps them aligned.
 */
export function chartBlock(
  points: HourPoint[],
  t: Labels,
  scrubIdx: number,
  nowIdx: number,
  anaIdx: number,
  L: YrLayout,
  fullscreen: boolean,
  withRail = false,
): string {
  const axis = buildAxisSvg(L);
  const rightAxis = buildRightAxisSvg(L);
  const { svg, geo } = buildPlotSvg(points, t, scrubIdx, nowIdx, anaIdx, L);
  const chips =
    laneChip(L.laneChipY[0], "temp", t.laneTemp) +
    laneChip(L.laneChipY[1], "precip", t.lanePrecip) +
    laneChip(L.laneChipY[2], "wind", t.laneWind);
  // Landscape time scrubber: an invisible drag strip over the top of the plot
  // carrying the aurora dot, plus an HTML cursor line spanning all lanes. The
  // rail width and dot top are kept in sync with the fit-scale by JS.
  const si = Math.max(0, Math.min(points.length - 1, scrubIdx));
  const rail = withRail
    ? `<div class="scrub-rail" role="slider" tabindex="0" aria-label="${esc(t.scrubSlider)}"
         aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="${points.length - 1}"
         aria-valuenow="${si}" style="width:${geo.width}px">
         <div class="scrub-grab" style="left:${((geo.cx(si) / geo.width) * 100).toFixed(2)}%"></div>
       </div>
       <div class="scrub-cursor"></div>`
    : "";
  return `
    <div class="yr-chart${fullscreen ? " yr-chart-fs" : ""}">
      ${axis}
      <div class="yr-scroll">
        ${rail}
        ${chips}
        ${svg}
      </div>
      ${rightAxis}
    </div>`;
}

function legendHtml(t: Labels, metaLine?: string, hasGust = true): string {
  // In landscape the standalone meta footer is hidden; the analysis/last-update
  // line is folded in here (right-aligned) so mobile still shows it without
  // spending a second row.
  const meta = metaLine
    ? `<span class="legend-meta">${esc(metaLine)}</span>`
    : "";
  // Omit the gust key when the dataset has no gust series (A2).
  const gust = hasGust
    ? `<span><span class="swatch-gust"></span>${esc(t.legGust)}</span>`
    : "";
  return `
    <div class="legend yr-legend">
      <span><span class="swatch-temp yr-swatch-temp"></span>${esc(t.legTemp)}</span>
      <span><span class="swatch-precip"></span>${esc(t.legPrecip)}</span>
      <span><span class="swatch-pmax yr-swatch-pmax"></span>${esc(t.legPmax)}</span>
      <span><span class="swatch-wind"></span>${esc(t.legWind)}</span>
      ${gust}
      ${meta}
    </div>`;
}

function readoutHtml(
  points: HourPoint[],
  idx: number,
  t: Labels,
  showFsBtn: boolean,
  expanded = false,
  fit = false,
): string {
  const p = points[idx];
  const temp = p.tempC === null ? "–" : `${Math.round(p.tempC)}°`;
  const tc = p.tempC === null ? "#6B7A86" : tempColorYr(Math.round(p.tempC));
  const url = symbolUrl(p.symbol);
  const icon = url
    ? `<img src="${esc(url)}" width="34" height="34" alt="">`
    : "";
  const fsBtn = showFsBtn
    ? `<button class="yr-fs-btn" type="button" aria-label="${esc(expanded ? t.exitFullscreen : t.fullscreen)}">${expanded ? fsCollapseSvg : fsExpandSvg}</button>`
    : "";
  // Landscape (fit): the readout floats over the chart as a dismissible popup
  // instead of taking a chrome band, so it carries its own minimize + close
  // controls (CSS hides them outside fullscreen). Moving the scrubber re-shows
  // it if it was closed.
  const popupBtns = fit
    ? `<button class="ro-min" type="button" aria-label="${esc(t.minimize)}"></button>
       <button class="ro-close" type="button" aria-label="${esc(t.close)}"></button>`
    : "";
  // The weather symbol sits with the values on the LEFT (task C3), not off on
  // the right next to the expand/popup controls where it read as detached.
  return `
    <div class="readout readout-2a${fit ? " readout-pop" : ""}">
      <div class="readout-main">
        <span class="ro-icon">${icon}</span>
        <div class="readout-text">
          <div class="ro-time">${esc(scrubTimeLabel(p, t))}</div>
          <div class="ro-vals">
            <span class="ro-temp" style="color:${tc}">${temp}</span>
            <span class="ro-precip">${p.precipMm.toFixed(1)} mm</span>
            <span class="ro-wind">
              <span class="ro-wind-text">${esc(windText(p))}</span>
              <span class="ro-arrow">${arrowSvg(p.dirDeg, 13, "#14202B")}</span>
              <span class="ro-compass">${esc(compassLabel(p.dirDeg, t))}</span>
            </span>
          </div>
        </div>
      </div>
      <div class="readout-side">
        ${fsBtn}
        ${popupBtns}
      </div>
    </div>`;
}

/** Render the map-panel 2a compact yr-style meteogram into `host`. */
export function renderMapPanelGraph(
  host: HTMLElement,
  points: HourPoint[],
  opts: MapPanelGraphOptions,
): { setScrubIdx: (i: number) => void } {
  // Expanded panel uses the taller fullscreen layout so the graph fills the
  // extra vertical room; the docked card uses the compact one.
  const fs = opts.expanded ?? false;
  const base = fs ? YR_FULLSCREEN : YR_COMPACT;

  const paint = (displayScale: number): YrLayout => {
    const resolved = resolveYrLayout(base, points, displayScale);
    host.innerHTML = `
    <div class="graph-bare graph-yr">
      ${readoutHtml(points, Math.max(0, Math.min(points.length - 1, opts.scrubIdx)), opts.t, true, fs, opts.fit ?? false)}
      <div class="yr-chart-fit">
        ${chartBlock(points, opts.t, opts.scrubIdx, opts.nowIdx, opts.anaIdx, resolved, fs, opts.fit ?? false)}
      </div>
      ${legendHtml(opts.t, opts.metaLine, hasGustSeries(points))}
    </div>`;
    return resolved;
  };

  // A fitted chart has to be measured before its tick density can be chosen,
  // and it has to be in the document to be measured. So paint once at 1:1, ask
  // the box how tall it is, and repaint only if the ticks the reader would
  // actually see differ — otherwise a landscape phone scaled to 0.6 carries a
  // desktop's worth of labels in 60% of the room.
  let L = paint(1);
  if (opts.fit) {
    const box = host.querySelector<HTMLElement>(".yr-chart-fit");
    const fit = box ? resolveChartFit(L.height, box.clientHeight) : null;
    if (fit) {
      const scaled = resolveYrLayout(base, points, fit.scale);
      if (!sameTicks(scaled, L)) L = paint(fit.scale);
    }
  }

  let idx = Math.max(0, Math.min(points.length - 1, opts.scrubIdx));
  const plot = host.querySelector<SVGSVGElement>(".yr-plot")!;
  const scroll = host.querySelector<HTMLElement>(".yr-scroll")!;
  const fitEl = host.querySelector<HTMLElement>(".yr-chart-fit");
  const scaleFn = opts.fit ? chartDisplayScale(host) : (): number => 1;
  // Landscape scrubber overlay (present only when opts.fit renders the rail).
  const rail = host.querySelector<HTMLElement>(".scrub-rail");
  const grab = host.querySelector<HTMLElement>(".scrub-grab");
  const railCursor = host.querySelector<HTMLElement>(".yr-scroll > .scrub-cursor");
  // Landscape floating scrub-readout popup (present only when opts.fit).
  const readoutPop = host.querySelector<HTMLElement>(".readout-pop");
  const applyFit = (): void => {
    if (!opts.fit || !fitEl) return;
    fitChart(host, L.height, fitEl.clientHeight);
    // Rail mirrors the plot's scaled width; the dot rides the plot-area top
    // edge (y = plotTop·s, minus half the 11px dot).
    if (rail && plot.style.width) {
      const s = scaleFn();
      rail.style.width = plot.style.width;
      // The rail is the scrub zone: size it to the day-header + hour-tick band
      // (everything above the plot lines) so tapping/dragging the hours scrubs,
      // while the plot body below stays free to pan horizontally.
      rail.style.height = `${Math.round(L.plotTop * s)}px`;
      if (grab) grab.style.top = `${Math.round(L.plotTop * s - 5.5)}px`;
      if (railCursor) railCursor.style.left = `${geo.cx(idx) * s}px`;
    }
  };
  const { geo } = buildPlotSvg(
    points,
    opts.t,
    idx,
    opts.nowIdx,
    opts.anaIdx,
    L,
  );

  const q = <T extends Element>(sel: string): T => host.querySelector(sel) as T;
  const update = (): void => {
    const p = points[idx];
    const x = geo.cx(idx);
    // Scoped to the plot: the landscape scrubber adds an HTML .scrub-cursor
    // sibling inside .yr-scroll that must not shadow this SVG line.
    q<SVGLineElement>(".yr-plot .scrub-cursor").setAttribute("x1", `${x}`);
    q<SVGLineElement>(".yr-plot .scrub-cursor").setAttribute("x2", `${x}`);
    const dotTemp = q<SVGCircleElement>(".scrub-dot-temp");
    dotTemp.setAttribute("cx", `${x}`);
    dotTemp.setAttribute("visibility", p.tempC === null ? "hidden" : "visible");
    if (p.tempC !== null) dotTemp.setAttribute("cy", `${geo.tempY(p.tempC)}`);
    const dotWind = q<SVGCircleElement>(".scrub-dot-wind");
    dotWind.setAttribute("cx", `${x}`);
    dotWind.setAttribute("visibility", p.windMs === null ? "hidden" : "visible");
    if (p.windMs !== null) dotWind.setAttribute("cy", `${geo.windY(p.windMs)}`);

    q<HTMLElement>(".ro-time").textContent = scrubTimeLabel(p, opts.t);
    const tempEl = q<HTMLElement>(".ro-temp");
    tempEl.textContent = p.tempC === null ? "–" : `${Math.round(p.tempC)}°`;
    tempEl.style.color =
      p.tempC === null ? "#6B7A86" : tempColorYr(Math.round(p.tempC));
    q<HTMLElement>(".ro-precip").textContent = `${p.precipMm.toFixed(1)} mm`;
    q<HTMLElement>(".ro-wind-text").textContent = windText(p);
    q<HTMLElement>(".ro-arrow").innerHTML = arrowSvg(p.dirDeg, 13, "#14202B");
    q<HTMLElement>(".ro-compass").textContent = compassLabel(p.dirDeg, opts.t);
    const url = symbolUrl(p.symbol);
    q<HTMLElement>(".ro-icon").innerHTML = url
      ? `<img src="${esc(url)}" width="34" height="34" alt="">`
      : "";

    // Landscape scrubber: dot + HTML cursor line + slider a11y state.
    if (grab) grab.style.left = `${((x / geo.width) * 100).toFixed(2)}%`;
    if (railCursor) railCursor.style.left = `${x * scaleFn()}px`;
    if (rail) {
      rail.setAttribute("aria-valuenow", String(idx));
      rail.setAttribute("aria-valuetext", scrubTimeLabel(p, opts.t));
    }
    // Moving the scrubber brings the popup back if the user had closed it.
    readoutPop?.classList.remove("is-closed");
  };

  // Wire the landscape popup's minimize + close controls.
  if (readoutPop) {
    const minBtn = host.querySelector<HTMLElement>(".ro-min");
    minBtn?.addEventListener("click", () => {
      const min = readoutPop.classList.toggle("is-min");
      minBtn.setAttribute("aria-label", min ? opts.t.expand : opts.t.minimize);
    });
    host
      .querySelector<HTMLElement>(".ro-close")
      ?.addEventListener("click", () => readoutPop.classList.add("is-closed"));

    // Draggable: reposition the popup anywhere over the chart. Grabbing anywhere
    // but the buttons starts a drag; the position is clamped to the graph area
    // (its offsetParent, .graph-yr). Position is per-render — a rotate/day/lang
    // change re-lays it out at the default top-right, which is fine.
    let drag: { sx: number; sy: number; ox: number; oy: number } | null = null;
    readoutPop.addEventListener("pointerdown", (e) => {
      const pe = e as PointerEvent;
      if ((pe.target as HTMLElement).closest(".ro-min, .ro-close")) return;
      drag = {
        sx: pe.clientX,
        sy: pe.clientY,
        ox: readoutPop.offsetLeft,
        oy: readoutPop.offsetTop,
      };
      // Switch from the default right-anchor to explicit left/top before moving.
      readoutPop.style.left = `${readoutPop.offsetLeft}px`;
      readoutPop.style.top = `${readoutPop.offsetTop}px`;
      readoutPop.style.right = "auto";
      readoutPop.classList.add("is-dragging");
      try {
        readoutPop.setPointerCapture(pe.pointerId);
      } catch {
        /* unsupported */
      }
      pe.preventDefault();
    });
    readoutPop.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const pe = e as PointerEvent;
      const par = readoutPop.offsetParent as HTMLElement | null;
      const maxX = (par?.clientWidth ?? 0) - readoutPop.offsetWidth;
      const maxY = (par?.clientHeight ?? 0) - readoutPop.offsetHeight;
      const nx = Math.max(0, Math.min(maxX, drag.ox + (pe.clientX - drag.sx)));
      const ny = Math.max(0, Math.min(maxY, drag.oy + (pe.clientY - drag.sy)));
      readoutPop.style.left = `${nx}px`;
      readoutPop.style.top = `${ny}px`;
    });
    const endDrag = (): void => {
      drag = null;
      readoutPop.classList.remove("is-dragging");
    };
    readoutPop.addEventListener("pointerup", endDrag);
    readoutPop.addEventListener("pointercancel", endDrag);
  }

  // Non-fit (desktop): scrub by pointing anywhere on the plot — there's no
  // horizontal scroll to conflict with. Fit (landscape): the plot is wider than
  // the sheet and scrolls horizontally, so scrubbing on the plot would hijack
  // every drag. There we scrub ONLY via the top rail (the hour row), leaving the
  // plot body free to pan. See the `if (rail)` block below.
  if (!opts.fit) {
    wireScrub(
      plot,
      geo,
      () => idx,
      (i) => {
        idx = i;
      },
      opts.onScrub,
      update,
      scaleFn,
    );
  } else {
    // buildPlotSvg hard-codes `touch-action:none` on the <svg> (it was the
    // desktop scrub surface). In landscape the plot must pan horizontally
    // instead, so a touch drag reaches the .yr-scroll container — override it to
    // pan-x. Without this the graph is stuck even though it overflows.
    plot.style.touchAction = "pan-x";
  }
  if (rail) {
    // The rail is a second input into the same scrub state as the plot — it
    // spans exactly the plot's width, so the same geometry mapping applies.
    wireScrub(
      rail,
      geo,
      () => idx,
      (i) => {
        idx = i;
      },
      opts.onScrub,
      update,
      scaleFn,
    );
    rail.addEventListener("keydown", (e) => {
      const jumps: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        PageDown: -24,
        PageUp: 24,
      };
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? points.length - 1
            : e.key in jumps
              ? idx + jumps[e.key]
              : null;
      if (next === null) return;
      e.preventDefault();
      // The widget's document-level keydown handler also scrubs on ←/→;
      // handled keys stop here so a rail-focused arrow press moves one hour,
      // not two.
      e.stopPropagation();
      const clamped = Math.max(0, Math.min(points.length - 1, next));
      if (clamped === idx) return;
      idx = clamped;
      update();
      scrollToScrub(scroll, geo, idx, L.colW, scaleFn);
      opts.onScrub(idx);
    });
  }
  applyFit();
  scrollToScrub(scroll, geo, idx, L.colW, scaleFn);
  update();
  host.querySelector(".yr-fs-btn")?.addEventListener("click", () => opts.onFullscreen?.());

  // Landscape: re-fit the chart to the height the layout gives it, and on every
  // rotation / viewport change (the observed element is the chart's flex box).
  if (opts.fit && fitEl && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      applyFit();
      scrollToScrub(scroll, geo, idx, L.colW, scaleFn);
    });
    ro.observe(fitEl);
  }

  return {
    setScrubIdx: (i: number) => {
      idx = Math.max(0, Math.min(points.length - 1, i));
      update();
      scrollToScrub(scroll, geo, idx, L.colW, scaleFn);
    },
  };
}
