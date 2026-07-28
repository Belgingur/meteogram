# bel-meteogram

A framework-agnostic **Web Component** — `<bel-meteogram>` — that renders a
Belgingur meteogram: stacked temperature, precipitation and wind lanes sharing
one hour axis, with a time scrubber and a pinned readout card. It has two
modes:

1. **`mode="graph"` (default)** — the Graph-view meteogram card:
   stacked labelled lanes, the v3 **scrubber** (time cursor) and the pinned
   **scrub readout card**. Renders inline (e.g. inside a landing page's
   Graph tab) or as a popup / bottom sheet via `BelMeteogram.openSheet()`.
2. **`mode="full"`** — the whole landing experience for embedding on other
   sites: **responsive** with a JS breakpoint at 900 px.
   - **Below 900 px — mobile sheet (responsive v2):** location block,
     settings pill + **settings overlay**, "weather now" card, **Table/Graph
     segmented control**, a horizontally-scrolling **day-chip row** and one
     fixed selected-day card.
   - **900 px and up — docked panel (map panel 1b):** a single fixed-width
     (~420 px) panel meant to float over a map. A header with a
     forecast/location **selector chip** (opens the same overlay) + close ✕,
     a left-aligned location block, a compact "weather now" card, a
     horizontally-scrolling **day-chip row**, a **Table/Graph switch**
     (defaults to Graph), and either the selected day's 24-hour table or a
     **compact meteogram**. The panel owns its own scroll; the host docks it.

   Settings (forecast model, language, station search — stations ordered
   nearest-first) live in the overlay. All wired to real Belgingur WRF data.

Compared to the previous Belgingur meteogram widget (Lit + Vega + Leaflet),
this build is vanilla TypeScript with a hand-built SVG renderer and no runtime
dependencies. Everything — styles and the production yr.no-style weather symbol
set — is inlined into **one JS file** (~44 kB gzipped).

## Design spec highlights

- 34 px per hour, fixed — the card scrolls horizontally, never shrinks to fit.
- SVG height 358, **stacked labelled lanes** sharing one hour axis, showing
  all five variables of the current site's meteogram:
  - Day header (labels y 12) with dashed day boundaries.
  - Weather symbols every 2 h.
  - **Scrub track** at y 39 between the symbols and the temp lane.
  - **Hiti** lane (y 44–140): nice-step gridlines, temp polyline `#D14B4B`
    2.5 px, value labels every 3 h (temperature color rule: > 0 °C red,
    < 0 °C blue, 0 °C neutral).
  - **Úrkoma** lane (baseline y 226, 28 px/mm, cap 62): per hour a
    *hámarksúrkoma* bar behind (20 px, `#A8CBEA`) and the mean *úrkoma*
    bar in front (16 px, `#3D82C4`); axis labels at 1 and 2 mm.
  - **Vindur** lane (y 246–306): gust line dashed `#7FB394` behind, wind
    line solid `#3E8E63` on top; 0–20 m/s per the handoff, domain extended
    to the next multiple of 10 when data exceeds it; direction arrows every
    3 h (rotated to *direction + 180°*).
  - Hour labels every 3 h (y 350).
- **Scrubber (v3)** — a time cursor with track (y 39), handle, dashed
  cursor line and value dots on the temp/wind curves. Mouse hover anywhere
  over the chart moves it; on touch only an invisible strip around the
  track scrubs (with pointer capture) so the rest of the chart still
  scrolls horizontally. Defaults to the "now" hour.
- **Scrub readout card (v3)** — pinned above the chart, always visible:
  timestamp, temp (temp-colored), precip, wind "6 (11)" + direction arrow +
  8-point compass label, and the hour's weather symbol at 38 px. Replaces
  the old floating hover tooltip.
- **Pinned lane chips** ("Hiti" / "Úrkoma" / "Vindur") — sticky at
  `left: 38px` inside the scroll container (38 px keeps them clear of the
  axis value column).
- Five-item legend: Hiti (°C) · Úrkoma (mm) · Hámarksúrkoma (mm) ·
  Vindur (m/s) · Vindhviða (m/s).
- **Settings overlay (v3)** — one surface for forecast model, language and
  location: centered dialog ≥ 560 px viewport width, fullscreen with ✕
  below; model chips, IS/EN pills (apply instantly, overlay stays open),
  live-filtered station list with a checkmark on the current place.
  Model + language choices persist in `localStorage`.
- Nunito typography (loaded once at document level), handoff color tokens
  throughout; loading skeletons and an error state with retry.
- Forecasts with 3 h / 6 h timesteps are handled: the "Næstu N klst."
  title and the full-mode 48 h window are computed from the real timestep.

Deviation from the handoff: station rows and the location subtitle show
coordinates instead of elevation — the WOD forecast metadata does not
provide station elevations. Geolocation is also left to the host page
(embeds pass `location-lat`/`location-lon`).

## Embedding

```html
<!-- Meteogram card only (Graph tab / popup) -->
<bel-meteogram
  client-name="demo"
  forecast-type="schedule"
  forecast-name="island-9"
  domain="1"
  location-lat="64.1465"
  location-lon="-21.9426"
  hours="48"
  language="is"
></bel-meteogram>

<!-- The whole landing experience -->
<bel-meteogram
  mode="full"
  client-name="demo"
  forecast-type="schedule"
  forecast-name="island-9"
  domain="1"
  location-lat="64.1465"
  location-lon="-21.9426"
></bel-meteogram>

<script type="module" src="https://…/bel-meteogram.js"></script>
```

The widget talks to the same WOD API as the previous widget:
`{origin}/api/v2/widget/meteo/config/{client-name}` → forecast metadata →
`…/meteogram.json?duration={hours}h`. As before, the script and the
forecast API must share an origin unless `api-url` is set. In full mode the
model chips come from the config's forecast list and the station list from
the forecast metadata; the fetch window is extended to 168 h (clamped to
the forecast duration) so the table can show a week.

### Attributes

| Attribute | Default | Description |
|---|---|---|
| `client-name` | — | Client id used to fetch the widget config |
| `api-url` | _(script origin)_ | Override the config API URL |
| `forecast-type` | — | `schedule` or `upstream` |
| `forecast-name` | — | Forecast name |
| `domain` | — | Domain integer (schedules only) |
| `location-lat` / `location-lon` | — | Point to load |
| `location-name` | _(nearest station)_ | Display name for the location block |
| `hours` | `48` | Graph window (e.g. 48 or 72, clamped to forecast duration) |
| `language` | `is` | `is` or `en` |
| `mode` | `graph` | `graph` (card only) or `full` (landing experience) |
| `view` | `table` | Initial full-mode view: `table` or `graph` |
| `closable` | _(absent)_ | Full mode: render a ✕ over the location block; pressing it emits `bel-meteogram-close` (the host dismisses the widget) |
| `api-user` / `api-password` | — | Optional basic auth for the data endpoint |
| `sample` | _(absent)_ | Render generated sample data (development/design review) |

`loadChartLocation(lat, lon, name?)` is kept from the previous widget for
programmatic location changes.

### Events

`bel-meteogram-status` — a `CustomEvent` fired on every load transition with
`detail: { status: "loading" | "ready" | "error", error?: string }`, so a
host page can clear its own spinner or surface the failure (used by Mimir's
meteogram modal).

`bel-meteogram-close` — fired when the `closable` ✕ is pressed; the host owns
the dismissal.

`bel-meteogram-location` — a `CustomEvent` fired on every successful load with
`detail: { lat, lon, name, tempC }` describing the currently selected point. It
fires on the initial load and again whenever the point changes (a station is
picked in the settings overlay, the forecast model changes, or the host calls
`loadChartLocation()`), so a map host can drop/move its selected-point pin and
label it `{name} · {tempC}°` per the map-panel handoff. The event bubbles and is
`composed`, so hosts can listen on the element or on an ancestor/document:

```js
const el = document.querySelector("bel-meteogram");
el.addEventListener("bel-meteogram-location", (e) => {
  const { lat, lon, name, tempC } = e.detail;
  movePin(lat, lon, `${name} · ${tempC}°`); // host-owned map pin
});
```

### Theming (full mode)

The page surface is themeable via CSS custom properties on the element, so
the widget can float over other content (e.g. a map) as a rounded glass
panel. Full mode switches layout at a **900 px viewport breakpoint**
(`matchMedia`, re-evaluated on resize and once after mount): below it, the
mobile sheet (Table / Graph tabs, day chips + selected-day card); at and
above it, the docked panel (selector-chip header, Table/Graph switch, 24-hour
table or compact meteogram). The docked panel fills its host's height and
scrolls internally, so give the host a bounded height (e.g. dock it with
`position: absolute; top/right/bottom` — see Mimir's `meteogram.css`).

```css
bel-meteogram {
  /* Desktop panel defaults shown; the widget also has sensible built-ins. */
  --bel-meteogram-bg: rgba(255, 255, 255, 0.95); /* mobile default #E7EFF7 */
  --bel-meteogram-radius: 22px;                  /* default 0 mobile / 22 desktop */
  --bel-meteogram-backdrop: blur(10px);          /* default none */
  --bel-meteogram-max-width: 420px;              /* default 430px mobile, 420px desktop */
}
```

### Bottom sheet (popup mode)

```js
import { BelMeteogram } from "./bel-meteogram.js";

BelMeteogram.openSheet({
  title: "Reykjavík",                       // the sheet supplies the place name
  attributes: {                              // same attributes as inline
    "client-name": "demo",
    "forecast-type": "schedule",
    "forecast-name": "island-9",
    "domain": "1",
    "location-lat": "64.1465",
    "location-lon": "-21.9426",
  },
});
```

The sheet keeps the card internals identical to the inline widget and adds
the chrome: title, close button, scrim tap to close, and drag-to-dismiss.

## Development

```
npm install
npm run dev        # demo page (full + graph modes) at http://localhost:5173
npm run typecheck
npm run build      # dist/bel-meteogram.js (single file, ES module)
```

## Source layout

```
src/
  bel-meteogram.ts   component (graph + full modes), bottom-sheet element
  api.ts             WOD widget API client (config → forecast → meteogram.json)
  transform.ts       meteogram.json → per-hour points (timezone shift, precip scaling)
  render.ts          SVG renderer implementing the handoff geometry + scrubber
  graph-card.ts      graph card: readout, lane chips, legend, scrub wiring
  landing.ts         full mode: now card, day list/chips, day detail, overlay
  symbol-code.ts     weather-variable → yr.no symbol code
  symbols.ts         symbol code → inlined SVG asset
  i18n.ts            is/en strings
  styles.ts          card + landing + sheet CSS (handoff design tokens)
  sample.ts          generated sample data for dev/design review
  assets/symbols/    production yr.no-style symbol set
```
