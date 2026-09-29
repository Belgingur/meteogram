/**
 * Component styles.
 *
 * Type:  Nunito throughout (weights 700/800/900), loaded document-level in
 *        bel-meteogram.ts.
 * Color: tokens below — basalt ink, glacier frost surface, muted slate haze,
 *        hairline, and a single deep aurora-teal accent used only on selected /
 *        focus / wind. Data-encoding colors (temperature, precipitation, wind)
 *        come from DATA_COLORS, the one palette the SVG charts read too — the
 *        same reading must not change colour between the phone and the panel.
 */
import { DATA_COLORS } from "./colors";

export const componentStyles = `
:host {
  --ink: #14202B;
  --haze: #6B7A86;
  --haze-2: #94A2AC;
  --frost: #E9EEF1;
  --paper: #FCFDFE;
  --tint: #EDF1F4;
  --line: #DCE3E8;
  --line-soft: #EAEEF1;
  --aurora: #1E8E6B;
  --aurora-haze: rgba(30, 142, 107, 0.10);

  display: block;
  font-family: 'Nunito', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--ink);
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* Host fills the map overlay but must not eat clicks — only .page.wide does. */
  pointer-events: none;
}
.bel-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
* { box-sizing: border-box; }

/* Visible keyboard focus (quality floor) */
button:focus-visible,
input:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--aurora);
  outline-offset: 2px;
}

.card {
  background: var(--paper);
  border-radius: 20px;
  padding: 16px 0 6px;
  box-shadow: 0 1px 2px rgba(20, 32, 43, 0.06);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 16px 8px;
}
.title { font-size: 15px; font-weight: 900; color: var(--ink); }
.hint { font-size: 11px; font-weight: 700; color: var(--haze-2); }

/* Chart row: pinned left axis · scrolling plot · pinned right axis. Only the
   middle column scrolls, so both value scales stay put at every scroll offset
   (same structure as the desktop .chart). */
.mg-chart {
  display: flex;
  align-items: flex-start;
}
/* Reserved columns, never squeezed by the plot. Inert on purpose: a press or
   hover that lands on a tick label must fall through to the card, not read as a
   scrub or block the sheet drag. */
.mg-axis,
.mg-axis-right {
  flex: none;
  pointer-events: none;
}
.scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  /* min-width:0 lets the plot column actually shrink inside the flex row
     instead of forcing .mg-chart wider than the card at 320px. */
  flex: 1;
  min-width: 0;
}
/* Labels must never steal pointer events from the scrub strip */
.scroll svg text { pointer-events: none; }

/* Scrub readout — pinned above the chart, always visible (v3) */
.readout {
  margin: 0 16px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--tint);
  border-radius: 14px;
  padding: 9px 14px;
}
.ro-time { font-size: 11px; font-weight: 800; color: var(--haze); }
.ro-vals {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 2px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.ro-temp { font-size: 19px; font-weight: 900; }
.ro-precip { font-size: 13px; font-weight: 800; color: ${DATA_COLORS.precip}; }
.ro-wind {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
}
.ro-icon { flex: none; display: flex; }

/* Pinned lane chips: zero-height sticky wrappers before the SVG keep lane
   identity visible while scrolling. The left axis is now a reserved column
   outside this scroller, so the chips no longer need to clear a gutter. */
.lane-chip-wrap {
  position: sticky;
  left: 4px;
  width: max-content;
  height: 0;
  z-index: 2;
}
.lane-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(252, 253, 254, 0.92);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 800;
  color: var(--haze);
}
.chip-swatch-temp { width: 10px; height: 2.5px; background: ${DATA_COLORS.temp}; border-radius: 2px; }
.chip-swatch-precip { width: 7px; height: 9px; background: ${DATA_COLORS.precip}; border-radius: 2px; }
.chip-swatch-wind { width: 10px; height: 2.5px; background: ${DATA_COLORS.wind}; border-radius: 2px; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 10px 16px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--haze);
}
.legend span { display: flex; align-items: center; gap: 5px; }
.swatch-temp { width: 14px; height: 2.5px; background: ${DATA_COLORS.temp}; border-radius: 2px; }
.swatch-precip { width: 8px; height: 10px; background: ${DATA_COLORS.precip}; border-radius: 2px; }
.swatch-pmax { width: 8px; height: 10px; background: ${DATA_COLORS.precipMax}; border-radius: 2px; }
.swatch-wind { width: 14px; height: 2.5px; background: ${DATA_COLORS.wind}; border-radius: 2px; }
.swatch-gust { width: 14px; height: 0; border-top: 2.5px dashed ${DATA_COLORS.gust}; }

/* Loading skeleton (graph-only mode) */
.skeleton {
  height: 358px;
  margin: 0 16px;
  border-radius: 14px;
  background: linear-gradient(90deg, #E4EAEE 25%, #EFF2F5 50%, #E4EAEE 75%);
  background-size: 200% 100%;
  animation: bel-shimmer 1.4s infinite;
}
.loading-label {
  padding: 10px 16px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--haze);
}
@keyframes bel-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton, .sk { animation: none; }
  .page-close, .tab { transition: none; }
}

/* Error + retry */
.error {
  padding: 28px 16px 22px;
  text-align: center;
}
.error-msg { font-size: 14px; font-weight: 700; color: var(--haze); margin-bottom: 12px; }
.retry {
  border: none;
  border-radius: 13px;
  padding: 12px 22px;
  min-height: 44px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  color: #ffffff;
  background: var(--ink);
  cursor: pointer;
}

/* ===================================================================== */
/* Full landing mode (mode="full")                                        */
/*                                                                        */
/* The layout is switched in JS at a 900px viewport breakpoint: the       */
/* component adds .wide or .narrow to .page.                              */
/*   .narrow — the mobile sheet.                    */
/*   .wide   — map panel: draggable panel over the map                 */
/* ===================================================================== */
.page {
  position: relative;
  margin: 0 auto;
  background: var(--bel-meteogram-bg, var(--frost));
  border-radius: var(--bel-meteogram-radius, 0);
  -webkit-backdrop-filter: var(--bel-meteogram-backdrop, none);
  backdrop-filter: var(--bel-meteogram-backdrop, none);
  display: flex;
  flex-direction: column;
  color: var(--ink);
}
.page.narrow {
  max-width: var(--bel-meteogram-max-width, 430px);
  pointer-events: auto;
}
/* Map panel: draggable floating panel (440 px) over the map host. */
.page.wide {
  position: absolute;
  /* width/height are set inline by panelStyleAttr() (resize grip). These are
     fallbacks only; no max-* caps, or they would clamp the inline size. */
  width: var(--bel-meteogram-panel-width, 440px);
  height: min(840px, calc(100% - 36px));
  overflow: hidden;
  pointer-events: auto;
  background: var(--bel-meteogram-bg, rgba(252, 253, 254, 0.95));
  border-radius: var(--bel-meteogram-radius, 22px);
  -webkit-backdrop-filter: var(--bel-meteogram-backdrop, blur(10px));
  backdrop-filter: var(--bel-meteogram-backdrop, blur(10px));
  box-shadow: 0 14px 44px rgba(13, 30, 45, 0.30);
}
.page.wide-2a .panel-drag {
  cursor: grab;
  touch-action: none;
  user-select: none;
  gap: 8px;
  padding: 12px 14px 8px;
  justify-content: flex-start;
}
.page.wide-2a .panel-pill {
  flex: 1;
  min-width: 0;
  max-width: none;
}

/* ── Full-screen landscape (phone/tablet held horizontally) ──────────────────
   A short landscape phone can't fit two columns, so the widget fills the modal
   edge-to-edge and shows ONE view at a time with a Table/Graph toggle:
     · Graph → the meteogram fills the whole sheet (full width, fit-scaled height).
     · Table → weather-now card + day chips + hourly table in one scroll column.
   Pinned, not draggable (drag grip inert, resize grip removed). No font-size
   changes — only layout, padding and what chrome is shown. */
.page.wide.is-fullscreen {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  max-width: none;
  border-radius: 0;
  box-shadow: none;
  background: var(--bel-meteogram-bg, var(--frost));
}
.is-fullscreen .panel-drag { cursor: default; }
.is-fullscreen .panel-resize { display: none; }
.is-fullscreen .chart-fs-btn { display: none; }
/* The legend + meta footer would each eat a row of the short viewport; the
   in-chart lane chips (Hiti/Úrkoma/Vindur) and scrub readout already cover them. */
/* Landscape shows a slim single-row key below the graph (temp / precip / wind /
   gust — the dashed gust line has no in-chart chip otherwise), with the
   analysis + last-update line folded in on the right (.legend-meta). The
   standalone meta footer stays hidden — this row carries it. */
.is-fullscreen .chart-legend {
  display: flex;
  flex: none;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 12px;
  padding: 3px 12px;
  font-size: 10px;
}
/* The analysis + last-update line is folded into the legend row (right-aligned)
   on BOTH desktop and landscape, replacing the standalone meta footer in graph
   view (hidden below). On the narrow desktop panel it simply wraps to its own
   line at the bottom of the legend. */
.chart-legend .legend-meta {
  margin-left: auto;
  color: var(--haze-2);
  font-weight: 700;
  white-space: nowrap;
}
.is-fullscreen .meta-footer { display: none; }
/* Graph view carries the meta in its legend, so drop the duplicate footer.
   Table view keeps the footer (it has no graph legend). */
.page.view-graph .meta-footer { display: none; }
/* Slim the chrome so the selected view gets the height. On a short landscape
   viewport every row above the graph steals legibility, so reclaim aggressively:
   the location block is redundant here (the header pill already carries
   model · place · lang). NOTE: the landscape page is BOTH .wide and
   .is-fullscreen, and the ".wide .tab" / ".pill" rules appear LATER in this
   file — so these overrides must out-specify them (a ".page.is-fullscreen" /
   ".is-fullscreen.view-graph" compound prefix), not just rely on source order. */
.is-fullscreen .panel-loc { display: none; }
/* Table/Graph toggle — slimmer in both landscape views. */
.page.is-fullscreen .tabs { margin: 3px 14px; padding: 2px; flex: none; }
.page.is-fullscreen .tab { padding: 3px 0; font-size: 12px; border-radius: 9px; }
/* Compress the header + station-select pill in BOTH landscape views so the
   chrome band above the content is as slim as possible. The .page.is-fullscreen
   prefix out-specifies the later .pill rules; source order alone loses. */
/* space-between overrides the .page.wide-2a .panel-drag flex-start so the
   (now content-sized) pill sits CENTRED — drag grip far left, ✕ far right,
   pill in the middle, clear of the side notch. */
.page.is-fullscreen .panel-header { padding: 3px 12px 0; justify-content: space-between; }
.page.is-fullscreen .panel-pill {
  min-height: 28px;
  padding: 4px 12px;
  font-size: 12px;
  /* Override .page.wide-2a .panel-pill (flex:1 / max-width:none): in landscape
     the pill must NOT stretch across the row, or it runs under the side notch.
     Content-sized + capped + centred by the header's space-between keeps it
     comfortably clear of the safe-area edges. */
  flex: 0 1 auto;
  max-width: min(320px, 60vw);
}
.page.is-fullscreen .header-close { width: 30px; height: 30px; }
/* Graph view fills the sheet; the chart is fit-scaled in JS so it must not add
   its own vertical scrollbar. */
.is-fullscreen .graph-view-2a { flex: 1; min-height: 0; }
.is-fullscreen .chart-fit { overflow: hidden; }
/* Landscape: the scrub readout is a floating popup over the chart (top-right),
   NOT a chrome band — so the graph fills the whole height and the values are
   still one scrub away. It can be minimized (time + temp only) or closed
   (moving the scrubber reopens it). */
.is-fullscreen .graph-panel { position: relative; }
.is-fullscreen .readout-pop {
  position: absolute;
  top: 6px;
  right: 10px;
  z-index: 6;
  margin: 0;
  width: auto;
  max-width: 66%;
  padding: 5px 8px 6px 12px;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(252, 253, 254, 0.94);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 6px 18px rgba(13, 30, 45, 0.16);
  /* Draggable: grab anywhere but the buttons; touch-action:none so a touch drag
     moves the popup instead of panning the chart underneath. */
  cursor: grab;
  touch-action: none;
}
.is-fullscreen .readout-pop.is-dragging { cursor: grabbing; box-shadow: 0 10px 26px rgba(13, 30, 45, 0.24); }
.is-fullscreen .readout-pop .ro-min,
.is-fullscreen .readout-pop .ro-close { cursor: pointer; }
.is-fullscreen .readout-pop .ro-icon img { width: 24px; height: 24px; }
/* Minimized — keep just the time + temperature. */
.is-fullscreen .readout-pop.is-min .ro-precip,
.is-fullscreen .readout-pop.is-min .ro-wind,
.is-fullscreen .readout-pop.is-min .ro-icon { display: none; }
.is-fullscreen .readout-pop.is-closed { display: none; }
/* Popup controls — hidden outside the landscape popup. */
.ro-min, .ro-close { display: none; }
.is-fullscreen .readout-pop .ro-min,
.is-fullscreen .readout-pop .ro-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: var(--tint);
  color: var(--haze);
  font: 800 15px/1 inherit;
  cursor: pointer;
}
.is-fullscreen .readout-pop .ro-min::before { content: "–"; }
.is-fullscreen .readout-pop.is-min .ro-min::before { content: "+"; }
.is-fullscreen .readout-pop .ro-close::before { content: "×"; font-size: 17px; }
/* Very short landscape (Safari with its toolbar showing leaves ~260–320px) —
   the graph is the priority, so slim the remaining bands (tabs + legend). */
@media (orientation: landscape) and (max-height: 380px) {
  .is-fullscreen .chart-legend { padding: 1px 12px; }
  .page.is-fullscreen .tab { padding: 2px 0; }
}
/* Table view: one scrolling column (no nested scroll on the table itself). */
.is-fullscreen .ls-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.is-fullscreen .ls-scroll .panel-table {
  flex: none;
  min-height: 0;
  overflow: visible;
}
.is-fullscreen .ls-scroll .now-stats { grid-template-columns: 1fr 1fr 1fr; }
.is-fullscreen .ls-scroll .stat--wind-card { grid-column: auto; }

/* Built-in close affordance (the "closable" attribute). On mobile it floats
   over the location block; on desktop it sits inline in the header. */
.page-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 44px;
  height: 44px;
  border: none;
  background: rgba(252, 253, 254, 0.7);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 3;
  transition: background 0.15s;
}
.page-close:hover { background: rgba(252, 253, 254, 0.95); }

/* Desktop panel header (1b): selector chip (left) + close ✕ (right) */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 8px;
  flex: none;
}
.panel-pill {
  width: auto;
  max-width: 300px;
  gap: 7px;
  background: var(--tint);
  border-radius: 12px;
  padding: 8px 12px;
  min-height: 38px;
  font-size: 12px;
}
.panel-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-close {
  width: 38px;
  height: 38px;
  flex: none;
  border: none;
  background: var(--tint);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* Mobile centered location block */
.loc { text-align: center; padding: 12px 20px 2px; }
.loc-name {
  margin: 0;
  font-size: 29px;
  font-weight: 900;
  color: var(--ink);
  letter-spacing: -0.3px;
}
.loc-sub { font-size: 13px; font-weight: 700; color: var(--haze); margin-top: 2px; }
.narrow.page--closable .loc { padding: 12px 60px 2px; }

/* Desktop panel location block (left-aligned) */
.panel-loc { padding: 0 18px 4px; flex: none; }
.panel-loc-name { font-size: 24px; font-weight: 900; color: var(--ink); letter-spacing: -0.3px; }
.panel-loc-sub { font-size: 12px; font-weight: 700; color: var(--haze); }

.pill-wrap { padding: 10px 16px 0; }
.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: rgba(252, 253, 254, 0.7);
  border-radius: 14px;
  padding: 9px 14px;
  min-height: 40px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--haze);
  cursor: pointer;
}

/* "Weather now" card — quiet masthead block over the frost surface (no card) */
.now-wrap { padding: 12px 16px 2px; }
.now { background: transparent; border-radius: 0; padding: 6px 6px 4px; }
.now-eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--haze);
}
.now-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 10px;
}
.now-temp { line-height: 1.1; font-weight: 900; }
.now-icon { display: flex; align-items: center; }
.now-stats { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 8px; }
.stat { background: var(--paper); border-radius: 14px; padding: 9px 11px; box-shadow: 0 1px 2px rgba(20, 32, 43, 0.05); }
.stat-label { font-size: 11px; font-weight: 700; color: var(--haze); }
.stat-value { font-size: 17px; font-weight: 900; color: var(--ink); }
/* Wind is Iceland's signature variable — mark its card with the aurora edge. */
.stat--wind-card { box-shadow: inset 2px 0 0 var(--aurora), 0 1px 2px rgba(20, 32, 43, 0.05); }
.stat-wind { display: flex; align-items: center; gap: 5px; }

/* Mobile Table/Graph segmented control */
.tabs {
  margin: 12px 16px;
  display: flex;
  background: var(--line);
  border-radius: 17px;
  padding: 4px;
}
.tab {
  flex: 1;
  border: none;
  border-radius: 13px;
  padding: 12px 0;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  color: var(--haze);
}
.tab.on {
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(20, 32, 43, 0.12);
}

.temp-sep { color: var(--haze-2); font-weight: 700; }

/* ===================================================================== */
/* Desktop docked panel (map-panel 1b) — overrides scoped to .wide        */
/* ===================================================================== */

/* Fixed sections don't shrink; the table/graph region takes the rest. */
.wide .now,
.wide .day-chips,
.wide .tabs { flex: none; }

/* Compact weather-now card */
.wide .now { margin: 4px 14px 0; border-radius: 0; padding: 4px 4px 8px; }
.wide .now-eyebrow { font-size: 10px; letter-spacing: 1.2px; }
.wide .now-main { margin: 0 0 8px; }
.wide .now-stats { gap: 6px; }
.wide .stat { border-radius: 12px; padding: 7px 9px; }
.wide .stat-label { font-size: 10px; }
.wide .stat-value { font-size: 15px; }

/* Compact day chips — 76 px is the FLOOR, not the width. The docked panel omits
   the date line and every chip lands on 76; landscape keeps the date line, and a
   chip that cannot grow clips its own text out past both rounded edges (any
   locale whose date is wider than the box: "12 September", "12 września"). */
.wide .day-chips { padding: 10px 14px 4px; gap: 6px; }
.wide .day-chip {
  background: var(--paper);
  border-radius: 14px;
  padding: 7px 10px 6px;
  width: auto;
  min-width: 76px;
  box-sizing: border-box;
  box-shadow: none;
}
.wide .day-chip.sel { border-color: var(--aurora); background: var(--aurora-haze); }
.wide .dc-name { font-size: 12.5px; }
.wide .dc-icon { margin: 2px 0 1px; }
.wide .dc-temps { font-size: 12.5px; }

/* Table/Graph switch */
.wide .tabs { margin: 8px 14px 6px; background: var(--line); border-radius: 13px; padding: 3px; }
.wide .tab { border-radius: 10px; padding: 9px 0; font-size: 13.5px; }
.wide .tab.on { box-shadow: 0 1px 3px rgba(20, 32, 43, 0.14); }

/* ── Resizable panel (map panel) ────────────────────────────────────────────
   The panel's width/height are set inline by panelStyleAttr(); the bottom-left
   grip drives resize. Past the width breakpoint the body switches to the two
   columns below (weather-now + table left, graph right); the meta footer sits
   under both. */
.panel-resize {
  position: absolute;
  bottom: 0;
  width: 24px;
  height: 24px;
  z-index: 4;
  touch-action: none;
}
.panel-resize-bl { left: 0; cursor: nesw-resize; }
.panel-resize-br { right: 0; cursor: nwse-resize; }
/* Visible corner-bracket affordance so users see the panel is
   resizable; brightens to the aurora accent on hover. */
.panel-resize::before {
  content: "";
  position: absolute;
  bottom: 6px;
  width: 10px;
  height: 10px;
  border-bottom: 2px solid var(--haze-2);
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  opacity: 0.85;
}
.panel-resize-bl::before {
  left: 6px;
  border-left: 2px solid var(--haze-2);
  border-bottom-right-radius: 0;
}
.panel-resize-br::before {
  right: 6px;
  border-right: 2px solid var(--haze-2);
  border-bottom-left-radius: 0;
}
.panel-resize:hover::before { opacity: 1; border-color: var(--aurora); }
/* One-time first-open pulse to hint the resize affordance. */
@keyframes bel-resize-hint {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.4); opacity: 1; }
}
.panel-resize.hint::before {
  border-color: var(--aurora);
  transform-origin: bottom center;
  animation: bel-resize-hint 1s ease-in-out 2;
}

.exp-body { flex: 1; min-height: 0; display: flex; }
.exp-left {
  flex: none;
  width: 300px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 6px;
}
.exp-left .now-wrap { padding: 2px 14px 2px; }
.exp-left .now { padding: 0; }
.exp-left .now-main { margin: 2px 0 10px; gap: 10px; }
.exp-left .now-stats { grid-template-columns: 1fr 1fr; }
.exp-left .stat--wind-card { grid-column: 1 / -1; }
.exp-left .day-chips { padding: 6px 14px 8px; }
.exp-left .panel-table { flex: 1; min-height: 0; overflow-y: auto; }
.exp-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border-radius: 14px 0 0 0;
  margin-left: 8px;
  box-shadow: -1px 0 0 var(--line);
  overflow: hidden;
}
.exp-right .graph-view-2a,
.exp-right .graph-host,
.exp-right .graph-panel { flex: 1; min-height: 0; }
/* The taller (fullscreen) chart fills the expanded column; scroll if the panel
   is shorter than the chart rather than clipping it. */
.exp-right .chart-fit { overflow-y: auto; }

/* Table view — scrolling 24 h table with sticky header */
.panel-table { flex: 1; min-height: 70px; overflow-y: auto; padding: 0 16px 12px; }
.hrow-p {
  display: grid;
  grid-template-columns: 38px 28px 1fr 0.9fr 1.3fr;
  align-items: center;
  padding: 5px 8px;
  border-top: 1px solid var(--line-soft);
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.panel-table .hrow-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgba(252, 253, 254, 0.96);
  border-top: none;
  padding: 4px 8px 5px;
  font-size: 10px;
  letter-spacing: 0.4px;
}

/* Meta footer (analysis · last update) */
.meta-footer {
  flex: none;
  border-top: 1px solid var(--line);
  padding: 8px 16px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--haze-2);
  line-height: 1.5;
}

/* Graph view — map-panel meteogram */
.graph-view-2a {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  justify-content: flex-start;
}
.graph-view.graph-view-2a {
  justify-content: flex-start;
  overflow: hidden;
}
.graph-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.graph-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  justify-content: flex-start;
}
/* The chart fills the available height; it should not introduce its own
   vertical scrollbar — the SVG is sized to fit the lane region. */
.chart-fit {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* B1: in the docked 1-column panel, keep the compact chart at its natural
   height and let the whole graph block (readout + chart + legend) scroll if the
   panel is too short — so the wind lane, legend and folded-in meta line are
   never clipped-and-unreachable. A scrollbar only appears when it actually
   overflows; at a comfortable size the full meteogram fits with no scroll.
   The landscape (is-fullscreen) view fit-scales and the expanded (is-expanded)
   two-column view scrolls its own .exp-right column — both excluded here. */
.page.wide:not(.is-fullscreen):not(.is-expanded) .graph-panel { overflow-y: auto; }
.page.wide:not(.is-fullscreen):not(.is-expanded) .chart-fit {
  flex: none;
  overflow: visible;
}
.readout-2a {
  margin: 0 14px 6px;
  padding: 8px 12px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--tint);
  flex: none;
}
/* Icon sits beside the values on the left (C3); text block can shrink/wrap. */
.readout-main { min-width: 0; display: flex; align-items: center; gap: 10px; }
.readout-text { min-width: 0; }
.readout-2a .ro-icon { flex: none; }
.readout-2a .ro-time { white-space: nowrap; }
.readout-2a .ro-temp { font-size: 17px; }
.readout-2a .ro-precip, .readout-2a .ro-wind { font-size: 12px; }
.readout-side { display: flex; align-items: center; gap: 8px; flex: none; }
.chart-fs-btn {
  width: 32px;
  height: 32px;
  flex: none;
  border: none;
  background: var(--tint);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.chart {
  display: flex;
  align-items: flex-start;
  flex: none;
  padding-left: 14px;
}
.chart-lane {
  pointer-events: none;
}
/* Pinned right-hand precip (mm) scale — stays put while the plot scrolls. */
.chart-axis-right { flex: none; }
/* The chart is routinely several times wider than the panel — a five-day run at
   42px a column is ~3100px in a ~360px box — so this is the reader's only route
   to most of the forecast, and it has to look like one.

   overflow-y is CLIPPED, not visible: when one axis is a scrolling value, CSS
   promotes "visible" on the other axis to "auto", so this box was quietly
   reserving room for a horizontal scrollbar inside its own height. On a platform
   with scrollbars that take space, those ~15px pushed the content past the graph
   panel and raised a vertical scrollbar nobody needed.

   (No backticks in this file's comments — the whole stylesheet is one template
   literal, and a stray one builds a corrupted bundle without erroring.) */
.chart-scroll {
  overflow-x: auto;
  overflow-y: clip;
  flex: 1;
  min-width: 0;
  position: relative;
  -webkit-overflow-scrolling: touch;
}
/* A standing rail under the plot, on pointer devices only.

   macOS gives WebKit overlay scrollbars that fade within a second of the last
   scroll, so on a desktop there was nothing at all to say that ~89% of the
   forecast lay to the right — it only appeared when the panel was resized.
   Styling the scrollbar opts out of the overlay behaviour. Touch devices keep
   the native overlay: a swipe is its own affordance there, and a permanent 8px
   rail would cost real height on a short phone in landscape. */
@media (hover: hover) and (pointer: fine) {
  .chart-scroll {
    scrollbar-width: thin;
    scrollbar-color: #C6D4E0 transparent;
  }
  .chart-scroll::-webkit-scrollbar { height: 8px; }
  .chart-scroll::-webkit-scrollbar-track {
    background: transparent;
    margin: 0 2px;
  }
  .chart-scroll::-webkit-scrollbar-thumb {
    background: #C6D4E0;
    border-radius: 4px;
  }
  .chart-scroll::-webkit-scrollbar-thumb:hover { background: #A8BCCC; }
}
.chart-scroll svg text { pointer-events: none; }
.chart-lane .chart-chip { font-size: 10px; padding: 2px 7px; border-radius: 7px; }
/* The .chart-swatch-* overrides that used to re-colour the panel's legend are
   gone: both charts now draw from DATA_COLORS, so there is nothing to override. */
.chart-legend { flex: none; gap: 5px 11px; padding: 6px 16px 14px; font-size: 10px; }

/* ── Time scrubber — subtle dot on the chart's top edge ──────────────────
   An invisible 24px drag strip overlaid on the top of the plot, carrying a
   small aurora dot on the cursor line that drops into the lanes. Zero chrome,
   zero height cost. Drag the strip or the plot itself; ←/→ = 1 h,
   PgUp/PgDn = 24 h (role="slider"). Rendered only in fullscreen landscape. */
.scrub-rail {
  position: absolute;
  top: 0;
  left: 0;
  height: 24px;
  z-index: 3;
  touch-action: none;
  cursor: ew-resize;
}
.scrub-grab {
  position: absolute;
  top: 15px; /* centered on the plot-area top edge; kept in sync with the fit-scale by JS */
  transform: translateX(-50%);
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--aurora);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(13, 30, 45, 0.3);
  pointer-events: none;
}
/* Chart cursor driven by the scrubber (inside .chart-scroll, over the plot).
   The child combinator keeps this off the SVG <line class="scrub-cursor">. */
.chart-scroll > .scrub-cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px solid rgba(20, 32, 43, 0.35);
  pointer-events: none;
  z-index: 2;
}
/* The HTML cursor + top-edge dot replace the in-SVG dashed cursor and lane
   dots in fullscreen landscape (the design wants a single minimal line). */
.is-fullscreen .chart-plot .scrub-cursor,
.is-fullscreen .chart-plot .scrub-dot-temp,
.is-fullscreen .chart-plot .scrub-dot-wind {
  display: none;
}

/* Expanded overlay — a centred, size-capped panel over the map host (NOT a
   full-bleed inset, which is oversized on large monitors). The split variant is
   two columns: left = weather-now + hourly table, right = the large graph. */

/* Legacy graph view (mobile) — vertically-centered compact meteogram */
.graph-view { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; justify-content: center; }
.graph-compact .readout { margin: 0 14px 8px; padding: 9px 13px; }
.graph-compact .ro-time { font-size: 10.5px; }
.graph-compact .ro-temp { font-size: 18px; }
.graph-compact .ro-precip, .graph-compact .ro-wind { font-size: 12.5px; }
.graph-compact .legend { gap: 6px 12px; padding: 6px 16px 12px; font-size: 10px; }

/* ---- Mobile day-chip row + selected-day card ---- */
.day-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 2px 16px 10px;
  scroll-snap-type: x proximity;
}
.day-chip {
  flex: none;
  scroll-snap-align: start;
  background: var(--paper);
  border: 2px solid transparent;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(20, 32, 43, 0.06);
  padding: 9px 13px 8px;
  min-width: 86px;
  font-family: inherit;
  cursor: pointer;
  text-align: center;
}
.day-chip.sel { border-color: var(--aurora); background: var(--aurora-haze); }
.dc-name { font-size: 13.5px; font-weight: 800; color: var(--ink); white-space: nowrap; }
.dc-date { font-size: 11px; font-weight: 700; color: var(--haze); white-space: nowrap; }
.dc-icon { display: flex; justify-content: center; margin: 3px 0 2px; }
.dc-temps { font-size: 13.5px; font-weight: 900; white-space: nowrap; font-variant-numeric: tabular-nums; }

.sel-wrap { padding: 0 16px; }
.sel-card {
  background: var(--paper);
  border-radius: 20px;
  box-shadow: 0 1px 2px rgba(20, 32, 43, 0.06);
  padding: 12px 16px 14px;
}
.sel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
}
.sel-title { font-size: 15px; font-weight: 900; color: var(--ink); }
.sel-date { font-weight: 700; color: var(--haze); font-size: 12px; }
/* Day summary: one labelled stat per column of the table underneath, laid out on
   the same rhythm so the eye reads each figure as the heading of its column. */
.sel-stats {
  display: flex;
  gap: 18px;
  padding: 2px 0 10px;
  border-bottom: 1px solid var(--line-soft);
  margin-bottom: 4px;
}
.sel-stat { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sel-stat-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--haze);
}
.sel-stat-value {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
}
.sel-stat-precip { color: ${DATA_COLORS.precip}; }
.panel-table .sel-stats { padding: 0 0 9px; }

/* Hourly rows shared by the mobile selected-day card (46/34 grid). The side
   padding clears the "now" rail below — see .hrow-now. */
.hrow {
  display: grid;
  grid-template-columns: 46px 34px 1fr 1fr 1.2fr;
  align-items: center;
  padding: 5px 8px;
  border-top: 1px solid var(--line-soft);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
/* The hour containing "now", in both the mobile card (.hrow) and the desktop
   panel table (.hrow-p). Today's rows start at the forecast's analysis hour
   rather than midnight, so the current hour is never a fixed row — this is the
   anchor that makes its position legible instead of something to hunt for. */
.hrow-now {
  background: var(--aurora-haze);
  box-shadow: inset 2px 0 0 var(--aurora);
}
/* The rail is a marker beside the hour, not a stroke through it: every row —
   marked or not, header included — carries the same 8px gutter, so the rail has
   room to read and no column shifts when the marker moves down the table. */
.hrow-now .h-time { color: var(--aurora); font-weight: 900; }
.hrow-head {
  border-top: none;
  padding: 4px 8px 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--haze);
}
.hrow-head .h-temp, .hrow-head .h-precip { text-align: right; font-weight: 800; color: var(--haze); }
.h-wind-h { text-align: right; }
.h-time { font-weight: 800; color: var(--ink); }
.h-icon { display: flex; }
.h-temp { text-align: right; font-weight: 900; }
.h-precip { text-align: right; font-weight: 700; color: ${DATA_COLORS.precip}; }
.h-wind {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
}

/* Mobile graph view wrapper */
.graph-wrap { padding: 0 16px 8px; }
/* Bare graph card (desktop detail panel supplies the surface + header) */
.graph-bare { padding-bottom: 2px; }

/* Loading skeletons (full mode) */
.sk {
  background: linear-gradient(90deg, #E4EAEE 25%, #EFF2F5 50%, #E4EAEE 75%);
  background-size: 200% 100%;
  animation: bel-shimmer 1.4s infinite;
  border-radius: 20px;
}
.sk-now { height: 190px; border-radius: 20px; }
.sk-row { height: 58px; border-radius: 16px; }
.sk-rows { display: flex; flex-direction: column; gap: 10px; }
.narrow .sk-now { margin: 12px 16px 2px; }
.narrow .sk-rows { padding: 12px 16px 16px; }
.wide .sk-now { margin: 8px 14px 0; height: 150px; }
.wide .sk-rows { padding: 12px 14px; }

/* Settings overlay — centred dialog on roomy screens, fullscreen when the
   viewport is narrow OR short. The min-height:480 guard is essential: a phone in
   LANDSCAPE is wide (>560) but short, so the centred dialog (max-height:84vh)
   squeezed the flex station list to zero height and it couldn't scroll. Below
   480px tall it goes fullscreen so the list keeps real, scrollable height. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: auto;
  background: rgba(13, 30, 45, 0.45);
}
.overlay {
  background: var(--frost);
  width: 100%;
  height: 100%;
  padding: 18px 16px 10px;
  display: flex;
  flex-direction: column;
}
@media (min-width: 560px) and (min-height: 480px) {
  .backdrop {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .overlay {
    max-width: 420px;
    height: auto;
    max-height: 84vh;
    border-radius: 24px;
    padding: 20px 20px 14px;
    box-shadow: 0 20px 60px rgba(13, 30, 45, 0.35);
  }
  /* Long station lists: show ~8 rows in the dialog, scroll for the rest */
  .station-list { max-height: 384px; }
}
.overlay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex: none;
}
.overlay-title { font-size: 19px; font-weight: 900; color: var(--ink); }
.overlay-close {
  width: 44px;
  height: 44px;
  flex: none;
  border: none;
  background: var(--tint);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
/* Settings body: single column by default; the short-viewport (landscape)
   media query below switches it to a two-column grid. */
.ov-cols {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.ov-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ov-col--station { flex: 1; }
.section-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--haze);
  margin-bottom: 7px;
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.chip {
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  background: var(--tint);
  color: var(--haze);
}
.chip.on { background: var(--ink); color: #ffffff; }
.station-search {
  width: 100%;
  box-sizing: border-box;
  flex: none;
  padding: 13px 16px;
  border-radius: 14px;
  border: 1.5px solid var(--line);
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  background: var(--paper);
}
.station-search:focus { outline: 2px solid var(--aurora); }
.station-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  /* iOS won't momentum-scroll a flex child whose height is purely implied;
     touch-action:pan-y makes the vertical drag scroll rather than being eaten. */
  touch-action: pan-y;
  flex: 1;
  min-height: 0;
  margin-top: 4px;
}
.station {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: none;
  padding: 12px 4px;
  min-height: 48px;
  font-family: inherit;
  cursor: pointer;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.station-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
}
.station-sub {
  font-size: 12px;
  font-weight: 700;
  color: var(--haze-2);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: none;
}
/* The distance is what the list is ordered by, so it leads and carries the
   weight; the coordinate stays as the quiet identifier it always was. */
.station-dist {
  font-weight: 800;
  color: var(--haze);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.station-coord { white-space: nowrap; }
@media (max-width: 430px) {
  /* A phone has no room for both; the distance is the useful half. */
  .station-coord { display: none; }
}
.station.sel .station-name { color: var(--aurora); }

/* Short viewport (a phone in landscape ≈ 320–430px tall): edge-to-edge dialog
   split into two columns so nothing is below the fold — model + language chips
   left, station search + independently-scrolling list right (the base
   .station-list rules provide the scroll). Hairline between the columns. */
@media (max-height: 479px) {
  /* The settings overlay is position:fixed, so it fills the raw viewport and
     escapes the host's safe-area padding — a phone held in landscape puts the
     notch on a side, so inset the overlay by the safe area (falling back to the
     18px design gutter) or the Model/Language column sits under the notch. */
  .overlay {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-right: max(18px, env(safe-area-inset-right));
    padding-bottom: 0;
    padding-left: max(18px, env(safe-area-inset-left));
  }
  .overlay .overlay-head { margin-bottom: 8px; }
  .overlay .overlay-title { font-size: 18px; }
  .overlay .overlay-close { width: 40px; height: 40px; }
  .ov-cols {
    display: grid;
    grid-template-columns: 272px minmax(0, 1fr);
    column-gap: 24px;
  }
  .ov-col--station { border-left: 1px solid var(--line); padding-left: 24px; }
  .ov-col--station .station-list { margin-top: 6px; padding-bottom: 10px; }
  .overlay .station-search { padding: 10px 14px; font-size: 15px; }
  .overlay .station { padding: 8px 4px; min-height: 44px; }
  .overlay .station-name { font-size: 15px; }
  .overlay .chips { margin-bottom: 14px; }
}
`;

/** Bottom-sheet chrome for the popup mode of the widget */
export const sheetStyles = `
:host {
  --ink: #14202B;
  --frost: #E9EEF1;
  --line: #DCE3E8;
  font-family: 'Nunito', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }

.scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(13, 30, 45, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 430px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--frost);
  border-radius: 26px 26px 0 0;
  box-shadow: 0 -14px 40px rgba(13, 30, 45, 0.25);
  padding: 8px 16px calc(22px + env(safe-area-inset-bottom, 0px));
  touch-action: none;
  transition: transform 0.2s ease-out;
}
.grabber {
  width: 42px;
  height: 5px;
  border-radius: 3px;
  background: var(--line);
  margin: 4px auto 8px;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 12px;
}
.sheet-title {
  font-size: 20px;
  font-weight: 900;
  color: var(--ink);
  letter-spacing: -0.3px;
}
.close {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 14px;
  background: rgba(252, 253, 254, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: none; }
}
`;
