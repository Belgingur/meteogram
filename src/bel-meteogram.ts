import {
  findForecast,
  forecastPath,
  hasStationEndpoint,
  loadConfig,
  loadForecastMetadata,
  loadMeteogramData,
  refStationAt,
  runTimes,
  stationDataUrl,
  type ApiOptions,
} from "./api";
import { distanceKm } from "./geo";
import {
  columnAtTime,
  currentIndex,
  forecastSpanLabel,
  indexAtInstant,
  nowIndex,
  nowMarkerIndex,
  renderGraphCard,
  timeEventDetail,
  type TimeSource,
} from "./graph-card";
import { labels, type Labels } from "./i18n";
import {
  correctedBadgeHtml,
  dayChipsHtml,
  draggablePanelHeaderHtml,
  formatUtcMetaTime,
  groupDays,
  locationSubHtml,
  metaFooterHtml,
  nowCardHtml,
  overlayHtml,
  panelSummary,
  chipPlace,
  panelTableHtml,
  pillHtml,
  placeTitle,
  selDayCardHtml,
  stationPlaceNoteHtml,
  stationRowsHtml,
  type DayGroup,
  type ModelOption,
  type Place,
  type PlaceTitle,
} from "./landing";
import { renderMapPanelGraph } from "./map-panel-graph";
import { esc } from "./render";
import { componentStyles, sheetStyles } from "./styles";
import { sampleHourPoints, sampleModels, samplePlaces } from "./sample";
import { toHourPoints } from "./transform";
import type { ForecastUrl, HourPoint, StationMetadata } from "./types";

const FONT_LINK_ID = "bel-meteogram-nunito";
/** Hours of synthetic data full mode invents in `sample` mode. Real loads are
 *  not capped — they take the whole run (see load()). */
const SAMPLE_FULL_HOURS = 168;
/** How far the chart column's height must move during a resize drag before the
 *  graph is rebuilt. Small enough to read as continuous, large enough that a
 *  long chart's rebuild cost lands a few times per drag rather than per pixel. */
const REFIT_QUANTUM = 12;
/** localStorage key for the map panel's position and size. */
const MAP_PANEL_STATE_KEY = "mimirMapPanelState";
const PANEL_W = 440;
/** At/above this rendered width the panel uses the two-column expanded layout
 *  (weather-now + table left, graph right); below it, the single-column card. */
const EXPAND_THRESHOLD = 700;
const MIN_PANEL_W = 360;
/** One-column stacks now-card + chips + graph vertically, so it needs more
 *  height to stay usable; two-column puts the graph beside the table. */
const MIN_PANEL_H_NARROW = 620;
const MIN_PANEL_H_WIDE = 360;

interface MapPanelPersisted {
  selectedDay?: number;
  /**
   * The scrubbed hour as an ABSOLUTE instant (epoch ms), never as a column
   * index. An index only means something next to the window it was measured in,
   * and this widget builds several — the graph card's `hours` slice, full mode's
   * whole run, the table's per-day groups — so a stored index silently became a
   * different hour depending on which view read it back, and a different hour
   * again once a new run moved where the window starts. A timestamp means the
   * same thing everywhere, and can be checked for having passed.
   *
   * The old `scrubIdx` key is deliberately not read: any value still in
   * localStorage from a previous build is exactly the ambiguous number this
   * replaces, so it is left to rot rather than migrated.
   */
  scrubUtcMs?: number;
  view?: "table" | "graph";
  panelPos?: { x: number; y: number };
  /** User-set panel size (map-panel resize grip). 0/absent → defaults. */
  panelSize?: { w: number; h: number };
}

function readMapPanelState(): MapPanelPersisted {
  try {
    const raw = localStorage.getItem(MAP_PANEL_STATE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw) as MapPanelPersisted;
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

function writeMapPanelState(patch: MapPanelPersisted): void {
  try {
    const prev = readMapPanelState();
    localStorage.setItem(
      MAP_PANEL_STATE_KEY,
      JSON.stringify({ ...prev, ...patch }),
    );
  } catch {
    /* storage unavailable */
  }
}

/** Load Nunito once at document level; document fonts apply inside shadow DOM */
function ensureFont(): void {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap";
  document.head.appendChild(link);
}

/** Names in the WOD API can be plain strings or locale maps */
function localName(
  name: string | { [locale: string]: string },
  lang: string,
): string {
  if (typeof name === "string") return name;
  return name[lang] ?? name.is ?? name.en ?? Object.values(name)[0] ?? "";
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(`bel-meteogram.${key}`, value);
  } catch {
    /* storage unavailable */
  }
}
function stored(key: string): string | null {
  try {
    return localStorage.getItem(`bel-meteogram.${key}`);
  } catch {
    return null;
  }
}

/**
 * A selector that finds "the same control" in a freshly painted body: its first
 * class plus the data attribute that tells its siblings apart (a day, a view, a
 * language, a model). Null for anything without a class to go by.
 */
function focusSelector(el: Element | null): string | null {
  if (!(el instanceof HTMLElement) || !el.classList.length) return null;
  const cls = CSS.escape(el.classList[0]);
  for (const key of ["day", "view", "lang", "model"]) {
    const v = el.dataset[key];
    if (v !== undefined) return `.${cls}[data-${key}="${CSS.escape(v)}"]`;
  }
  return `.${cls}`;
}

/** Whether a key event started in something that takes text input. */
/** The element that scrolls the hourly table, whichever layout is showing
 *  (see paint()). */
const TABLE_SCROLLER = ".ls-scroll, .panel-table";

function isEditableTarget(target: EventTarget | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    // Button-like inputs ignore arrows; text, number, range etc. use them.
    return !["button", "checkbox", "radio", "reset", "submit"].includes(target.type);
  }
  return false;
}

/**
 * <bel-meteogram> — the Belgingur meteogram as a self-contained widget.
 *
 * Two modes:
 *   mode="graph" (default)  the meteogram card only, as before — for the
 *                           landing page's Graph tab and the bottom sheet.
 *   mode="full"             the whole landing experience for embedding:
 *                           location block, settings pill + overlay (model,
 *                           language, station search), "weather now" card,
 *                           Table/Graph segmented control, 7-day accordion
 *                           and the graph card.
 *
 * Attributes:
 *   client-name     client id for the widget config API
 *   api-url         override the config endpoint (default: script origin)
 *   forecast-type   "schedule" | "upstream"
 *   forecast-name   forecast name
 *   forecast-label  host-supplied display name for the active forecast/model,
 *                   overriding the config's name (e.g. a host model picker's
 *                   own label). Repaints in place; no refetch.
 *   domain          domain integer (schedules only)
 *   location-lat    latitude
 *   location-lon    longitude
 *   location-name   optional display name (else nearest station is used)
 *   station-place   full mode: when the host has moved its point onto a
 *                   weather station standing in for a place (a city click
 *                   snapped to the city's station), that place's name…
 *   station-place-km   …and how far the station is from its centre, in km.
 *                   With both set, a quiet line under the coordinates says the
 *                   forecast is for a station that far from the place, in the
 *                   widget's language. Picking a station in the overlay drops
 *                   both. Repaints in place; no refetch.
 *   selected-time   the hour a host's timeline points at, as an absolute UTC
 *                   ISO 8601 instant (e.g. 2026-11-09T15:00:00.000Z). Moves
 *                   the selected hour — the graph cursor, the scrub readout and
 *                   the shown day — but not "the weather now". A time the
 *                   forecast does not cover hides the cursor and says so in
 *                   the readout. Removing it returns to the current hour.
 *                   Repaints in place; no refetch, so a host can step it on
 *                   every timeline tick. Not persisted as the reader's scrub.
 *   hours           graph window, e.g. 48 or 72 (default 48)
 *   language        "is" (default) | "en" | "fo" | "pl" | "es" | "pt"
 *   hide-language   full mode: leave the language choice out of the settings
 *                   overlay — for hosts that set `language` from their own
 *                   language control, so the two can never disagree
 *   hide-models     full mode: leave the forecast model choice out of the
 *                   settings overlay — for hosts that pick the forecast
 *                   themselves (forecast-type/-name/domain) from a config that
 *                   lists several, so the chart follows the host's model
 *   mode            "graph" (default) | "full"
 *   view            initial full-mode view: "table" (default) | "graph"
 *   closable        full mode: render a ✕ button over the location block and
 *                   emit "bel-meteogram-close" when it is pressed — for hosts
 *                   that show the widget as a popup/panel
 *   sample          render generated sample data instead of fetching
 *
 * Events:
 *   "bel-meteogram-status"  CustomEvent fired on every load transition, with
 *                           detail { status: "loading"|"ready"|"error",
 *                           error?: string } — lets a host page clear its own
 *                           spinner or surface the failure.
 *   "bel-meteogram-close"   the closable ✕ was pressed; the host owns the
 *                           dismissal (the widget does not remove itself).
 *   "bel-meteogram-location" CustomEvent fired on every successful load with
 *                           detail { lat, lon, name, tempC, corrections } — the currently
 *                           selected point. Lets a host page place/move its map
 *                           pin when a different station is picked in the
 *                           overlay or set via loadChartLocation(). Bubbles and
 *                           is composed so hosts can listen on the element or
 *                           an ancestor/document.
 *   "bel-meteogram-time"    CustomEvent fired whenever the selected hour
 *                           changes, with detail { time, tempC, source }:
 *                           `time` the selected column's ISO UTC instant (null
 *                           when `selected-time` is outside the forecast),
 *                           `tempC` the temperature as the readout shows it
 *                           (null when outside or missing), and `source` "host"
 *                           (after `selected-time` changes, or a load completes
 *                           with it set) or "user" (a key, tap, click, the end
 *                           of a drag or a rail change — never a mouse hover).
 *                           An unchanged selection is not reported twice.
 *                           Bubbles and is composed.
 *
 * Theming (CSS custom properties, full mode):
 *   --bel-meteogram-bg        page background (default #E7EFF7)
 *   --bel-meteogram-radius    page corner radius (default 0)
 *   --bel-meteogram-backdrop  backdrop-filter, e.g. blur(14px) (default none)
 *   --bel-meteogram-max-width page max width (default 430px mobile, 1120px ≥768px)
 */
export class BelMeteogram extends HTMLElement {
  static observedAttributes = [
    "location-lat",
    "location-lon",
    "hours",
    "language",
    "mode",
    "forecast-label",
    "analysis-time",
    "last-updated",
    "station-place",
    "station-place-km",
    "selected-time",
  ];

  private root: ShadowRoot;
  private body: HTMLDivElement;
  private points: HourPoint[] = [];
  private status: "loading" | "ready" | "error" = "loading";
  private started = false;
  private loadToken = 0;
  /** Cancels the load in flight: a newer load, or the element leaving the page. */
  private loadAbort: AbortController | null = null;
  /** Guards setAttribute calls that must not retrigger load() */
  private suppressAttrCallback = false;

  // Full-mode state
  private rawForecasts: ForecastUrl[] = [];
  private rawStations: StationMetadata[] = [];
  /** Variables the shown forecast has corrected against station observations */
  private corrections: string[] = [];
  /** The station they were corrected for */
  private correctedStation: StationMetadata | null = null;
  private forecastId = "";
  private pickedPlaceName = "";
  private view: "table" | "graph" = "table";
  /** Shared by the mobile day chips and the desktop day list (0 = today) */
  private selectedDay = 0;
  private settingsOpen = false;
  private query = "";
  private scrubIdx = -1; // -1 → default to the "now" hour
  /**
   * A scrubbed hour carried across page loads, as an instant. Kept separately
   * from `scrubIdx` (which stays an index, because that is what the renderers
   * speak) and resolved against whichever series is about to be drawn — see
   * restoreScrubIndex.
   */
  private scrubUtcMs: number | null = null;
  /**
   * The instant the host's `selected-time` selects, or null when the host does
   * not drive the time. Kept apart from `scrubUtcMs` so a host-set time is never
   * persisted as the reader's own scrub (a reload would then fight the host). A
   * committed scrub by the reader moves it too, so a repaint keeps their hour
   * until the host answers with a new `selected-time`.
   */
  private hostTimeMs: number | null = null;
  /** The last `bel-meteogram-time` reported (time|tempC), to skip repeats. */
  private lastTimeKey: string | null = null;
  /** Desktop (two-column) layout when the viewport is ≥ 900px */
  private isWide = false;
  /** Map panel: draggable position within the host */
  private panelPos = { x: -1, y: 18 };
  private resizeRaf = 0;
  /** User-set panel size (0 → use the default 440 × host-height). */
  private panelSize = { w: 0, h: 0 };
  private analysisTime: Date | null = null;
  /**
   * The forecast point's UTC offset in minutes, as the API reports it
   * (`local = UTC + offset`), or null when unknown — sample mode, a failed load,
   * or a response without the field. Kept raw: the chart already has the offset
   * baked into its local timestamps, this is what LABELS which zone those are.
   */
  private tzOffsetMin: number | null = null;
  private lastModified: Date | null = null;
  private graphScrubSetter: ((i: number) => void) | null = null;
  /** The exact series the mounted chart was drawn from, so that anything acting
   *  on a column index (the ←/→ keys) addresses the columns actually on screen */
  private renderedGraphPoints: HourPoint[] = [];
  /** The cursor column that series was drawn with. Not the same as `scrubIdx`:
   *  a cursor restored from `scrubUtcMs` is on screen while `scrubIdx` is still
   *  -1 ("the user has not scrubbed"), and the keys must start from what is
   *  drawn rather than from the sentinel's fallback. */
  private renderedScrubIdx = 0;
  /** Pending {@link scheduleGraphRefit} frame, and the chart height that frame's
   *  predecessor drew at (-1 = no drag in progress). */
  private refitRaf = 0;
  private refitHeight = -1;
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isFull) return;
    // Registered on the document, so this sees every key on the host page too.
    // Arrows and Escape in a text field (our station search, or the host app's
    // own search box) belong to that field, and a key something else already
    // handled — the landscape scrub rail, say — must not act twice.
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Escape closes the settings dialog first — from the search box too — and
    // on every layout, before it can reach the panel-collapse below.
    if (e.key === "Escape" && this.settingsOpen && this.closeOverlay) {
      e.preventDefault();
      this.closeOverlay();
      return;
    }
    if (!this.usesPanel) return;
    if (isEditableTarget(e.composedPath()[0])) return;
    if (e.key === "Escape" && this.isExpanded()) {
      e.preventDefault();
      this.collapsePanel();
      return;
    }
    if (this.view !== "graph" || !this.points.length) return;
    // The series the CHART was built from, not the current one: the keys address
    // columns, and a column number only names an hour next to the exact series
    // it was measured in. A load landing mid-keypress would otherwise step to a
    // different hour than the one the cursor is sitting on.
    const gp = this.renderedGraphPoints;
    if (!gp.length) return;
    // Start from the cursor on screen, which after a restore is NOT column 0.
    let idx = this.scrubIdx >= 0 ? this.scrubIdx : this.renderedScrubIdx;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      idx = Math.max(0, idx - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      idx = Math.min(gp.length - 1, idx + 1);
    } else {
      return;
    }
    this.graphScrubSetter?.(idx);
    this.onUserScrub(gp, idx, true);
  };
  private readonly mql = matchMedia("(min-width: 900px)");
  private readonly onBreakpoint = (): void => {
    if (this.isWide === this.mql.matches) return;
    this.isWide = this.mql.matches;
    if (this.isFull) this.paint();
  };
  /** Full-screen edge-to-edge layout on a phone/tablet held in landscape:
   *  the widget fills the whole modal and uses the graph-led two-column body. */
  private isLandscape = false;
  private readonly mqlLandscape = matchMedia(
    "(hover: none) and (pointer: coarse) and (orientation: landscape)",
  );
  private readonly onLandscape = (): void => {
    if (this.isLandscape === this.mqlLandscape.matches) return;
    this.isLandscape = this.mqlLandscape.matches;
    if (this.isFull) this.paint();
  };
  /** True when the panel layout is used (draggable desktop panel OR the
   *  full-screen landscape sheet) rather than the single-column mobile sheet. */
  private get usesPanel(): boolean {
    return this.isWide || this.isLandscape;
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = componentStyles;
    this.root.appendChild(style);
    this.body = document.createElement("div");
    this.body.className = "bel-root";
    this.root.appendChild(this.body);
  }

  private get isFull(): boolean {
    return this.getAttribute("mode") === "full";
  }

  private get uiLang(): string {
    return (
      this.getAttribute("language") ??
      (this.isFull ? (stored("lang") ?? "is") : "is")
    );
  }

  private get t(): Labels {
    return labels(this.uiLang);
  }

  private get hours(): number {
    const h = parseInt(this.getAttribute("hours") ?? "", 10);
    return Number.isFinite(h) && h > 0 ? h : 48;
  }

  connectedCallback(): void {
    ensureFont();
    this.started = true;
    this.isWide = this.mql.matches;
    this.isLandscape = this.mqlLandscape.matches;
    // Only full mode reads this state, because only full mode writes it (see
    // persistMapPanel). The store is per-origin, so without the guard a plain
    // mode="graph" card embedded next to a Mímir panel would silently adopt that
    // panel's day, view and scrubbed hour — state belonging to a UI it doesn't
    // have. Read once, here: a host that flips `mode` on an already-connected
    // element keeps the defaults rather than picking stored state up late.
    const persisted: MapPanelPersisted = this.isFull ? readMapPanelState() : {};
    if (typeof persisted.selectedDay === "number") {
      this.selectedDay = persisted.selectedDay;
    }
    if (typeof persisted.scrubUtcMs === "number") {
      this.scrubUtcMs = persisted.scrubUtcMs;
    }
    if (persisted.view === "table" || persisted.view === "graph") {
      this.view = persisted.view;
    }
    if (
      persisted.panelPos &&
      typeof persisted.panelPos.x === "number" &&
      typeof persisted.panelPos.y === "number"
    ) {
      this.panelPos = { ...persisted.panelPos };
    }
    if (
      persisted.panelSize &&
      typeof persisted.panelSize.w === "number" &&
      typeof persisted.panelSize.h === "number"
    ) {
      this.panelSize = { ...persisted.panelSize };
    }
    // Default view: Graph on the desktop docked panel, Table on
    // the mobile sheet (v2). An explicit `view` attribute always wins.
    const viewAttr = this.getAttribute("view");
    if (viewAttr === "graph" || viewAttr === "table") {
      this.view = viewAttr;
    } else if (!persisted.view) {
      this.view = this.isWide ? "graph" : "table";
    }
    this.mql.addEventListener("change", this.onBreakpoint);
    this.mqlLandscape.addEventListener("change", this.onLandscape);
    document.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
    this.hostTimeMs = this.selectedTimeAttr();
    this.load();
    // First render can see a stale width/orientation in some embeds; re-check
    // after mount.
    requestAnimationFrame(() => {
      this.onBreakpoint();
      this.onLandscape();
    });
  }

  disconnectedCallback(): void {
    // A load still in flight is cancelled; connecting again starts a new one.
    this.loadAbort?.abort();
    this.loadAbort = null;
    this.mql.removeEventListener("change", this.onBreakpoint);
    this.mqlLandscape.removeEventListener("change", this.onLandscape);
    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    this.cancelGraphRefit();
    // Flush a pending scrub write rather than drop it.
    if (this.persistTimer) this.persistMapPanel();
  }

  /**
   * Keep the draggable panel inside the host on viewport resize. Without this a
   * panel dragged/sized to the right/bottom is left off-screen when the window
   * (map host) shrinks. panelStyleAttr() re-clamps position and size against the
   * live host on every render, so a repaint is all that is needed here.
   * rAF-coalesced so a drag-resize doesn't thrash paint().
   */
  private onResize = (): void => {
    if (!this.isFull || !this.usesPanel) return;
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.paint();
      this.persistMapPanel();
    });
  };

  attributeChangedCallback(name: string): void {
    if (!this.started || this.suppressAttrCallback) return;
    if (name === "selected-time") {
      this.applySelectedTime();
      return;
    }
    // These only change rendered strings (labels / meta footer), not the data.
    if (
      name === "language" ||
      name === "forecast-label" ||
      name === "analysis-time" ||
      name === "last-updated" ||
      name === "station-place" ||
      name === "station-place-km"
    )
      this.paint();
    else this.load();
  }

  /** Point the widget at a new location (kept from the previous widget's API) */
  loadChartLocation(lat: number, lon: number, name = ""): void {
    this.pickedPlaceName = name;
    this.suppressAttrCallback = true;
    this.setAttribute("location-lat", String(lat));
    this.setAttribute("location-lon", String(lon));
    this.suppressAttrCallback = false;
    this.load();
  }

  private emitStatus(error?: string): void {
    this.dispatchEvent(
      new CustomEvent("bel-meteogram-status", {
        detail: { status: this.status, ...(error ? { error } : {}) },
      }),
    );
  }

  /**
   * Announce the currently-selected point so a host page can place/move its
   * map pin. Fired on every successful load — initial, station pick, model
   * change or a programmatic loadChartLocation() — carrying the resolved place
   * name and the "now" temperature so the host can render the pin label
   * ("{place} · {temp}°").
   */
  /** Selector to focus after the next paint, overriding "whatever had focus"
   *  (opening the settings dialog focuses the dialog, closing it the pill). */
  private focusAfterPaint: string | null = null;

  /** Closes the settings dialog while it is open (set by its wiring). */
  private closeOverlay: (() => void) | null = null;

  /** Pending {@link persistScrubSoon} write */
  private persistTimer = 0;

  /**
   * Persist after scrubbing settles. A hover sweep changes column a dozen times
   * a second, and each write is a synchronous localStorage read, parse,
   * stringify and write on the pointer-move path.
   */
  private persistScrubSoon(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persistMapPanel(), 250);
  }

  private persistMapPanel(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = 0;
    if (!this.isFull || !this.usesPanel) return;
    // While a host drives the time, the day and hour on screen are the host's,
    // not the reader's: leave the reader's stored ones as they were.
    const time: MapPanelPersisted =
      this.hostTimeMs === null
        ? { selectedDay: this.selectedDay, scrubUtcMs: this.scrubUtcMs ?? undefined }
        : {};
    writeMapPanelState({
      ...time,
      view: this.view,
      panelPos:
        this.panelPos.x >= 0
          ? { x: this.panelPos.x, y: this.panelPos.y }
          : undefined,
      panelSize:
        this.panelSize.w > 0
          ? { w: this.panelSize.w, h: this.panelSize.h }
          : undefined,
    });
  }

  /** Available host width/height (fallbacks keep sample/detached states sane). */
  private hostW(): number {
    return this.clientWidth || 900;
  }
  private hostH(): number {
    return this.clientHeight || 840;
  }

  /** Rendered panel width after resolving defaults + clamping to the host. */
  private resolvedPanelW(): number {
    const w = this.panelSize.w > 0 ? this.panelSize.w : PANEL_W;
    return Math.max(MIN_PANEL_W, Math.min(this.hostW() - 24, w));
  }

  /** Minimum panel height for the current layout (one-column needs more). */
  private minPanelH(): number {
    const min =
      this.resolvedPanelW() >= EXPAND_THRESHOLD
        ? MIN_PANEL_H_WIDE
        : MIN_PANEL_H_NARROW;
    return Math.min(min, this.hostH() - 24);
  }

  /** Rendered panel height after resolving defaults + clamping to the host. */
  private resolvedPanelH(): number {
    const maxH = this.hostH() - 24;
    // Default tall enough to hold the full 1-column meteogram (now-card, chips,
    // tabs, chart with wind lane, legend, meta) without clipping.
    const def = Math.min(840, maxH);
    const h = this.panelSize.h > 0 ? this.panelSize.h : def;
    return Math.max(this.minPanelH(), Math.min(maxH, h));
  }

  /** Two-column layout once the panel is at least EXPAND_THRESHOLD wide. */
  private isExpanded(): boolean {
    return this.resolvedPanelW() >= EXPAND_THRESHOLD;
  }

  /** Collapse back to the default single-column card (keeps position). */
  private collapsePanel(): void {
    this.panelSize = { w: 0, h: 0 };
    this.persistMapPanel();
    this.paint();
  }

  /** Inset kept around a maximised panel so the map still frames it and the
   *  reader can see they are looking at a panel rather than a new page. */
  private static readonly MAXIMISE_INSET = 18;

  /**
   * Fill the host, less a thin margin.
   *
   * This used to stop at 920×760 regardless of the window, which on a wide
   * screen left the control labelled "fullscreen" opening something under half
   * the width — and the chart still scrolling at 11% of a five-day run. A
   * maximise that does not maximise is worse than none: the reader concludes
   * that is all the room there is and stops looking for more.
   */
  private expandPanel(): void {
    const inset = BelMeteogram.MAXIMISE_INSET;
    this.panelPos = { x: inset, y: inset };
    this.panelSize = {
      w: Math.max(MIN_PANEL_W, this.hostW() - inset * 2),
      h: Math.max(MIN_PANEL_H_WIDE, this.hostH() - inset * 2),
    };
    this.persistMapPanel();
    this.paint();
  }

  private metaLine(t: Labels): string {
    // A host can override the model run / update time read from meteogram.json
    // with the `analysis-time` / `last-updated` attributes (ISO 8601).
    const anaAttr = this.getAttribute("analysis-time");
    const anaDate = anaAttr ? new Date(anaAttr) : this.analysisTime;
    const updAttr = this.getAttribute("last-updated");
    const updDate = updAttr ? new Date(updAttr) : this.lastModified;
    const fmt = (d: Date | null): string =>
      d && !isNaN(d.getTime()) ? formatUtcMetaTime(d, t) : "–";
    return t.metaLine(fmt(anaDate), fmt(updDate));
  }

  /**
   * Inline left/top/width/height for the draggable panel. Resolves the user's
   * size (or defaults), clamps both size and position to the live host box —
   * so a stored size/position that is now off-screen (window shrunk or reload
   * at a smaller size) snaps back in — and writes the clamped position back.
   */
  private panelStyleAttr(): string {
    const hostW = this.hostW();
    const hostH = this.hostH();
    const w = this.resolvedPanelW();
    const h = this.resolvedPanelH();
    const raw =
      this.panelPos.x >= 0
        ? this.panelPos
        : { x: hostW - w - 18, y: Math.min(48, Math.max(18, Math.round(hostH * 0.02))) };
    const x = Math.max(0, Math.min(hostW - w, raw.x));
    const y = Math.max(0, Math.min(hostH - h, raw.y));
    this.panelPos = { x, y };
    return ` style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"`;
  }

  private emitLocation(): void {
    const lat = parseFloat(this.getAttribute("location-lat") ?? "");
    const lon = parseFloat(this.getAttribute("location-lon") ?? "");
    if (isNaN(lat) || isNaN(lon)) return;
    const name = this.placeName(this.placeList(lat, lon), lat, lon, this.t);
    const nowTemp = this.points[nowIndex(this.points)]?.tempC ?? null;
    this.dispatchEvent(
      new CustomEvent("bel-meteogram-location", {
        detail: {
          lat,
          lon,
          name,
          tempC: nowTemp === null ? null : Math.round(nowTemp),
          // API variables corrected against station observations ([] = none)
          corrections: this.corrections,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async load(): Promise<void> {
    const token = ++this.loadToken;
    this.loadAbort?.abort();
    const abort = new AbortController();
    this.loadAbort = abort;
    const { signal } = abort;
    // Drop the scrubbed COLUMN but keep the instant it stood for (scrubUtcMs).
    // A load can hand us a different series — another model, a coarser timestep,
    // a shorter window — where the same column number is a different hour. Let
    // paint() resolve the instant against whatever actually arrives; if it no
    // longer fits, restoreScrubIndex declines and we open at now.
    this.scrubIdx = -1;
    // A finished load reports the host's hour afresh: the point (and so its
    // temperature) may be new even where the instant is not.
    this.lastTimeKey = null;

    if (this.hasAttribute("sample")) {
      this.corrections = [];
      this.correctedStation = null;
      this.points = sampleHourPoints(
        this.isFull ? SAMPLE_FULL_HOURS : this.hours,
      );
      if (this.isFull) {
        this.rawForecasts = sampleModels.map((m) => ({ ...m, url: "" }));
        this.rawStations = samplePlaces.map((p, i) => ({
          id: `sample-${i}`,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
        }));
        if (!this.forecastId) this.forecastId = sampleModels[0].id;
      }
      const now = new Date();
      this.lastModified = now;
      this.analysisTime = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      this.status = "ready";
      this.followHostTime();
      this.paint();
      this.emitStatus();
      this.emitLocation();
      this.emitHostTime();
      return;
    }

    const lat = parseFloat(this.getAttribute("location-lat") ?? "");
    const lon = parseFloat(this.getAttribute("location-lon") ?? "");
    if (isNaN(lat) || isNaN(lon)) {
      this.status = "error";
      this.paint();
      this.emitStatus("missing location-lat/location-lon");
      return;
    }

    this.status = "loading";
    this.paint();
    this.emitStatus();

    const opts: ApiOptions = {
      clientName: this.getAttribute("client-name") ?? "",
      apiUrl: this.getAttribute("api-url") ?? undefined,
      user: this.getAttribute("api-user") ?? undefined,
      password: this.getAttribute("api-password") ?? undefined,
    };

    try {
      const forecasts = await loadConfig(opts, signal);
      const attrPath = forecastPath(
        this.getAttribute("forecast-type"),
        this.getAttribute("forecast-name"),
        this.getAttribute("domain"),
      );
      const path =
        this.forecastId ||
        attrPath ||
        (this.isFull ? (stored("model") ?? "") : "");
      let forecast = findForecast(forecasts, path);
      // A remembered model that no longer exists falls back to the first;
      // an explicit attribute pointing nowhere is a configuration error.
      if (!forecast && path !== attrPath) forecast = forecasts[0];
      if (!forecast) throw new Error(`forecast not found: ${path}`);
      this.forecastId = forecast.id;

      const meta = await loadForecastMetadata(forecast.url, signal);
      // Full mode takes the whole run: no `duration` on the request and no cap
      // on the transform, so the window is whatever the forecast actually has —
      // three days from a short-range model, a fortnight from a long one. Graph
      // mode keeps its `hours` window so a card embed still downloads two days,
      // not two weeks.
      const windowH = this.isFull ? Infinity : this.hours;
      const hours = this.isFull ? undefined : this.hours;
      // A point on (or next to) a station the config lists by ref takes the
      // station's data, which the API corrects against its observations where
      // it can. Should that endpoint fail, the plain point forecast still shows.
      const station = hasStationEndpoint(meta)
        ? refStationAt(meta.stations ?? [], lat, lon)
        : null;
      const data = station
        ? await loadMeteogramData(
            stationDataUrl(meta, lat, lon, hours, station.extra?.ref),
            opts,
            signal,
          ).catch((err: unknown) => {
            if (signal.aborted) throw err;
            console.warn("bel-meteogram: station data failed, using the point", err);
            return loadMeteogramData(stationDataUrl(meta, lat, lon, hours), opts, signal);
          })
        : await loadMeteogramData(stationDataUrl(meta, lat, lon, hours), opts, signal);
      if (token !== this.loadToken) return; // superseded by a newer load
      this.rawForecasts = forecasts;
      this.rawStations = meta.stations ?? [];
      this.corrections = Object.keys(data.data.meta?.corrections ?? {});
      this.correctedStation = this.corrections.length ? station : null;
      this.points = toHourPoints(data.data, windowH);
      const offset = data.data.meta?.location_timezone_offset;
      this.tzOffsetMin = typeof offset === "number" ? offset : null;
      const times = runTimes(
        data.data,
        data.lastModified,
        this.points[0]?.utcMs,
      );
      this.analysisTime = times.analysisTime;
      this.lastModified = times.lastModified;
      this.status = this.points.length ? "ready" : "error";
      if (this.status === "ready") this.followHostTime();
      this.paint();
      this.emitStatus(this.points.length ? undefined : "empty forecast");
      if (this.status === "ready") {
        this.emitLocation();
        this.emitHostTime();
      }
    } catch (err) {
      // Superseded by a newer load, or cancelled because the element left the
      // page: nothing to show. A request that timed out is not cancelled; it
      // fails, and ends in the error state with Retry below.
      if (token !== this.loadToken || signal.aborted) return;
      console.error("bel-meteogram: failed to load forecast", err);
      this.status = "error";
      this.paint();
      this.emitStatus(err instanceof Error ? err.message : String(err));
    }
  }

  // ---- Painting ----

  /**
   * Which layout regime the panel is in. One definition, because paintFull and
   * the resize refit have to agree: landscape phones/tablets get the
   * full-screen edge-to-edge sheet, the 900px breakpoint drives the floating
   * desktop panel, and only that panel expands to two columns (a short
   * landscape phone can't fit them).
   */
  private layoutFlags(): {
    landscape: boolean;
    wide: boolean;
    expanded: boolean;
  } {
    const landscape = this.isLandscape;
    return {
      landscape,
      wide: this.isWide || landscape,
      expanded:
        this.status === "ready" &&
        this.isWide &&
        !landscape &&
        this.isExpanded(),
    };
  }

  /**
   * Re-render the graph column mid-drag, so a resize shows the chart you are
   * choosing instead of snapping to it when you let go.
   *
   * Two economies keep the drag smooth: one rebuild per frame at most, and only
   * once the column's height has moved by {@link REFIT_QUANTUM}. A long chart is
   * ~8ms of HTML parse on its own, so rebuilding it every pixel would drop
   * frames — the panel box tracks the pointer continuously, the chart follows in
   * small steps, and the settle paint on release lands on the exact height.
   */
  private scheduleGraphRefit(): void {
    if (this.refitRaf) return;
    this.refitRaf = requestAnimationFrame(() => {
      this.refitRaf = 0;
      const box = this.body.querySelector<HTMLElement>(".chart-fit");
      const h = box?.clientHeight ?? 0;
      if (!h || Math.abs(h - this.refitHeight) < REFIT_QUANTUM) return;
      this.refitHeight = h;
      // Hold the horizontal scroll: the chart is a scroller whose width does not
      // change with height, so re-rendering must not send the reader back to
      // hour zero (same reason paint() restores it).
      const prevLeft =
        this.body.querySelector<HTMLElement>(".chart-scroll")?.scrollLeft ?? 0;
      const { landscape, wide, expanded } = this.layoutFlags();
      this.paintGraphHost(landscape, expanded, wide, this.t);
      if (prevLeft > 0) {
        const next = this.body.querySelector<HTMLElement>(".chart-scroll");
        if (next) next.scrollLeft = prevLeft;
      }
    });
  }

  /**
   * Draw the expanded graph again for its column's current height, when the
   * chart asks (renderMapPanelGraph's onRedraw): the column changed height
   * with nothing resized, e.g. once the panel's web font has loaded. On the
   * next frame, sharing the refit frame, so a drag's refit and this one don't
   * both run, and holding the horizontal scroll as a refit does.
   */
  private redrawGraphForColumn(): void {
    if (this.refitRaf) return;
    this.refitRaf = requestAnimationFrame(() => {
      this.refitRaf = 0;
      const prevLeft =
        this.body.querySelector<HTMLElement>(".chart-scroll")?.scrollLeft ?? 0;
      const { landscape, wide, expanded } = this.layoutFlags();
      this.paintGraphHost(landscape, expanded, wide, this.t);
      if (prevLeft > 0) {
        const next = this.body.querySelector<HTMLElement>(".chart-scroll");
        if (next) next.scrollLeft = prevLeft;
      }
    });
  }

  /** Drop any pending refit frame — the caller is about to repaint anyway. */
  private cancelGraphRefit(): void {
    if (this.refitRaf) cancelAnimationFrame(this.refitRaf);
    this.refitRaf = 0;
    this.refitHeight = -1;
  }

  private paint(): void {
    // Preserve the table's scroll position across the re-render. Picking a
    // different day (or a host's selected-time on another day) rebuilds
    // innerHTML, which would otherwise snap the scroll back to the top, the
    // night hours. `.ls-scroll` scrolls the landscape sheet's table column
    // (the .panel-table inside it doesn't scroll, and comes later in the
    // tree); `.panel-table` scrolls itself in the docked panel and the
    // expanded layout. Only present in table layouts, so a graph paint is a
    // no-op here.
    const prevScroller = this.body.querySelector<HTMLElement>(TABLE_SCROLLER);
    const prevTop = prevScroller?.scrollTop ?? 0;
    // Also hold the graph's horizontal scroll: in the expanded two-column view
    // the graph shows all 48 h and doesn't change when you pick a different day
    // on the left, but the re-render re-centres it — so it appeared to jump to a
    // random spot. Restoring scrollLeft keeps it exactly where it was.
    const prevGraph = this.body.querySelector<HTMLElement>(".chart-scroll");
    const prevLeft = prevGraph?.scrollLeft ?? 0;
    // And the day-chip row: tapping a chip scrolled off to the right rebuilt
    // the row at scrollLeft 0, hiding the chip just picked.
    const prevChipsLeft =
      this.body.querySelector<HTMLElement>(".day-chips")?.scrollLeft ?? 0;
    // Focus lives on an element this repaint is about to throw away, which
    // would drop a keyboard user back to the top of the page after every chip,
    // tab or language press. Remember it by what it IS, not by node.
    const focusSel = this.focusAfterPaint ?? focusSelector(this.root.activeElement);
    this.focusAfterPaint = null;
    if (this.isFull) this.paintFull();
    else this.paintGraph();
    const chips = this.body.querySelector<HTMLElement>(".day-chips");
    if (chips) {
      chips.scrollLeft = prevChipsLeft;
      const sel = chips.querySelector<HTMLElement>(".day-chip.sel");
      if (sel) {
        const pad = parseFloat(getComputedStyle(chips).scrollPaddingLeft) || 0;
        const left = sel.offsetLeft - chips.offsetLeft - pad;
        const right = sel.offsetLeft - chips.offsetLeft + sel.offsetWidth + pad;
        if (left < chips.scrollLeft) chips.scrollLeft = left;
        else if (right > chips.scrollLeft + chips.clientWidth)
          chips.scrollLeft = right - chips.clientWidth;
      }
    }
    if (focusSel) {
      this.body.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
    }
    if (prevTop > 0) {
      const nextScroller = this.body.querySelector<HTMLElement>(TABLE_SCROLLER);
      if (nextScroller) nextScroller.scrollTop = prevTop;
    }
    if (prevLeft > 0) {
      const nextGraph = this.body.querySelector<HTMLElement>(".chart-scroll");
      if (nextGraph) nextGraph.scrollLeft = prevLeft;
    }
  }

  private paintGraph(): void {
    const t = this.t;
    this.graphScrubSetter = null;
    const head = `
      <div class="head">
        <div class="title">${esc(forecastSpanLabel(this.points, t) || t.nextHours(this.hours))}</div>
        <div class="hint">${esc(t.swipe)}</div>
      </div>`;

    if (this.status === "loading") {
      this.body.innerHTML = `<div class="card">${head}<div class="skeleton"></div><div class="loading-label">${esc(t.loading)}</div></div>`;
      return;
    }
    if (this.status === "error") {
      this.body.innerHTML = `<div class="card">${head}<div class="error"><div class="error-msg">${esc(t.error)}</div><button class="retry">${esc(t.retry)}</button></div></div>`;
      this.body.querySelector(".retry")?.addEventListener("click", () => this.load());
      return;
    }

    // This series starts at the analysis time, so "now" is a column in, not
    // column 0 — and a restored scrub resolves against THIS window rather than
    // whichever one wrote it.
    const points = this.points;
    const initial = this.selectedColumn(points);
    this.renderedScrubIdx = initial;
    const { setScrubIdx } = renderGraphCard(
      this.body,
      points,
      t,
      initial,
      (i, committed) => this.onUserScrub(points, i, committed),
      { previewHover: () => this.hostTimeMs !== null },
    );
    this.graphScrubSetter = setScrubIdx;
  }

  private models(): ModelOption[] {
    const lang = this.uiLang;
    // A host that already names the model (e.g. Mímir's model picker) can pass
    // `forecast-label` to show its own label for the active forecast instead of
    // the config's name. Only the active forecast is relabelled; any other
    // models the config offers keep their own names.
    const label = this.getAttribute("forecast-label")?.trim();
    return this.rawForecasts.map((f) => ({
      id: f.id,
      name: label && f.id === this.forecastId ? label : localName(f.name, lang),
    }));
  }

  /**
   * Stations for the settings overlay, ordered nearest-first to the current
   * point so the selected place and its neighbours top the list.
   *
   * Each place carries the distance it was sorted by, which the list then shows.
   * The order was right before and still looked arbitrary, because nothing on
   * screen said what it was — a reader who cannot see the rule assumes there
   * isn't one.
   */
  private placeList(lat: number, lon: number): Place[] {
    const lang = this.uiLang;
    const places: Place[] = this.rawStations.map((s) => ({
      name: localName(s.name, lang),
      lat: s.lat,
      lon: s.lon,
    }));
    if (!isNaN(lat) && !isNaN(lon)) {
      for (const p of places) p.distanceKm = distanceKm(lat, lon, p.lat, p.lon);
      places.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }
    return places;
  }

  /** The panel's title for the current point, and where it came from (see
   *  {@link placeTitle}). */
  private placeTitle(places: Place[], lat: number, lon: number, t: Labels): PlaceTitle {
    return placeTitle({
      locationName: this.getAttribute("location-name"),
      pickedName: this.pickedPlaceName,
      preferCoordinates: this.hasAttribute("prefer-coordinates"),
      places,
      lat,
      lon,
      t,
    });
  }

  /** Display name for the current point: the panel's title. */
  private placeName(places: Place[], lat: number, lon: number, t: Labels): string {
    return this.placeTitle(places, lat, lon, t).name;
  }

  /**
   * Resolve the carried-over scrub instant to a column of `points`, or -1 for
   * "no opinion — open at now". The rules live in indexAtInstant; declining is
   * the common case and it is the right one, since the alternative is reopening
   * the widget on an hour that has already happened.
   */
  private restoreScrubIndex(points: HourPoint[]): number {
    return this.scrubUtcMs === null
      ? -1
      : indexAtInstant(points, this.scrubUtcMs);
  }

  /** Remember a scrubbed column as the instant it stands for (see scrubUtcMs).
   *  A column with no point behind it is not recorded at all: keeping the index
   *  while dropping the instant would leave the two disagreeing, which is the
   *  state this pairing exists to prevent. */
  private noteScrub(points: HourPoint[], i: number): void {
    const p = points[i];
    if (!p) return;
    this.scrubIdx = i;
    this.scrubUtcMs = p.utcMs;
  }

  /** The `selected-time` attribute as epoch ms, or null when absent or not a
   *  date. Read as an absolute instant: an ISO string without an offset would
   *  be local time, which is why hosts pass UTC ("…Z"). */
  private selectedTimeAttr(): number | null {
    const raw = this.getAttribute("selected-time");
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }

  /**
   * The selected column of `points`: the host's hour while it drives the time
   * (-1 when the forecast has no column for it), otherwise the reader's scrub,
   * or "now".
   */
  private selectedColumn(points: HourPoint[]): number {
    if (this.hostTimeMs !== null) return columnAtTime(points, this.hostTimeMs);
    const carried =
      this.scrubIdx >= 0 ? this.scrubIdx : this.restoreScrubIndex(points);
    return Math.max(
      0,
      Math.min(points.length - 1, carried >= 0 ? carried : nowIndex(points)),
    );
  }

  /**
   * `selected-time` changed: move the selection in place, without a reload. A
   * timeline in playback sets this on every step, so the common case only moves
   * the mounted chart's cursor and readout; the panel is repainted only when
   * the hour crosses into another day and the day chips must follow.
   */
  private applySelectedTime(): void {
    this.hostTimeMs = this.selectedTimeAttr();
    // Whatever the reader scrubbed before is not what is selected now; with the
    // attribute gone the selection goes back to the current hour.
    this.scrubIdx = -1;
    if (this.hostTimeMs === null) this.scrubUtcMs = null;
    // Mid-load there is nothing to move; the load reports the hour when done.
    if (this.status !== "ready" || !this.points.length) return;
    const gp = this.graphPoints();
    const col = this.selectedColumn(gp);
    // paint() keeps the chart's old scroll position, so the setter still runs
    // after it: that is what brings the new hour into view.
    if (this.followSelectedDay(gp, col) && this.body.querySelector(".day-chip")) {
      this.paint();
    }
    this.graphScrubSetter?.(col);
    this.renderedScrubIdx = col;
    this.emitTime(gp, col, "host");
  }

  /** Before a fresh paint: show the day holding the host's hour. */
  private followHostTime(): void {
    if (this.hostTimeMs === null) return;
    const gp = this.graphPoints();
    this.followSelectedDay(gp, this.selectedColumn(gp));
  }

  /** After a load: report the host's hour against the new series. */
  private emitHostTime(): void {
    if (this.hostTimeMs === null) return;
    const gp = this.graphPoints();
    this.emitTime(gp, this.selectedColumn(gp), "host");
  }

  /** Point the day chips / table at the day holding column `col`. True when
   *  the day changed. Hours outside the listed days leave it alone. */
  private followSelectedDay(points: HourPoint[], col: number): boolean {
    const p = points[col];
    if (!this.isFull || !p) return false;
    const days = groupDays(this.points, this.t, currentIndex(this.points));
    const day = days.findIndex((d) => d.hours.includes(p));
    if (day < 0 || day === this.selectedDay) return false;
    this.selectedDay = day;
    return true;
  }

  /**
   * The reader moved the cursor. Without a host driving the time this is the
   * reader's own scrub, remembered and persisted as before. While a host drives
   * it, a hover is only a preview and a committed move becomes the selection.
   * Committed moves are reported either way, so a host can follow the reader.
   */
  private onUserScrub(points: HourPoint[], i: number, committed: boolean): void {
    this.renderedScrubIdx = i;
    if (this.hostTimeMs === null) {
      this.noteScrub(points, i);
      this.persistScrubSoon();
    } else if (committed && points[i]) {
      this.hostTimeMs = points[i].utcMs;
    }
    if (committed) this.emitTime(points, i, "user");
  }

  /** Fire `bel-meteogram-time` for column `col`, unless it repeats the last. */
  private emitTime(points: HourPoint[], col: number, source: TimeSource): void {
    const detail = timeEventDetail(points, col, source);
    const key = `${detail.time}|${detail.tempC}`;
    if (key === this.lastTimeKey) return;
    this.lastTimeKey = key;
    this.dispatchEvent(
      new CustomEvent("bel-meteogram-time", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The graph window shown in the full-mode card / panel: the whole run, the
   * hours already elapsed included.
   *
   * It used to start at "now", and that is what put the present hour under the
   * sticky lane chips: with no columns to the left of it, the cursor cannot be
   * centred (or scrolled) away from the chrome pinned to the left edge, because
   * scrollLeft has nowhere to go. Keeping the elapsed hours gives the view
   * something to spend on the left, and matches both the meteogram card and the
   * day table beside it, which have always listed them.
   */
  private graphPoints(): HourPoint[] {
    return this.points;
  }

  private closeBtnHtml(cls: string, t: Labels): string {
    return `
      <button class="${cls}" type="button" aria-label="${esc(t.close)}">
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/><line x1="13" y1="3" x2="3" y2="13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>`;
  }

  private paintFull(): void {
    const t = this.t;
    const lang = this.uiLang;
    const lat = parseFloat(this.getAttribute("location-lat") ?? "");
    const lon = parseFloat(this.getAttribute("location-lon") ?? "");
    const models = this.models();
    const places = this.placeList(lat, lon);
    const title = this.placeTitle(places, lat, lon, t);
    const place = title.name;
    const model = models.find((m) => m.id === this.forecastId) ?? models[0];
    // Matched on position, not on the displayed name. With `prefer-coordinates`
    // (which Mimir always sets) the header shows a coordinate, so a name
    // comparison never matched and NO station ever showed its check-mark — not
    // even the one the reader had just picked from this list. A tolerance of
    // ~1e-4° is about 10m: close enough to mean "this station", far enough not
    // to claim an arbitrary map click as one.
    const selectedPlace: Place | null =
      places.find(
        (p) => Math.abs(p.lat - lat) < 1e-4 && Math.abs(p.lon - lon) < 1e-4,
      ) ??
      places.find((p) => p.name === place) ??
      null;
    const closable = this.hasAttribute("closable");
    const { landscape, wide, expanded } = this.layoutFlags();

    const summary = panelSummary({
      modelName: model?.name ?? "…",
      // The landscape sheet hides the title block; elsewhere the title names it.
      place: chipPlace(title, !landscape),
      lang: lang.toUpperCase(),
      tzOffsetMin: this.tzOffsetMin,
    });
    // Coordinates under a place's name only: under a title that is the
    // coordinates they would repeat it. The badge stays either way.
    const sub = locationSubHtml(
      lat,
      lon,
      title.source,
      this.status === "ready" && this.correctedStation
        ? correctedBadgeHtml(
            this.corrections,
            localName(this.correctedStation.name, lang),
            t,
          )
        : "",
      t,
    );
    const note = stationPlaceNoteHtml(
      this.getAttribute("station-place"),
      parseFloat(this.getAttribute("station-place-km") ?? ""),
      t,
    );

    let body = "";
    if (this.status === "loading") {
      body = `<div class="sk sk-now"></div><div class="sk-rows"><div class="sk sk-row"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`;
    } else if (this.status === "error") {
      body = `<div class="graph-wrap" style="padding-top:12px"><div class="card"><div class="error"><div class="error-msg">${esc(t.error)}</div><button class="retry">${esc(t.retry)}</button></div></div></div>`;
    } else {
      const nowI = nowIndex(this.points);
      const days = groupDays(this.points, t, currentIndex(this.points));
      const si = Math.max(0, Math.min(days.length - 1, this.selectedDay));
      body = landscape
        ? this.landscapeBodyHtml(days, si, this.points[nowI], t)
        : expanded
          ? this.expandedBodyHtml(days, si, this.points[nowI], t)
          : wide
            ? this.desktopBodyHtml(days, si, this.points[nowI], t)
            : this.mobileBodyHtml(days, si, this.points[nowI], t);
    }

    // The overlay is a sibling of .page, not a child: .page can carry a
    // backdrop-filter (glass theming), which would turn position:fixed
    // descendants into page-relative ones and strand the dialog partway
    // down the scrollable content.
    const overlay = this.settingsOpen
      ? overlayHtml(
          models,
          this.forecastId,
          lang,
          places,
          selectedPlace,
          this.query,
          t,
          !this.hasAttribute("hide-language"),
          !this.hasAttribute("hide-models"),
        )
      : "";

    const cls = `page ${wide ? "wide wide-2a" : "narrow"}${expanded ? " is-expanded" : ""}${landscape ? " is-fullscreen" : ""}${closable ? " page--closable" : ""} view-${this.view}`;
    const meta =
      this.status === "ready" && wide ? metaFooterHtml(this.metaLine(t)) : "";
    // Landscape pins the panel to fill the modal (CSS), so it carries no inline
    // size and offers no resize grip; the docked desktop panel keeps both.
    const panelStyle = landscape ? "" : this.panelStyleAttr();
    // Two resize grips: bottom-left grows into the map on the left,
    // bottom-right grows to the right. Both carry a visible corner bracket +
    // resize cursor; a one-time pulse (added in wireFull) hints they're draggable.
    // The readout's maximise button is the one-step alternative (expandPanel).
    const resizeGrip = landscape
      ? ""
      : `<div class="panel-resize panel-resize-bl" data-resize-handle data-corner="bl" role="separator" aria-label="Resize" title="${esc(t.resize)}"></div>
         <div class="panel-resize panel-resize-br" data-resize-handle data-corner="br" role="separator" aria-label="Resize" title="${esc(t.resize)}"></div>`;
    // Desktop: draggable panel with the panel graph. Mobile: sheet.
    const page = wide
      ? `<div class="${cls}"${panelStyle}>
           ${draggablePanelHeaderHtml(summary, closable, t)}
           <section class="panel-loc">
             <div class="panel-loc-name">${esc(place)}</div>
             <div class="panel-loc-sub">${sub}</div>
             ${note}
           </section>
           ${body}
           ${meta}
           ${resizeGrip}
         </div>`
      : `<div class="${cls}">
           ${closable ? this.closeBtnHtml("page-close", t) : ""}
           <section class="loc">
             <h1 class="loc-name">${esc(place)}</h1>
             <div class="loc-sub">${sub}</div>
             ${note}
           </section>
           <div class="pill-wrap">${pillHtml(summary)}</div>
           ${body}
         </div>`;

    this.body.innerHTML = `${page}${overlay}`;
    this.wireFull(places, models, selectedPlace);
    this.paintGraphHost(landscape, expanded, wide, t);
  }

  /**
   * Render the graph into `.graph-host` from current state.
   *
   * Split out of {@link paintFull} because a resize drag re-runs THIS and not
   * the whole panel: the chart's geometry is resolved against the height it is
   * given (see renderMapPanelGraph), so it has to be rebuilt when that height
   * changes, and rebuilding the panel around it would throw away the day
   * table's scroll position and the wiring mid-drag.
   */
  private paintGraphHost(
    landscape: boolean,
    expanded: boolean,
    wide: boolean,
    t: Labels,
  ): void {
    const host = this.body.querySelector<HTMLElement>(".graph-host");
    if (host && this.status === "ready") {
      const gp = this.graphPoints();
      this.renderedGraphPoints = gp;
      // The window opens at the run's start, not at "now", so the current hour
      // is a column part-way in — both the cursor's home and what the "now"
      // marker is drawn against.
      const initial = this.selectedColumn(gp);
      this.renderedScrubIdx = initial;
      const previewHover = (): boolean => this.hostTimeMs !== null;
      if (wide) {
        const { setScrubIdx } = renderMapPanelGraph(host, gp, {
          scrubIdx: initial,
          nowIdx: nowMarkerIndex(gp),
          onScrub: (i, committed) => this.onUserScrub(gp, i, committed),
          previewHover,
          onFullscreen: () => {
            // The graph's toggle grows/shrinks the same panel in place.
            if (this.isExpanded()) this.collapsePanel();
            else this.expandPanel();
          },
          onRedraw: () => this.redrawGraphForColumn(),
          // Landscape uses the two-column body but the COMPACT chart geometry
          // (~262px) as the fit base — its natural height is close to the short
          // landscape column, so scaling to fit stays legible (scaling the tall
          // 560px fullscreen chart into ~200px would shrink the labels too far).
          expanded: landscape ? false : expanded,
          // Scale that chart to the available height so it fills the screen
          // edge-to-edge instead of clipping/scrolling vertically.
          fit: landscape,
          // Fold the analysis / last-update line into the graph's legend row
          // (both landscape and desktop). The standalone .meta-footer is then
          // hidden in graph view via CSS so it isn't shown twice.
          metaLine: this.metaLine(t),
          t,
        });
        this.graphScrubSetter = setScrubIdx;
      } else {
        const { setScrubIdx } = renderGraphCard(
          host,
          gp,
          t,
          initial,
          (i, committed) => this.onUserScrub(gp, i, committed),
          { previewHover },
        );
        this.graphScrubSetter = setScrubIdx;
      }
    } else {
      this.renderedGraphPoints = [];
      this.renderedScrubIdx = 0;
      this.graphScrubSetter = null;
    }
  }

  /**
   * Expanded ("bigger") panel body: two columns — left = compact now-card,
   * day chips and the hourly table; right = the panel graph (rendered into
   * .graph-host, which brings its own scrub/hover readout). Reuses the docked
   * builders so the existing day-chip wiring drives day switching here too.
   * The meta footer is appended after this by paint(), i.e. below both columns.
   */
  private expandedBodyHtml(
    days: DayGroup[],
    si: number,
    nowPoint: HourPoint,
    t: Labels,
  ): string {
    return `
      <div class="exp-body">
        <div class="exp-left">
          <div class="now-wrap">${nowCardHtml(nowPoint, t, 44, 50)}</div>
          ${dayChipsHtml(days, si, false)}
          ${panelTableHtml(days[si], t)}
        </div>
        <div class="exp-right">
          <div class="graph-view graph-view-2a"><div class="graph-host"></div></div>
        </div>
      </div>`;
  }

  /**
   * Desktop draggable panel body: compact now card, equal-width
   * day chips, Table/Graph switch, table or panel meteogram.
   */
  private desktopBodyHtml(
    days: DayGroup[],
    si: number,
    nowPoint: HourPoint,
    t: Labels,
  ): string {
    const content =
      this.view === "table"
        ? panelTableHtml(days[si], t)
        : `<div class="graph-view graph-view-2a"><div class="graph-host"></div></div>`;
    return `
      ${nowCardHtml(nowPoint, t, 46, 58)}
      ${dayChipsHtml(days, si, false)}
      <div class="tabs">
        <button class="tab${this.view === "table" ? " on" : ""}" type="button" data-view="table" aria-pressed="${this.view === "table"}">${esc(t.table)}</button>
        <button class="tab${this.view === "graph" ? " on" : ""}" type="button" data-view="graph" aria-pressed="${this.view === "graph"}">${esc(t.graph)}</button>
      </div>
      ${content}`;
  }

  /** Mobile body: now card + Table/Graph control + chips/card or meteogram */
  private mobileBodyHtml(
    days: DayGroup[],
    si: number,
    nowPoint: HourPoint,
    t: Labels,
  ): string {
    const content =
      this.view === "table"
        ? `${dayChipsHtml(days, si)}<div class="sel-wrap">${selDayCardHtml(days[si], t)}</div>`
        : `<div class="graph-wrap"><div class="graph-host"></div></div>`;
    return `
      <div class="now-wrap">${nowCardHtml(nowPoint, t)}</div>
      <div class="tabs">
        <button class="tab${this.view === "table" ? " on" : ""}" type="button" data-view="table" aria-pressed="${this.view === "table"}">${esc(t.table)}</button>
        <button class="tab${this.view === "graph" ? " on" : ""}" type="button" data-view="graph" aria-pressed="${this.view === "graph"}">${esc(t.graph)}</button>
      </div>
      ${content}`;
  }

  /**
   * Landscape full-screen body: a single view with a Table/Graph toggle (a short
   * phone in landscape can't fit two columns). Graph → the meteogram fills the
   * whole sheet (full width + fit-scaled height). Table → weather-now card, day
   * chips and the hourly table in one scrolling column.
   */
  private landscapeBodyHtml(
    days: DayGroup[],
    si: number,
    nowPoint: HourPoint,
    t: Labels,
  ): string {
    const isGraph = this.view === "graph";
    const tabs = `
      <div class="tabs">
        <button class="tab${isGraph ? "" : " on"}" type="button" data-view="table" aria-pressed="${!isGraph}">${esc(t.table)}</button>
        <button class="tab${isGraph ? " on" : ""}" type="button" data-view="graph" aria-pressed="${isGraph}">${esc(t.graph)}</button>
      </div>`;
    const content = isGraph
      ? `<div class="graph-view graph-view-2a"><div class="graph-host"></div></div>`
      : `<div class="ls-scroll">
           <div class="now-wrap">${nowCardHtml(nowPoint, t, 40, 46)}</div>
           ${dayChipsHtml(days, si, true)}
           ${panelTableHtml(days[si], t)}
         </div>`;
    return `${tabs}${content}`;
  }

  private wireFull(
    places: Place[],
    models: ModelOption[],
    selectedPlace: Place | null,
  ): void {
    const q = <T extends Element>(sel: string): T | null =>
      this.body.querySelector(sel) as T | null;

    q<HTMLButtonElement>(".page-close, .header-close")?.addEventListener(
      "click",
      () => {
        this.dispatchEvent(new CustomEvent("bel-meteogram-close"));
      },
    );
    q<HTMLButtonElement>(".pill")?.addEventListener("click", () => {
      this.settingsOpen = true;
      // Into the dialog, not onto the search box: focusing an input would pop
      // the keyboard up over the dialog on a phone.
      this.focusAfterPaint = ".overlay";
      this.paint();
    });
    q<HTMLButtonElement>(".retry")?.addEventListener("click", () => this.load());

    // Mobile Table/Graph control
    for (const tab of this.body.querySelectorAll<HTMLButtonElement>(".tab[data-view]")) {
      tab.addEventListener("click", () => {
        const view = tab.dataset.view as "table" | "graph";
        if (view !== this.view) {
          this.view = view;
          this.persistMapPanel();
          this.paint();
        }
      });
    }

    // Day chips (mobile card / desktop panel table)
    for (const chip of this.body.querySelectorAll<HTMLButtonElement>(".day-chip[data-day]")) {
      chip.addEventListener("click", () => {
        const i = parseInt(chip.dataset.day ?? "", 10);
        if (i !== this.selectedDay) {
          this.selectedDay = i;
          this.persistMapPanel();
          this.paint();
        }
      });
    }

    // Map panel: drag the panel by its header. Skipped in landscape, where
    // the panel is pinned full-screen (no drag/resize).
    const dragHandle = q<HTMLElement>("[data-drag-handle]");
    const page = q<HTMLElement>(".page.wide-2a");
    if (!this.isLandscape && dragHandle && page) {
      let drag: { sx: number; sy: number; px: number; py: number } | null = null;
      const clampPos = (x: number, y: number): { x: number; y: number } => {
        const hostW = this.clientWidth || page.offsetWidth;
        const hostH = this.clientHeight || page.offsetHeight;
        const pw = page.offsetWidth;
        const ph = page.offsetHeight;
        return {
          x: Math.max(0, Math.min(hostW - pw, x)),
          y: Math.max(0, Math.min(hostH - ph, y)),
        };
      };
      const onMove = (e: PointerEvent): void => {
        if (!drag || e.buttons === 0) return;
        const next = clampPos(
          drag.px + e.clientX - drag.sx,
          drag.py + e.clientY - drag.sy,
        );
        this.panelPos = next;
        page.style.left = `${next.x}px`;
        page.style.top = `${next.y}px`;
      };
      const onUp = (): void => {
        if (!drag) return;
        drag = null;
        this.persistMapPanel();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      dragHandle.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const rect = page.getBoundingClientRect();
        const hostRect = this.getBoundingClientRect();
        try {
          dragHandle.setPointerCapture(e.pointerId);
        } catch {
          /* unsupported */
        }
        drag = {
          sx: e.clientX,
          sy: e.clientY,
          px: rect.left - hostRect.left,
          py: rect.top - hostRect.top,
        };
        this.panelPos = { x: drag.px, y: drag.py };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });

      // Map-panel: resize the panel from EITHER bottom corner.
      //  · bottom-left  grip anchors the top-RIGHT corner → grows into the open
      //    map space on the left + downward.
      //  · bottom-right grip anchors the top-LEFT corner → grows right + down.
      // WYSIWYG reflow: the layout reflows (1-col ⇄ 2-col at
      // EXPAND_THRESHOLD) DURING the drag, the instant the width crosses the
      // breakpoint — so the released layout is exactly what the preview showed.
      // The pointer listeners live on `window` (not the grip), so a mid-drag
      // repaint that swaps out the panel element doesn't interrupt the drag; we
      // just re-query the live panel each move.
      const wireResizeGrip = (grip: HTMLElement, corner: "bl" | "br"): void => {
        let rz:
          | { left: number; top: number; rightEdge: number; expanded: boolean }
          | null = null;
        const rzMove = (e: PointerEvent): void => {
          if (!rz || e.buttons === 0) return;
          const pg = this.body.querySelector<HTMLElement>(".page.wide-2a");
          if (!pg) return;
          const hostRect = this.getBoundingClientRect();
          const hostW = this.clientWidth || hostRect.width;
          const hostH = this.clientHeight || hostRect.height;
          const px = e.clientX - hostRect.left;
          const py = e.clientY - hostRect.top;
          let left = rz.left;
          let w: number;
          if (corner === "bl") {
            left = Math.max(0, Math.min(rz.rightEdge - MIN_PANEL_W, px));
            w = Math.min(hostW - 8, rz.rightEdge - left);
          } else {
            w = Math.max(MIN_PANEL_W, Math.min(hostW - rz.left - 8, px - rz.left));
          }
          // One-column (below the breakpoint) needs more height to stay usable.
          const minH = Math.min(
            w >= EXPAND_THRESHOLD ? MIN_PANEL_H_WIDE : MIN_PANEL_H_NARROW,
            hostH - rz.top - 8,
          );
          const h = Math.max(minH, Math.min(hostH - rz.top - 8, py - rz.top));
          this.panelPos = { x: left, y: rz.top };
          this.panelSize = { w, h };
          const expandedNow = w >= EXPAND_THRESHOLD;
          if (expandedNow !== rz.expanded) {
            // Crossed the 1-col/2-col breakpoint: reflow now so the preview
            // matches the eventual release. panelStyleAttr() applies the new box
            // from panelPos/panelSize; the drag continues via the window
            // listeners even though this replaces the grip element.
            rz.expanded = expandedNow;
            this.paint();
          } else {
            // Same layout regime: cheap inline box resize — the panel chrome and
            // the table reflow via CSS, so only the chart needs redrawing, and
            // that is throttled rather than run per pointermove.
            pg.style.left = `${left}px`;
            pg.style.width = `${w}px`;
            pg.style.height = `${h}px`;
            this.scheduleGraphRefit();
          }
        };
        const rzUp = (): void => {
          if (!rz) return;
          rz = null;
          window.removeEventListener("pointermove", rzMove);
          window.removeEventListener("pointerup", rzUp);
          this.persistMapPanel();
          this.cancelGraphRefit();
          this.paint(); // settle: exact height, and the panel chrome with it
        };
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = page.getBoundingClientRect();
          const hostRect = this.getBoundingClientRect();
          try {
            grip.setPointerCapture(e.pointerId);
          } catch {
            /* unsupported */
          }
          rz = {
            left: rect.left - hostRect.left,
            top: rect.top - hostRect.top,
            rightEdge: rect.right - hostRect.left,
            expanded: this.isExpanded(),
          };
          window.addEventListener("pointermove", rzMove);
          window.addEventListener("pointerup", rzUp);
        });
      };
      const grips =
        this.body.querySelectorAll<HTMLElement>("[data-resize-handle]");
      for (const grip of grips) {
        wireResizeGrip(grip, grip.dataset.corner === "br" ? "br" : "bl");
      }
      // First-ever open: pulse the grips once so users discover the panel is
      // resizable. Persisted so it shows only once.
      if (grips.length && !stored("resizeHintSeen")) {
        grips.forEach((g) => g.classList.add("hint"));
        store("resizeHintSeen", "1");
      }
    }

    // Settings overlay
    this.closeOverlay = null;
    const backdrop = q<HTMLElement>(".backdrop");
    if (!backdrop) return;
    const closeOverlay = (): void => {
      this.settingsOpen = false;
      this.query = "";
      this.focusAfterPaint = ".pill";
      this.paint();
    };
    this.closeOverlay = closeOverlay;
    // aria-modal promises focus stays inside: wrap Tab at both ends.
    const dialog = q<HTMLElement>(".overlay");
    dialog?.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>("button, input, [tabindex='0']"),
      ].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = this.root.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeOverlay();
    });
    q<HTMLButtonElement>(".overlay-close")?.addEventListener("click", closeOverlay);

    for (const chip of backdrop.querySelectorAll<HTMLButtonElement>(".chip[data-model]")) {
      chip.addEventListener("click", () => {
        const model = models[parseInt(chip.dataset.model ?? "", 10)];
        if (!model || model.id === this.forecastId) return;
        this.forecastId = model.id;
        store("model", model.id);
        this.load(); // overlay stays open through the reload
      });
    }
    for (const chip of backdrop.querySelectorAll<HTMLButtonElement>(".chip[data-lang]")) {
      chip.addEventListener("click", () => {
        const lang = chip.dataset.lang ?? "is";
        if (lang === this.uiLang) return;
        this.suppressAttrCallback = true;
        this.setAttribute("language", lang);
        this.suppressAttrCallback = false;
        store("lang", lang);
        this.paint(); // strings re-render, overlay stays open
      });
    }

    const search = q<HTMLInputElement>(".station-search");
    const list = q<HTMLElement>(".station-list");
    search?.addEventListener("input", () => {
      this.query = search.value;
      if (list) {
        list.innerHTML = stationRowsHtml(places, selectedPlace, this.query, this.t);
      }
    });
    list?.addEventListener("click", (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>(".station");
      if (!row) return;
      const p = places[parseInt(row.dataset.station ?? "", 10)];
      if (!p) return;
      // The host's name for its point, and its note about the station it was
      // moved to, describe that point, not the station picked here.
      this.suppressAttrCallback = true;
      this.removeAttribute("location-name");
      this.removeAttribute("station-place");
      this.removeAttribute("station-place-km");
      this.suppressAttrCallback = false;
      this.pickedPlaceName = p.name;
      this.settingsOpen = false;
      this.query = "";
      this.loadChartLocation(p.lat, p.lon, p.name);
    });
  }

  /**
   * Open the meteogram as a bottom sheet for a selected point.
   * The sheet supplies the title (place name) and close affordances
   * (button, scrim tap, drag down); the card internals are identical
   * to the inline widget.
   */
  static openSheet(options: {
    title: string;
    attributes: Record<string, string>;
  }): HTMLElement {
    const sheet = document.createElement("bel-meteogram-sheet") as BelMeteogramSheet;
    sheet.configure(options.title, options.attributes);
    document.body.appendChild(sheet);
    return sheet;
  }
}

class BelMeteogramSheet extends HTMLElement {
  private root = this.attachShadow({ mode: "open" });
  /** Where focus was when the sheet opened; it goes back there on close. */
  private returnFocus: HTMLElement | null = null;
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      this.close();
    }
  };

  configure(title: string, attributes: Record<string, string>): void {
    const style = document.createElement("style");
    style.textContent = sheetStyles;

    const scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="grabber"></div>
        <div class="sheet-head">
          <div class="sheet-title"></div>
          <button class="close" type="button" aria-label="${esc(labels(attributes.language ?? "").close)}">
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="#16324A" stroke-width="2.2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>`;
    scrim.querySelector(".sheet-title")!.textContent = title;

    const widget = document.createElement("bel-meteogram");
    for (const [name, value] of Object.entries(attributes)) {
      widget.setAttribute(name, value);
    }
    const sheet = scrim.querySelector(".sheet") as HTMLDivElement;
    sheet.appendChild(widget);

    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) this.close();
    });
    scrim.querySelector(".close")!.addEventListener("click", () => this.close());
    this.dragToDismiss(sheet);

    this.root.append(style, scrim);
  }

  connectedCallback(): void {
    // A modal takes focus on open (and gives it back on close), or a keyboard
    // or screen-reader user is left behind it on the page.
    const active = document.activeElement;
    this.returnFocus = active instanceof HTMLElement ? active : null;
    document.addEventListener("keydown", this.onKeyDown);
    this.root.querySelector<HTMLButtonElement>(".close")?.focus({ preventScroll: true });
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private dragToDismiss(sheet: HTMLDivElement): void {
    let startY = 0;
    let dy = 0;
    let dragging = false;
    sheet.addEventListener("pointerdown", (e) => {
      // Only drag from the top chrome so the chart can still scroll. Guard the
      // whole chart row, not just the scroller: the pinned axis strips are
      // siblings of `.scroll`, and a press on one must not dismiss the sheet.
      if ((e.target as HTMLElement).closest(".mg-chart")) return;
      dragging = true;
      startY = e.clientY;
      sheet.setPointerCapture(e.pointerId);
      sheet.style.transition = "none";
    });
    sheet.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const release = (): void => {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "";
      if (dy > 90) {
        this.close();
      } else {
        sheet.style.transform = "";
      }
      dy = 0;
    };
    sheet.addEventListener("pointerup", release);
    sheet.addEventListener("pointercancel", release);
  }

  close(): void {
    this.remove();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
  }
}

customElements.define("bel-meteogram", BelMeteogram);
customElements.define("bel-meteogram-sheet", BelMeteogramSheet);

declare global {
  interface HTMLElementTagNameMap {
    "bel-meteogram": BelMeteogram;
    "bel-meteogram-sheet": BelMeteogramSheet;
  }
}
