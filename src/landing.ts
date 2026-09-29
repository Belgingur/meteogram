import { DATA_COLORS } from "./colors";
import { arrowSvg, windText } from "./graph-card";
import { LANGS, type Labels } from "./i18n";
import { esc, tempColor } from "./render";
import { symbolUrl } from "./symbols";
import type { HourPoint } from "./types";

/**
 * Full landing mode (mode="full") — the responsive landing
 * experience (v2) as part of the embedded widget. Markup builders only; the
 * component wires state, layout switching and events.
 *
 * Two layouts, switched by a JS breakpoint (≥ 900 px = desktop):
 *   - Mobile: settings pill, "weather now" card, Table/Graph control, a
 *     horizontally-scrolling day-chip row and one fixed selected-day card.
 *   - Desktop: two-column grid — left "weather now" + compact day list;
 *     right detail panel that toggles between the 48 h meteogram and the
 *     selected day's hourly table.
 */

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface DayGroup {
  /** "Í dag" / "Á morgun" / capitalized weekday */
  name: string;
  /** "8. júlí" */
  date: string;
  maxC: number | null;
  minC: number | null;
  windMean: number | null;
  /** Total precipitation over the day, mm. */
  precipMm: number;
  /** Symbol codes at local hours 03 / 09 / 15 / 21 (missing hours skipped) */
  icons: string[];
  /** Representative midday symbol (≈ 15:00) for chips and the day summary */
  noonSymbol: string;
  hours: HourPoint[];
}

/** "64.15°N 21.94°V" */
export function coordLabel(lat: number, lon: number, t: Labels): string {
  const ns = lat < 0 ? "S" : "N";
  const ew = t.compass[lon < 0 ? 6 : 2]; // V/W or A/E
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** Group hourly points into local calendar days, starting at "now"'s day */
export function groupDays(
  points: HourPoint[],
  t: Labels,
  nowIdx: number,
  maxDays = 7,
): DayGroup[] {
  if (!points.length) return [];
  const dayKey = (p: HourPoint): number =>
    Date.UTC(p.local.getUTCFullYear(), p.local.getUTCMonth(), p.local.getUTCDate());
  const todayKey = dayKey(points[Math.max(0, Math.min(points.length - 1, nowIdx))]);

  const byDay = new Map<number, HourPoint[]>();
  for (const p of points) {
    const key = dayKey(p);
    if (key < todayKey) continue; // drop hours before today
    let list = byDay.get(key);
    if (!list) byDay.set(key, (list = []));
    list.push(p);
  }

  const groups: DayGroup[] = [];
  for (const [key, hours] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    if (groups.length >= maxDays) break;
    const d = hours[0].local;
    const offset = Math.round((key - todayKey) / 86_400_000);
    const wd = t.weekdays[d.getUTCDay()];
    const name =
      offset === 0
        ? t.today
        : offset === 1
          ? t.tomorrow
          : wd.charAt(0).toUpperCase() + wd.slice(1);
    const temps = hours
      .map((p) => p.tempC)
      .filter((v): v is number => Number.isFinite(v));
    const winds = hours
      .map((p) => p.windMs)
      .filter((v): v is number => Number.isFinite(v));
    groups.push({
      name,
      date: t.dateLabel(d.getUTCDate(), t.months[d.getUTCMonth()]),
      maxC: temps.length ? Math.round(Math.max(...temps)) : null,
      minC: temps.length ? Math.round(Math.min(...temps)) : null,
      windMean: winds.length
        ? Math.round(winds.reduce((a, b) => a + b, 0) / winds.length)
        : null,
      precipMm: hours.reduce(
        (sum, p) => sum + (Number.isFinite(p.precipMm) ? p.precipMm : 0),
        0,
      ),
      icons: [3, 9, 15, 21]
        .map((h) => hours.find((p) => p.local.getUTCHours() === h)?.symbol ?? "")
        .filter(Boolean),
      noonSymbol: noonSymbolOf(hours),
      hours,
    });
  }
  return groups;
}

function symbolImg(code: string, size: number): string {
  const url = symbolUrl(code);
  return url
    ? `<img src="${esc(url)}" width="${size}" height="${size}" alt="">`
    : `<span style="width:${size}px;height:${size}px;display:inline-block"></span>`;
}

/** Symbol for the hour nearest local 15:00 — the day's representative icon */
function noonSymbolOf(hours: HourPoint[]): string {
  let best = "";
  let bd = Infinity;
  for (const p of hours) {
    const d = Math.abs(p.local.getUTCHours() - 15);
    if (d < bd && p.symbol) {
      bd = d;
      best = p.symbol;
    }
  }
  return best;
}

/** "Weather now" card for the hour under "now". Hero temp/symbol shrink on
    desktop (60/64) versus mobile (66/76). */
export function nowCardHtml(
  p: HourPoint,
  t: Labels,
  heroSize = 66,
  iconSize = 76,
): string {
  const temp = p.tempC === null ? null : Math.round(p.tempC);
  // Feels-like per the prototype: temp − 0.35 × wind
  const feels =
    p.tempC === null || p.windMs === null
      ? null
      : Math.round(p.tempC - 0.35 * p.windMs);
  return `
    <div class="now">
      <div class="now-eyebrow">${esc(t.now)}</div>
      <div class="now-main">
        <div class="now-temp" style="font-size:${heroSize}px;color:${temp === null ? DATA_COLORS.none : "#14202B"}">${temp === null ? "–" : `${temp}°`}</div>
        <div class="now-icon">${symbolImg(p.symbol, iconSize)}</div>
      </div>
      <div class="now-stats">
        <div class="stat">
          <div class="stat-label">${esc(t.feels)}</div>
          <div class="stat-value" style="color:${feels === null ? DATA_COLORS.none : "#14202B"}">${feels === null ? "–" : `${feels}°`}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${esc(t.precip)}</div>
          <div class="stat-value" style="color:${DATA_COLORS.precip}">${p.precipMm.toFixed(1)} mm</div>
        </div>
        <div class="stat stat--wind-card">
          <div class="stat-label">${esc(t.wind)}</div>
          <div class="stat-value stat-wind"><span>${esc(windText(p))}</span>${arrowSvg(p.dirDeg, 17, "#1E8E6B")}</div>
        </div>
      </div>
    </div>`;
}

const chevron = (cls = ""): string =>
  `<svg class="${cls}" width="14" height="14" viewBox="0 0 14 14" style="flex:none"><path d="M3 5l4 4 4-4" fill="none" stroke="#6B7A86" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Settings pill (1c): "{model} · {place} · {LANG}" */
export function pillHtml(summary: string): string {
  return `<button class="pill" type="button"><span>${esc(summary)}</span>${chevron()}</button>`;
}

/** "12° / 8°" high/low temps, each temp-coloured; "–" when unknown */
function tempRange(maxC: number | null, minC: number | null, sep = " / "): string {
  if (maxC === null || minC === null) return "–";
  return (
    `<span style="color:${tempColor(maxC)}">${maxC}°</span>` +
    `<span class="temp-sep">${sep}</span>` +
    `<span style="color:${tempColor(minC)}">${minC}°</span>`
  );
}

/** The five cells of an hourly row (time · icon · temp · precip · wind) */
function hourCells(p: HourPoint, iconSize: number): string {
  return (
    `<span class="h-time">${String(p.local.getUTCHours()).padStart(2, "0")}</span>` +
    `<span class="h-icon">${symbolImg(p.symbol, iconSize)}</span>` +
    `<span class="h-temp" style="color:${p.tempC === null ? DATA_COLORS.none : tempColor(Math.round(p.tempC))}">${p.tempC === null ? "–" : `${Math.round(p.tempC)}°`}</span>` +
    `<span class="h-precip">${p.precipMm > 0.05 ? p.precipMm.toFixed(1) : "–"}</span>` +
    `<span class="h-wind">${esc(windText(p))} ${arrowSvg(p.dirDeg, 14, "#6B7A86")}</span>`
  );
}

/**
 * Row-class marker for the hour that contains "now" — the table's visual anchor.
 *
 * Matched on absolute time, never on position: today's group starts at whichever
 * hour the forecast run begins with (an analysis a few hours back, not
 * midnight), so the current hour lands on a different row for every run. A row
 * index would be a different clock hour on each load — the same mistake that put
 * "now" in three places with three meanings.
 *
 * "Now" is sampled ONCE per table, not once per row: rows tile the timeline
 * without gaps, so a clock that advanced mid-render could match two adjacent
 * rows or neither. One snapshot makes "exactly one row" a property of the
 * function rather than a race it usually wins. The step comes from the data
 * because some forecasts advance 3 h or 6 h at a time.
 */
function nowRowMarker(hours: HourPoint[]): (p: HourPoint) => string {
  const now = Date.now();
  const stepMs = hours.length > 1 ? hours[1].utcMs - hours[0].utcMs : 3_600_000;
  return (p) => (now >= p.utcMs && now < p.utcMs + stepMs ? " hrow-now" : "");
}

/** Uppercase header row for an hourly table */
function hourHeadRow(rowClass: string, t: Labels): string {
  return (
    `<div class="${rowClass} hrow-head">` +
    `<span>${esc(t.timeCol)}</span><span></span>` +
    `<span class="h-temp">${esc(t.tempCol)}</span>` +
    `<span class="h-precip">mm</span><span class="h-wind-h">m/s</span></div>`
  );
}

/** Down-chevron used by the desktop panel's selector chip */
const chevronSmall =
  `<svg width="11" height="11" viewBox="0 0 14 14" style="flex:none"><path d="M3 5l4 4 4-4" fill="none" stroke="#8CA3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const closeSvg =
  `<svg width="15" height="15" viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/><line x1="13" y1="3" x2="3" y2="13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/></svg>`;

const dragGripSvg =
  `<svg width="9" height="15" viewBox="0 0 9 15" style="flex:none"><g fill="#B4C6D6"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="6.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="7.5" r="1.4"/><circle cx="6.5" cy="7.5" r="1.4"/><circle cx="2.5" cy="12.5" r="1.4"/><circle cx="6.5" cy="12.5" r="1.4"/></g></svg>`;

/** "08 Jul 04:41 UTC" */
export function formatUtcMetaTime(d: Date, t: Labels): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = t.monthsShort[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${mon} ${hh}:${mm} UTC`;
}

/**
 * A point's UTC offset as a label: `UTC`, `UTC-3`, `UTC+5:45`.
 *
 * The chart renders in the FORECAST POINT's zone (see toHourPoints and
 * meta.location_timezone_offset), while the map timeline around it renders in
 * the browser's. Both name the same instants, so a reader looking at a remote
 * point sees two clocks disagree; this is the label that explains which is which.
 *
 * The convention is the API's: `local = UTC + offset`, so -180 is UTC−3. That is
 * the INVERSE of `Date.prototype.getTimezoneOffset()`, which reports +180 for
 * São Paulo — never route this value through that method or compare the two.
 *
 * Returns null when there is no offset to show, so the caller can drop the
 * segment rather than print a placeholder. The check is explicitly for
 * null/non-finite, not falsiness: every Icelandic domain sends a legitimate 0.
 */
export function formatUtcOffset(
  minutes: number | null | undefined,
): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (!Number.isFinite(minutes)) return null;
  if (minutes === 0) return "UTC";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  // The sign belongs to the hours; the minutes part is always two positive
  // digits, and absent entirely on a whole hour ("UTC-3", never "UTC-3:00").
  return mins === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`;
}

/**
 * The panel header's one-line summary: model, place, UI language, and the
 * point's zone — `BEL-BR · 17.68°S 43.89°W · EN · UTC-3`.
 *
 * Segments that have nothing to say are dropped along with their separator, so
 * a point of unknown zone reads `BEL-BR · … · EN` rather than trailing a bare
 * middot.
 */
export function panelSummary(parts: {
  modelName: string;
  place: string;
  lang: string;
  tzOffsetMin: number | null | undefined;
}): string {
  return [
    parts.modelName,
    parts.place,
    parts.lang,
    formatUtcOffset(parts.tzOffsetMin),
  ]
    .filter((segment): segment is string => !!segment)
    .join(" · ");
}

/**
 * Map-panel header: drag grip + selector chip + close. The header row is
 * the drag handle (`data-drag-handle`).
 */
export function draggablePanelHeaderHtml(
  summary: string,
  closable: boolean,
  t: Labels,
): string {
  const close = closable
    ? `<button class="header-close" type="button" aria-label="${esc(t.close)}">${closeSvg}</button>`
    : "";
  return `
    <div class="panel-header panel-drag" data-drag-handle>
      ${dragGripSvg}
      <button class="pill panel-pill" type="button"><span>${esc(summary)}</span>${chevronSmall}</button>
      ${close}
    </div>`;
}

/** Analysis / last-update line below table or graph. */
export function metaFooterHtml(line: string): string {
  return `<div class="meta-footer">${esc(line)}</div>`;
}

/**
 * Horizontally-scrolling day-chip row. `showDate` adds the date line (mobile);
 * the desktop panel (1b) omits it for a tighter chip.
 */
export function dayChipsHtml(
  days: DayGroup[],
  selected: number,
  showDate = true,
): string {
  const chips = days
    .map((d, i) => {
      const sel = i === selected;
      const date = showDate ? `<div class="dc-date">${esc(d.date)}</div>` : "";
      return `
      <button class="day-chip${sel ? " sel" : ""}" type="button" data-day="${i}">
        <div class="dc-name">${esc(d.name)}</div>
        ${date}
        <div class="dc-icon">${symbolImg(d.noonSymbol, showDate ? 30 : 26)}</div>
        <div class="dc-temps">${tempRange(d.maxC, d.minC, "/")}</div>
      </button>`;
    })
    .join("");
  return `<div class="day-chips">${chips}</div>`;
}

/**
 * The day's summary, one labelled stat per column the table below carries.
 *
 * This header used to show a bare "3 m/s" in its top-right corner: the day's
 * mean wind, with nothing to say so, and no counterpart for the temperature or
 * precipitation columns sitting right beside it. A single unexplained number is
 * worse than none — readers reasonably took it for a current reading. Naming it
 * and giving the other two lanes the same treatment makes the row a summary of
 * the table rather than a stray figure.
 */
function dayStatsHtml(d: DayGroup, t: Labels): string {
  const stat = (label: string, value: string): string =>
    `<div class="sel-stat"><span class="sel-stat-label">${esc(label)}</span><span class="sel-stat-value">${value}</span></div>`;
  const range = tempRange(d.maxC, d.minC, " / ");
  const rain = d.precipMm > 0.05 ? `${d.precipMm.toFixed(1)} mm` : "–";
  const wind = d.windMean === null ? "–" : `${d.windMean} m/s`;
  return `
        <div class="sel-stats">
          ${stat(t.tempCol, range)}
          ${stat(t.precip, `<span class="sel-stat-precip">${rain}</span>`)}
          ${stat(t.wind, wind)}
        </div>`;
}

/** Mobile selected-day card: header + full 24-row hourly table */
export function selDayCardHtml(d: DayGroup, t: Labels): string {
  const nowRow = nowRowMarker(d.hours);
  const rows = d.hours
    .map((p) => `<div class="hrow${nowRow(p)}">${hourCells(p, 24)}</div>`)
    .join("");
  return `
    <div class="sel-card">
      <div class="sel-head">
        <div class="sel-title">${esc(d.name)} <span class="sel-date">${esc(d.date)}</span></div>
      </div>${dayStatsHtml(d, t)}
      ${hourHeadRow("hrow", t)}
      ${rows}
    </div>`;
}

/**
 * Desktop panel Table view (1b): a single scrolling 24-hour table with a
 * sticky header row (grid 38/28/1fr/0.9fr/1.3fr).
 */
export function panelTableHtml(d: DayGroup, t: Labels): string {
  const nowRow = nowRowMarker(d.hours);
  const rows = d.hours
    .map((p) => `<div class="hrow-p${nowRow(p)}">${hourCells(p, 22)}</div>`)
    .join("");
  // The same day summary the phone card carries. It was mobile-only before, so
  // the two tables disagreed about whether a day has a headline at all.
  return `
    <div class="panel-table">
      ${dayStatsHtml(d, t)}
      ${hourHeadRow("hrow-p hrow-sticky", t)}
      ${rows}
    </div>`;
}

/** Rendered station rows are capped: the list arrives nearest-first, so the
    useful neighbours are on top and search reaches everything else — while a
    multi-thousand-station deployment doesn't rebuild thousands of DOM rows
    on every keystroke. */
const MAX_STATION_ROWS = 200;

/** Fold a place name (or search query) to an accent- and script-insensitive
    key so "Isafjordur" matches "Ísafjörður" and "Lodz" matches "Łódź". NFD + combining-mark strip
    handles the accented Latin letters (á é í ó ú ý, and ö → o via the
    diaeresis); the Icelandic/Nordic letters that have no decomposition are
    romanised explicitly. Stroke/ligature letters (ł đ ð þ æ œ ø ß) do NOT
    decompose under NFD, so those are mapped by hand (ł → l, þ → th, ß → ss …). */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .trim();
}

/** Station list rows for the settings overlay, filtered by `query` */
export function stationRowsHtml(
  places: Place[],
  selected: Place | null,
  query: string,
  t: Labels,
): string {
  const check =
    `<svg width="14" height="14" viewBox="0 0 16 16" style="flex:none"><path d="M3 8.5l3.5 3.5L13 5" fill="none" stroke="#1E8E6B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const q = foldName(query);
  return places
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !q || foldName(p.name).includes(q))
    .slice(0, MAX_STATION_ROWS)
    .map(({ p, i }) => {
      const sel = selected !== null && p.name === selected.name;
      return `
      <button class="station${sel ? " sel" : ""}" type="button" data-station="${i}">
        <span class="station-name">${esc(p.name)}${sel ? ` ${check}` : ""}</span>
        <span class="station-sub">${esc(coordLabel(p.lat, p.lon, t))}</span>
      </button>`;
    })
    .join("");
}

/** Settings overlay (view 2): forecast model · language · location */
export function overlayHtml(
  models: ModelOption[],
  selectedModelId: string,
  lang: string,
  places: Place[],
  selected: Place | null,
  query: string,
  t: Labels,
): string {
  const chips = models
    .map(
      (m, i) =>
        `<button class="chip${m.id === selectedModelId ? " on" : ""}" type="button" data-model="${i}">${esc(m.name)}</button>`,
    )
    .join("");
  return `
    <div class="backdrop">
      <div class="overlay" role="dialog" aria-modal="true" aria-label="${esc(t.settings)}">
        <div class="overlay-head">
          <div class="overlay-title">${esc(t.settings)}</div>
          <button class="overlay-close" type="button" aria-label="${esc(t.close)}">
            <svg width="16" height="16" viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/><line x1="13" y1="3" x2="3" y2="13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="ov-cols">
          <div class="ov-col">
            <div class="section-label">${esc(t.forecastModel)}</div>
            <div class="chips chips-models">${chips}</div>
            <div class="section-label">${esc(t.language)}</div>
            <div class="chips chips-langs">
              ${LANGS.map(
                (l) =>
                  `<button class="chip${lang === l.code ? " on" : ""}" type="button" data-lang="${l.code}">${esc(l.name)}</button>`,
              ).join("")}
            </div>
          </div>
          <div class="ov-col ov-col--station">
            <div class="section-label">${esc(t.location)}</div>
            <input class="station-search" type="text" value="${esc(query)}" placeholder="${esc(t.search)}">
            <div class="station-list">${stationRowsHtml(places, selected, query, t)}</div>
          </div>
        </div>
      </div>
    </div>`;
}
