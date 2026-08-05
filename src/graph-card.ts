import type { Labels } from "./i18n";
import {
  buildMeteogram,
  esc,
  hasGustSeries,
  LAYOUT_COMPACT,
  LAYOUT_FULL,
  tempColor,
} from "./render";
import { symbolUrl } from "./symbols";
import type { HourPoint } from "./types";

/**
 * The meteogram card from the handoff's Graph view: header, pinned scrub
 * readout, horizontally scrolling lanes with the time cursor, and legend.
 * Shared by the graph-only widget, the full landing mode and the sheet.
 */

/**
 * Wind direction arrow, pointing to where the wind blows toward (the
 * meteorological convention: `dirDeg` is the direction the wind comes *from*).
 * The glyph is drawn tip-down, i.e. already pointing south = "away from north",
 * so a wind from 0° needs no rotation at all — rotating by `dir + 180°` (as this
 * did) flipped every arrow back to point at where the wind came from.
 */
export function arrowSvg(
  dirDeg: number | null,
  size: number,
  color: string,
): string {
  if (dirDeg === null) return "";
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="flex:none;transform:rotate(${((dirDeg % 360) + 360) % 360}deg)">` +
    `<g stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<line x1="10" y1="3.5" x2="10" y2="15"/><path d="M5.5 11 L10 16 L14.5 11"/></g></svg>`
  );
}

/** 8-point compass label for the meteorological (from) direction */
export function compassLabel(dirDeg: number | null, t: Labels): string {
  if (dirDeg === null) return "";
  return t.compass[Math.round((((dirDeg % 360) + 360) % 360) / 45) % 8];
}

/** "6 (11)" — wind speed with gust in parens */
export function windText(p: HourPoint): string {
  if (p.windMs === null) return "–";
  const w = Math.round(p.windMs);
  return p.gustMs === null ? `${w}` : `${w} (${Math.round(p.gustMs)})`;
}

/** "Mið. 8. júlí · 13:00" */
export function scrubTimeLabel(p: HourPoint, t: Labels): string {
  const d = p.local;
  const wd = t.weekdays[d.getUTCDay()];
  const date = t.dateLabel(d.getUTCDate(), t.months[d.getUTCMonth()]);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${date} · ${hh}:00`;
}

/** Hours per timestep — some forecasts (e.g. long term) step 3 h or 6 h */
export function timestepHours(points: HourPoint[]): number {
  if (points.length < 2) return 1;
  return Math.max(1, Math.round((points[1].utcMs - points[0].utcMs) / 3_600_000));
}

/** Index of the hour closest to "now"; 0 when the series is in the future */
export function nowIndex(points: HourPoint[]): number {
  const now = Date.now();
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].utcMs - now);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function laneChip(translateY: number, swatch: string, label: string): string {
  return (
    `<div class="lane-chip-wrap" style="transform:translateY(${translateY}px)">` +
    `<div class="lane-chip"><span class="chip-swatch-${swatch}"></span>${esc(label)}</div></div>`
  );
}

/**
 * Render the full graph card into `host` and wire the scrubber.
 * Mouse hover anywhere over the SVG moves the cursor; on touch only the
 * strip around the track scrubs (the rest of the chart scrolls).
 */
export function renderGraphCard(
  host: HTMLElement,
  points: HourPoint[],
  t: Labels,
  initialIdx: number,
  onScrub?: (idx: number) => void,
  opts: { bare?: boolean; compact?: boolean } = {},
): void {
  let idx = Math.max(0, Math.min(points.length - 1, initialIdx));
  const { svg, axisSvg, rightAxisSvg, geo } = buildMeteogram(
    points,
    t,
    idx,
    opts.compact ? LAYOUT_COMPACT : LAYOUT_FULL,
  );
  const roIcon = opts.compact ? 34 : 38;

  // In `bare` mode (the desktop detail panel) the enclosing panel supplies the
  // white card and the title/toggle header, so we render only the readout,
  // scrolling chart and legend.
  const head =
    opts.bare || opts.compact
      ? ""
      : `<div class="head">
        <div class="title">${esc(t.nextHours(points.length * timestepHours(points)))}</div>
        <div class="hint">${esc(t.swipe)}</div>
      </div>`;
  const wrapClass = opts.compact
    ? "graph-bare graph-compact"
    : opts.bare
      ? "graph-bare"
      : "card";
  const open =
    opts.bare || opts.compact ? `<div class="${wrapClass}">` : `<div class="card">${head}`;

  // The compact (map-panel 1b) chart drops the sticky lane chips and the
  // max-precip legend item.
  const laneChips = opts.compact
    ? ""
    : `${laneChip(46, "temp", t.laneTemp)}
        ${laneChip(158, "precip", t.lanePrecip)}
        ${laneChip(244, "wind", t.laneWind)}`;
  const pmaxLegend = opts.compact
    ? ""
    : `<span><span class="swatch-pmax"></span>${esc(t.legPmax)}</span>`;
  // Omit the gust key when the dataset has no gust series (A2).
  const gustLegend = hasGustSeries(points)
    ? `<span><span class="swatch-gust"></span>${esc(t.legGust)}</span>`
    : "";

  host.innerHTML = `
    ${open}
      <div class="readout">
        <div>
          <div class="ro-time"></div>
          <div class="ro-vals">
            <span class="ro-temp"></span>
            <span class="ro-precip"></span>
            <span class="ro-wind"><span class="ro-wind-text"></span><span class="ro-arrow"></span><span class="ro-compass"></span></span>
          </div>
        </div>
        <span class="ro-icon"></span>
      </div>
      <div class="mg-chart">
        ${axisSvg}
        <div class="scroll">
          ${laneChips}
          ${svg}
        </div>
        ${rightAxisSvg}
      </div>
      <div class="legend">
        <span><span class="swatch-temp"></span>${esc(t.legTemp)}</span>
        <span><span class="swatch-precip"></span>${esc(t.legPrecip)}</span>
        ${pmaxLegend}
        <span><span class="swatch-wind"></span>${esc(t.legWind)}</span>
        ${gustLegend}
      </div>
    </div>`;

  // Must target the plot explicitly: the pinned axis strips are SVGs too, and a
  // bare "svg" selector would match the left strip and break the scrub math.
  const svgEl = host.querySelector<SVGSVGElement>(".mg-plot")!;
  const q = <T extends Element>(sel: string): T => host.querySelector(sel) as T;

  const update = (): void => {
    const p = points[idx];
    const x = geo.cx(idx);

    const cursor = q<SVGLineElement>(".scrub-cursor");
    cursor.setAttribute("x1", `${x}`);
    cursor.setAttribute("x2", `${x}`);
    q<SVGCircleElement>(".scrub-handle").setAttribute("cx", `${x}`);

    const dotTemp = q<SVGCircleElement>(".scrub-dot-temp");
    dotTemp.setAttribute("cx", `${x}`);
    dotTemp.setAttribute("visibility", p.tempC === null ? "hidden" : "visible");
    if (p.tempC !== null) dotTemp.setAttribute("cy", `${geo.tempY(p.tempC)}`);

    const dotWind = q<SVGCircleElement>(".scrub-dot-wind");
    dotWind.setAttribute("cx", `${x}`);
    dotWind.setAttribute("visibility", p.windMs === null ? "hidden" : "visible");
    if (p.windMs !== null) dotWind.setAttribute("cy", `${geo.windY(p.windMs)}`);

    q<HTMLElement>(".ro-time").textContent = scrubTimeLabel(p, t);
    const temp = q<HTMLElement>(".ro-temp");
    temp.textContent = p.tempC === null ? "–" : `${Math.round(p.tempC)}°`;
    temp.style.color = p.tempC === null ? "#5E7E99" : tempColor(Math.round(p.tempC));
    q<HTMLElement>(".ro-precip").textContent = `${p.precipMm.toFixed(1)} mm`;
    q<HTMLElement>(".ro-wind-text").textContent = windText(p);
    q<HTMLElement>(".ro-arrow").innerHTML = arrowSvg(p.dirDeg, 14, "#16324A");
    q<HTMLElement>(".ro-compass").textContent = compassLabel(p.dirDeg, t);
    const url = symbolUrl(p.symbol);
    q<HTMLElement>(".ro-icon").innerHTML = url
      ? `<img src="${esc(url)}" width="${roIcon}" height="${roIcon}" alt="">`
      : "";
  };
  update();

  const scrubFrom = (e: PointerEvent): void => {
    const rect = svgEl.getBoundingClientRect();
    const i = geo.indexAt(e.clientX - rect.left);
    if (i !== idx) {
      idx = i;
      update();
      onScrub?.(i);
    }
  };

  // Mouse: any hover/press over the SVG moves the cursor
  svgEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") scrubFrom(e);
  });
  svgEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") scrubFrom(e);
  });

  // Touch: only the strip around the track accepts drags
  const hit = host.querySelector(".scrub-hit") as SVGRectElement;
  hit.addEventListener("pointerdown", (e) => {
    try {
      hit.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
    scrubFrom(e);
  });
  hit.addEventListener("pointermove", (e) => {
    if (e.buttons > 0) scrubFrom(e);
  });
}
