import {
  findForecast,
  forecastPath,
  loadConfig,
  loadForecastMetadata,
  loadMeteogramData,
  stationDataUrl,
  type ApiOptions,
} from "./api";
import {
  indexAtInstant,
  nowIndex,
  renderGraphCard,
  timestepHours,
} from "./graph-card";
import { labels, type Labels } from "./i18n";
import {
  coordLabel,
  dayChipsHtml,
  draggablePanelHeaderHtml,
  formatUtcMetaTime,
  groupDays,
  metaFooterHtml,
  nowCardHtml,
  overlayHtml,
  panelTableHtml,
  pillHtml,
  selDayCardHtml,
  stationRowsHtml,
  type DayGroup,
  type ModelOption,
  type Place,
} from "./landing";
import { renderMapPanelGraph } from "./map-panel-graph";
import { esc } from "./render";
import { componentStyles, sheetStyles } from "./styles";
import { sampleHourPoints, sampleModels, samplePlaces } from "./sample";
import { toHourPoints } from "./transform";
import type { ForecastUrl, HourPoint, StationMetadata } from "./types";

const FONT_LINK_ID = "bel-meteogram-nunito";
/** Hours fetched in full mode so the table can show a week */
const FULL_MODE_HOURS = 168;
/** Map-panel 2a persisted state key (development.md §7) */
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
   * and this widget builds three different ones — the graph card counts from the
   * forecast's analysis time, `graphPoints()` counts from now, the table groups
   * by day — so a stored index silently became a different hour depending on
   * which view read it back, and a different hour again tomorrow. A timestamp
   * means the same thing everywhere, and can be checked for having passed.
   *
   * The old `scrubIdx` key is deliberately not read: any value still in
   * localStorage from a previous build is exactly the ambiguous number this
   * replaces, so it is left to rot rather than migrated.
   */
  scrubUtcMs?: number;
  view?: "table" | "graph";
  panelPos?: { x: number; y: number };
  /** User-set panel size (map-panel 2a resize grip). 0/absent → defaults. */
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
 * <bel-meteogram> — the Mimir mobile handoff as a self-contained widget.
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
 *   hours           graph window, e.g. 48 or 72 (default 48)
 *   language        "is" (default) | "en"
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
 *                           detail { lat, lon, name, tempC } — the currently
 *                           selected point. Lets a host page place/move its map
 *                           pin when a different station is picked in the
 *                           overlay or set via loadChartLocation(). Bubbles and
 *                           is composed so hosts can listen on the element or
 *                           an ancestor/document.
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
  ];

  private root: ShadowRoot;
  private body: HTMLDivElement;
  private points: HourPoint[] = [];
  private status: "loading" | "ready" | "error" = "loading";
  private started = false;
  private loadToken = 0;
  /** Guards setAttribute calls that must not retrigger load() */
  private suppressAttrCallback = false;

  // Full-mode state (handoff "State Management")
  private rawForecasts: ForecastUrl[] = [];
  private rawStations: StationMetadata[] = [];
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
  /** Desktop (two-column) layout when the viewport is ≥ 900px */
  private isWide = false;
  /** Map-panel 2a: draggable position within the host */
  private panelPos = { x: -1, y: 18 };
  private resizeRaf = 0;
  /** User-set panel size (0 → use the default 440 × host-height). */
  private panelSize = { w: 0, h: 0 };
  private analysisTime: Date | null = null;
  private lastModified: Date | null = null;
  private graphScrubSetter: ((i: number) => void) | null = null;
  /** The exact series the mounted chart was drawn from, so that anything acting
   *  on a column index (the ←/→ keys) addresses the columns actually on screen */
  private renderedGraphPoints: HourPoint[] = [];
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isFull || !this.usesPanel) return;
    if (e.key === "Escape" && this.isExpanded()) {
      e.preventDefault();
      this.collapsePanel();
      return;
    }
    if (this.view !== "graph" || !this.points.length) return;
    // The window the CHART was built from, not a freshly computed one:
    // graphPoints() slices from "now", so recomputing it here would shift every
    // column by one the moment the hour rolls over while the panel is open —
    // and then this index would address a different hour than the one on screen.
    const gp = this.renderedGraphPoints;
    if (!gp.length) return;
    let idx = this.scrubIdx >= 0 ? this.scrubIdx : 0;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      idx = Math.max(0, idx - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      idx = Math.min(gp.length - 1, idx + 1);
    } else {
      return;
    }
    this.noteScrub(gp, idx);
    this.graphScrubSetter?.(idx);
    this.persistMapPanel();
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
    // Default view: Graph on the desktop docked panel (map-panel 2a), Table on
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
    this.load();
    // First render can see a stale width/orientation in some embeds; re-check
    // after mount.
    requestAnimationFrame(() => {
      this.onBreakpoint();
      this.onLandscape();
    });
  }

  disconnectedCallback(): void {
    this.mql.removeEventListener("change", this.onBreakpoint);
    this.mqlLandscape.removeEventListener("change", this.onLandscape);
    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
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
    // These only change rendered strings (labels / meta footer), not the data.
    if (
      name === "language" ||
      name === "forecast-label" ||
      name === "analysis-time" ||
      name === "last-updated"
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
   * ("{place} · {temp}°" per the map-panel handoff).
   */
  private persistMapPanel(): void {
    if (!this.isFull || !this.usesPanel) return;
    writeMapPanelState({
      selectedDay: this.selectedDay,
      scrubUtcMs: this.scrubUtcMs ?? undefined,
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
    // tabs, chart with wind lane, legend, meta) without clipping (task B1).
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

  /** Expand to a comfortable two-column size, anchored to the panel's current
   *  right edge so it opens into the map space on the left. */
  private expandPanel(): void {
    const w = Math.min(920, this.hostW() - 24);
    const h = Math.min(760, this.hostH() - 24);
    const rightEdge =
      (this.panelPos.x >= 0 ? this.panelPos.x : this.hostW() - PANEL_W - 18) +
      this.resolvedPanelW();
    this.panelPos = {
      x: Math.max(0, rightEdge - w),
      y: this.panelPos.y >= 0 ? this.panelPos.y : 24,
    };
    this.panelSize = { w, h };
    this.persistMapPanel();
    this.paint();
  }

  private metaLine(t: Labels): string {
    // A host (Mímir) can pass the authoritative model run / update time from its
    // own manifest via the `analysis-time` / `last-updated` attributes (ISO,
    // UTC). Those win over values derived from the widget's own meteogram.json,
    // which may not carry them reliably (task C2).
    const anaAttr = this.getAttribute("analysis-time");
    const anaDate = anaAttr ? new Date(anaAttr) : this.analysisTime;
    const updAttr = this.getAttribute("last-updated");
    const updDate = updAttr ? new Date(updAttr) : this.lastModified;
    const fmt = (d: Date | null): string =>
      d && !isNaN(d.getTime()) ? formatUtcMetaTime(d, t) : "–";
    return t.metaLine(fmt(anaDate), fmt(updDate));
  }

  private analysisIndex(points: HourPoint[]): number {
    if (!this.analysisTime || !points.length) return 0;
    const target = this.analysisTime.getTime();
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].utcMs - target);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
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
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async load(): Promise<void> {
    const token = ++this.loadToken;
    // Drop the scrubbed COLUMN but keep the instant it stood for (scrubUtcMs).
    // A load can hand us a different series — another model, a coarser timestep,
    // a shorter window — where the same column number is a different hour. Let
    // paint() resolve the instant against whatever actually arrives; if it no
    // longer fits, restoreScrubIndex declines and we open at now.
    this.scrubIdx = -1;

    if (this.hasAttribute("sample")) {
      this.points = sampleHourPoints(this.isFull ? FULL_MODE_HOURS : this.hours);
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
      this.paint();
      this.emitStatus();
      this.emitLocation();
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
      const forecasts = await loadConfig(opts);
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

      const meta = await loadForecastMetadata(forecast.url);
      const duration = this.isFull
        ? Math.max(this.hours, FULL_MODE_HOURS)
        : this.hours;
      const data = await loadMeteogramData(
        stationDataUrl(meta, lat, lon, duration),
        opts,
      );
      if (token !== this.loadToken) return; // superseded by a newer load
      this.rawForecasts = forecasts;
      this.rawStations = meta.stations ?? [];
      this.points = toHourPoints(data.data, duration);
      // "Last update" prefers the body's last_modified, then the HTTP header.
      this.lastModified = data.data.last_modified
        ? new Date(data.data.last_modified)
        : (data.lastModified ?? new Date());
      // "Greiningartími" is the model run / analysis time. Use the response's
      // analysis_time (UTC ISO) when present; the old fallback to points[0] (the
      // first forecast step) was an hour off whenever the forecast lead ≠ 0.
      this.analysisTime = data.data.analysis_time
        ? new Date(data.data.analysis_time)
        : this.points.length > 0
          ? new Date(this.points[0].utcMs)
          : this.lastModified;
      this.status = this.points.length ? "ready" : "error";
      this.paint();
      this.emitStatus(this.points.length ? undefined : "empty forecast");
      if (this.status === "ready") this.emitLocation();
    } catch (err) {
      if (token !== this.loadToken) return;
      console.error("bel-meteogram: failed to load forecast", err);
      this.status = "error";
      this.paint();
      this.emitStatus(err instanceof Error ? err.message : String(err));
    }
  }

  // ---- Painting ----

  private paint(): void {
    // Preserve the table column's scroll position across the re-render. Picking
    // a different day rebuilds innerHTML, which would otherwise snap the scroll
    // back to the top (the now-card) — the user wants to stay where they were.
    // `.ls-scroll` is the landscape table column; `.exp-left` the desktop
    // expanded column. Only present in table layouts, so a graph paint is a
    // no-op here.
    const prevScroller = this.body.querySelector<HTMLElement>(
      ".ls-scroll, .exp-left",
    );
    const prevTop = prevScroller?.scrollTop ?? 0;
    // Also hold the graph's horizontal scroll: in the expanded two-column view
    // the graph shows all 48 h and doesn't change when you pick a different day
    // on the left, but the re-render re-centres it — so it appeared to jump to a
    // random spot. Restoring scrollLeft keeps it exactly where it was.
    const prevGraph = this.body.querySelector<HTMLElement>(".yr-scroll");
    const prevLeft = prevGraph?.scrollLeft ?? 0;
    if (this.isFull) this.paintFull();
    else this.paintGraph();
    if (prevTop > 0) {
      const nextScroller = this.body.querySelector<HTMLElement>(
        ".ls-scroll, .exp-left",
      );
      if (nextScroller) nextScroller.scrollTop = prevTop;
    }
    if (prevLeft > 0) {
      const nextGraph = this.body.querySelector<HTMLElement>(".yr-scroll");
      if (nextGraph) nextGraph.scrollLeft = prevLeft;
    }
  }

  private paintGraph(): void {
    const t = this.t;
    const head = `
      <div class="head">
        <div class="title">${esc(t.nextHours(this.points.length || this.hours))}</div>
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
    const carried =
      this.scrubIdx >= 0 ? this.scrubIdx : this.restoreScrubIndex(this.points);
    const initial = carried >= 0 ? carried : nowIndex(this.points);
    renderGraphCard(this.body, this.points, t, initial, (i) => {
      this.noteScrub(this.points, i);
    });
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
   */
  private placeList(lat: number, lon: number): Place[] {
    const lang = this.uiLang;
    const places = this.rawStations.map((s) => ({
      name: localName(s.name, lang),
      lat: s.lat,
      lon: s.lon,
    }));
    if (!isNaN(lat) && !isNaN(lon)) {
      const d = (p: Place): number =>
        (p.lat - lat) ** 2 + (p.lon - lon) ** 2 * 0.2;
      places.sort((a, b) => d(a) - d(b));
    }
    return places;
  }

  /** Display name for the current point: attribute → picked → coordinate (when
   *  `prefer-coordinates` is set) → nearest station. Hosts that pin an exact
   *  map click (e.g. Mimir) set `prefer-coordinates` so the clicked lat/lon is
   *  shown verbatim and never snapped to the nearest station. */
  private placeName(places: Place[], lat: number, lon: number, t: Labels): string {
    const attr = this.getAttribute("location-name");
    if (attr) return attr;
    if (this.pickedPlaceName) return this.pickedPlaceName;
    // Without a valid point we can't measure distances — fall back to the first
    // known station (avoids rendering "NaN°N NaN°E" in sample / partial states).
    if (isNaN(lat) || isNaN(lon)) return places[0]?.name ?? "";
    if (this.hasAttribute("prefer-coordinates")) return coordLabel(lat, lon, t);
    let best: Place | null = null;
    let bd = Infinity;
    for (const p of places) {
      const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2 * 0.2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best?.name ?? coordLabel(lat, lon, t);
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

  /** The graph window (from "now") shown in the meteogram card / panel */
  private graphPoints(): HourPoint[] {
    const nowI = nowIndex(this.points);
    const count = Math.ceil(this.hours / timestepHours(this.points));
    return this.points.slice(nowI, nowI + count);
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
    const place = this.placeName(places, lat, lon, t);
    const model = models.find((m) => m.id === this.forecastId) ?? models[0];
    const selectedPlace: Place | null =
      places.find((p) => p.name === place) ?? null;
    const closable = this.hasAttribute("closable");
    // Landscape phones/tablets get a full-screen edge-to-edge sheet that reuses
    // the panel layout; the 900px desktop breakpoint drives the floating panel.
    const landscape = this.isLandscape;
    const wide = this.isWide || landscape;

    const summary = `${model?.name ?? "…"} · ${place} · ${lang.toUpperCase()}`;
    const sub = isNaN(lat) || isNaN(lon) ? "" : esc(coordLabel(lat, lon, t));

    // Expanded ("bigger") panel: past the width breakpoint the desktop draggable
    // panel uses a two-column layout (weather-now + table left, graph right).
    // Landscape does NOT expand — a short phone can't fit two columns, so it uses
    // a single full-screen view with a Table/Graph toggle instead (below).
    const expanded =
      this.status === "ready" && this.isWide && !landscape && this.isExpanded();
    let body = "";
    if (this.status === "loading") {
      body = `<div class="sk sk-now"></div><div class="sk-rows"><div class="sk sk-row"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`;
    } else if (this.status === "error") {
      body = `<div class="graph-wrap" style="padding-top:12px"><div class="card"><div class="error"><div class="error-msg">${esc(t.error)}</div><button class="retry">${esc(t.retry)}</button></div></div></div>`;
    } else {
      const nowI = nowIndex(this.points);
      const days = groupDays(this.points, t, nowI);
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
      ? overlayHtml(models, this.forecastId, lang, places, selectedPlace, this.query, t)
      : "";

    const cls = `page ${wide ? "wide wide-2a" : "narrow"}${expanded ? " is-expanded" : ""}${landscape ? " is-fullscreen" : ""}${closable ? " page--closable" : ""} view-${this.view}`;
    const meta =
      this.status === "ready" && wide ? metaFooterHtml(this.metaLine(t)) : "";
    // Landscape pins the panel to fill the modal (CSS), so it carries no inline
    // size and offers no resize grip; the docked desktop panel keeps both.
    const panelStyle = landscape ? "" : this.panelStyleAttr();
    // Two resize grips (task B2): bottom-left grows into the map on the left,
    // bottom-right grows to the right. Both carry a visible corner bracket +
    // resize cursor; a one-time pulse (added in wireFull) hints they're draggable.
    // TODO(B2): true full-screen is intentionally out of scope for this pass —
    // resizing from either corner is the primary "make it bigger" mechanism.
    const resizeGrip = landscape
      ? ""
      : `<div class="panel-resize panel-resize-bl" data-resize-handle data-corner="bl" role="separator" aria-label="Resize" title="${esc(t.resize)}"></div>
         <div class="panel-resize panel-resize-br" data-resize-handle data-corner="br" role="separator" aria-label="Resize" title="${esc(t.resize)}"></div>`;
    // Desktop (map-panel 2a): draggable panel with yr-style graph. Mobile: v2 sheet.
    const page = wide
      ? `<div class="${cls}"${panelStyle}>
           ${draggablePanelHeaderHtml(summary, closable, t)}
           <section class="panel-loc">
             <div class="panel-loc-name">${esc(place)}</div>
             <div class="panel-loc-sub">${sub}</div>
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
           </section>
           <div class="pill-wrap">${pillHtml(summary)}</div>
           ${body}
         </div>`;

    this.body.innerHTML = `${page}${overlay}`;
    this.wireFull(places, models, selectedPlace);

    const host = this.body.querySelector<HTMLElement>(".graph-host");
    if (host && this.status === "ready") {
      const gp = this.graphPoints();
      this.renderedGraphPoints = gp;
      // `gp` starts at now, so 0 IS the current hour here — the fallback differs
      // from graph mode's only because the window does.
      const carried =
        this.scrubIdx >= 0 ? this.scrubIdx : this.restoreScrubIndex(gp);
      const initial = carried >= 0 ? carried : 0;
      if (wide) {
        const { setScrubIdx } = renderMapPanelGraph(host, gp, {
          scrubIdx: Math.max(0, Math.min(gp.length - 1, initial)),
          nowIdx: 0,
          anaIdx: this.analysisIndex(gp),
          onScrub: (i) => {
            this.noteScrub(gp, i);
            this.persistMapPanel();
          },
          onFullscreen: () => {
            // The graph's toggle grows/shrinks the same panel in place.
            if (this.isExpanded()) this.collapsePanel();
            else this.expandPanel();
          },
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
        renderGraphCard(host, gp, t, initial, (i) => {
          this.noteScrub(gp, i);
        });
        this.graphScrubSetter = null;
      }
    } else {
      this.renderedGraphPoints = [];
      this.graphScrubSetter = null;
    }
  }

  /**
   * Expanded ("bigger") panel body: two columns — left = compact now-card,
   * day chips and the hourly table; right = the yr-style graph (rendered into
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
   * Desktop draggable panel body (map-panel 2a): compact now card, equal-width
   * day chips, Table/Graph switch, table or yr-style meteogram.
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
        <button class="tab${this.view === "table" ? " on" : ""}" type="button" data-view="table">${esc(t.table)}</button>
        <button class="tab${this.view === "graph" ? " on" : ""}" type="button" data-view="graph">${esc(t.graph)}</button>
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
        <button class="tab${this.view === "table" ? " on" : ""}" type="button" data-view="table">${esc(t.table)}</button>
        <button class="tab${this.view === "graph" ? " on" : ""}" type="button" data-view="graph">${esc(t.graph)}</button>
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
        <button class="tab${isGraph ? "" : " on"}" type="button" data-view="table">${esc(t.table)}</button>
        <button class="tab${isGraph ? " on" : ""}" type="button" data-view="graph">${esc(t.graph)}</button>
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

    // Map-panel 2a: drag the panel by its header. Skipped in landscape, where
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

      // Map-panel 2a: resize the panel from EITHER bottom corner (task B2).
      //  · bottom-left  grip anchors the top-RIGHT corner → grows into the open
      //    map space on the left + downward.
      //  · bottom-right grip anchors the top-LEFT corner → grows right + down.
      // WYSIWYG reflow (task B4): the layout reflows (1-col ⇄ 2-col at
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
            // Same layout regime: cheap inline box resize (no repaint).
            pg.style.left = `${left}px`;
            pg.style.width = `${w}px`;
            pg.style.height = `${h}px`;
          }
        };
        const rzUp = (): void => {
          if (!rz) return;
          rz = null;
          window.removeEventListener("pointermove", rzMove);
          window.removeEventListener("pointerup", rzUp);
          this.persistMapPanel();
          this.paint(); // settle: re-render the graph at the final size
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
      // resizable (task B2 discoverability). Persisted so it shows only once.
      if (grips.length && !stored("resizeHintSeen")) {
        grips.forEach((g) => g.classList.add("hint"));
        store("resizeHintSeen", "1");
      }
    }

    // Settings overlay
    const backdrop = q<HTMLElement>(".backdrop");
    if (!backdrop) return;
    const closeOverlay = (): void => {
      this.settingsOpen = false;
      this.query = "";
      this.paint();
    };
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
      this.removeAttribute("location-name");
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
          <button class="close" aria-label="close">
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
