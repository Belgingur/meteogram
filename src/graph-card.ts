import type { Labels } from "./i18n";
import {
  buildMeteogram,
  esc,
  hasGustSeries,
  LAYOUT_COMPACT,
  LAYOUT_FULL,
  tempColor,
  wireTapToScrub,
} from "./render";
import { symbolUrl } from "./symbols";
import type { HourPoint } from "./types";

/**
 * The meteogram card for the Graph view: header, pinned scrub
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

/**
 * How much already-elapsed forecast the card opens with, in columns, when it
 * anchors the cursor. Enough to show that the past is there (and that it can be
 * scrolled back to); little enough that the visible width is forecast.
 */
const CURSOR_LEAD_COLUMNS = 1.5;

/** Gap left between a lane chip's right edge and the cursor it must not cover. */
const CHIP_CLEARANCE_GAP = 10;
/** Left inset the chips are pinned at (`.lane-chip-wrap { left: 4px }`). */
const CHIP_LEFT_INSET = 4;

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

/**
 * Column of `points` standing for the instant `utcMs`, or -1 for "no such hour
 * here". This is the safe way to carry a scrub across anything that rebuilds the
 * series — a reload, a model switch, a new location, another view with its own
 * window — since a column index only means something next to the window it was
 * measured in.
 *
 * It declines in two cases. If that timestep has already finished, the hour is
 * history and restoring it would reopen the widget in the past. If the closest
 * column is more than half a step away, the instant is not really in this series
 * (a shorter forecast, a coarser model, a later day) and snapping to the nearest
 * edge would quietly show an unrelated hour.
 */
export function indexAtInstant(
  points: HourPoint[],
  utcMs: number,
  nowMs: number = Date.now(),
): number {
  if (!points.length) return -1;
  const stepMs = timestepHours(points) * 3_600_000;
  if (utcMs + stepMs <= nowMs) return -1;

  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].utcMs - utcMs);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return bd <= stepMs / 2 ? best : -1;
}

function laneChip(translateY: number, swatch: string, label: string): string {
  return (
    `<div class="lane-chip-wrap" style="transform:translateY(${translateY}px)">` +
    `<div class="lane-chip"><span class="chip-swatch-${swatch}"></span>${esc(label)}</div></div>`
  );
}

/**
 * Render the full graph card into `host` and wire the scrubber.
 *
 * Mouse hover anywhere over the SVG moves the cursor. On touch, a tap anywhere
 * on the plot picks that hour and a drag along the strip around the track
 * scrubs continuously; dragging elsewhere pans the chart, which is several
 * screens wide.
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
  const layout = opts.compact ? LAYOUT_COMPACT : LAYOUT_FULL;
  const { svg, axisSvg, rightAxisSvg, geo } = buildMeteogram(points, t, idx, layout);
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

  // Bring the cursor's hour into view. `points` can start at the forecast's
  // ANALYSIS time, which is already hours old when a browser loads it, so the
  // plot's left edge is the past and the cursor (placed at "now" by the caller)
  // sits off to the right: without this the card opens on stale hours while the
  // readout describes a column nobody can see.
  //
  // Deliberately NOT the desktop panel's centring (scrollToScrub in
  // map-panel-graph.ts): that view is wide enough to spare half of itself for the
  // past, this one is not. A 360px phone gives the scroller ~9 columns, so
  // centring would open on ~4h of history against ~4h of forecast. Anchoring the
  // cursor a lead-in from the left keeps the past reachable by scrolling back
  // while spending the card on what the card is for.
  const scroller = host.querySelector<HTMLElement>(".scroll")!;
  let anchored = false;
  const anchorCursor = (): void => {
    if (anchored) return;
    // Needs measured layout. clientWidth is 0 until the card has a laid-out box
    // (webfont still loading, a display:none parent, a sheet mid-animation), and
    // measuring 0 would latch a meaningless offset.
    const view = scroller.clientWidth;
    if (!view) return;
    // The lead-in has to clear the sticky lane chips, not just look like a
    // lead-in: they are pinned to the scroller's left edge and sit ON TOP of the
    // plot, so any column inside their width is a column whose value label the
    // reader cannot read — and the cursor's column is the one they came for.
    // Measured rather than assumed, because the chips are HTML and their width
    // is whatever the translated label needs ("Úrkoma" is wider than "Rain").
    let chipW = 0;
    host.querySelectorAll<HTMLElement>(".lane-chip").forEach((el) => {
      chipW = Math.max(chipW, el.getBoundingClientRect().width);
    });
    const lead = Math.max(
      CURSOR_LEAD_COLUMNS * layout.colW,
      chipW ? CHIP_LEFT_INSET + chipW + CHIP_CLEARANCE_GAP : 0,
    );
    scroller.scrollLeft = Math.max(0, geo.cx(idx) - lead);
    anchored = true;
  };
  anchorCursor();
  if (!anchored && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(anchorCursor);
    // Still nothing to measure next frame: position once the box first gets a
    // width, then stop watching. Deliberately one-shot — a later resize must not
    // yank the view back to "now" from wherever the user has scrolled to.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        anchorCursor();
        if (anchored) ro.disconnect();
      });
      ro.observe(scroller);
    }
  }

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

  // Touch: a TAP anywhere on the plot picks that hour.
  //
  // Dragging still has to pan the chart — it is several screens wide — so the
  // plot cannot simply become a scrub surface. But that left the drag strip
  // around the track as the only way in: a 30px band with no affordance, found
  // only by accident, asking for precision from exactly the readers least able
  // to give it. A tap costs the pan nothing (a pan is a drag) and makes the
  // obvious gesture — touching the hour you want — work.
  wireTapToScrub(svgEl, scrubFrom);

  // …and dragging along the strip around the track still scrubs continuously.
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
