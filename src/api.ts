import type {
  ForecastMetadata,
  ForecastUrl,
  MeteoConfigResponse,
  MeteogramData,
} from "./types";

/**
 * Thin client for the WOD widget API, following the same endpoints as the
 * previous belgingur-meteogram widget:
 *   {origin}/api/v2/widget/meteo/config/{client-name}  → forecast list
 *   forecast.url                                       → forecast metadata
 *   station_data_url (templated)                       → meteogram.json
 */

export interface ApiOptions {
  clientName: string;
  /** Explicit config URL; otherwise derived from the script origin */
  apiUrl?: string;
  /** Optional basic-auth credentials for the forecast data endpoint */
  user?: string;
  password?: string;
}

export function configUrl(opts: ApiOptions): string {
  if (opts.apiUrl) return opts.apiUrl;
  const scriptOrigin = new URL(import.meta.url).origin;
  return `${scriptOrigin}/api/v2/widget/meteo/config/${opts.clientName}`;
}

export async function loadConfig(opts: ApiOptions): Promise<ForecastUrl[]> {
  const response = await fetch(configUrl(opts));
  if (!response.ok) throw new Error(`config: HTTP ${response.status}`);
  const data: MeteoConfigResponse = await response.json();
  return data.forecasts;
}

/** Combine forecast type/name/domain into a forecast id path */
export function forecastPath(
  type: string | null,
  name: string | null,
  domain: string | null,
): string {
  if (!type || !name) return "";
  return type === "schedule" ? `${type}/${name}/${domain}` : `${type}/${name}`;
}

export function findForecast(
  forecasts: ForecastUrl[],
  path: string,
): ForecastUrl | undefined {
  if (!path) return forecasts[0];
  return forecasts.find((f) => f.id === path);
}

export async function loadForecastMetadata(
  url: string,
): Promise<ForecastMetadata> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`forecast: HTTP ${response.status}`);
  return response.json();
}

/**
 * Point-data URL for a forecast. Omit `hours` to ask for the whole run: with no
 * `duration` the API returns every timestep the forecast has, and an oversized
 * `duration` returns the same — the run's own length is the only real cap.
 *
 * The metadata's `duration_h` is deliberately NOT used to clamp. It is a
 * config-declared number that can undercount what the model actually serves
 * (ECMWF-0p25 declares 72 h and returns 90 h), so clamping by it silently threw
 * away real forecast hours.
 */
export function stationDataUrl(
  forecast: ForecastMetadata,
  lat: number,
  lon: number,
  hours?: number,
): string {
  const query =
    hours !== undefined && Number.isFinite(hours) ? `?duration=${hours}h` : "";
  return forecast.station_data_url
    .replace("[station]", `latlon/${lat},${lon}`)
    .replace("meteogram.xml", `meteogram.json${query}`);
}

export interface MeteogramFetchResult {
  data: MeteogramData;
  /** HTTP Last-Modified when present */
  lastModified: Date | null;
}

export async function loadMeteogramData(
  url: string,
  opts: ApiOptions,
): Promise<MeteogramFetchResult> {
  const headers = new Headers();
  if (opts.user && opts.password) {
    headers.set("Authorization", "Basic " + btoa(`${opts.user}:${opts.password}`));
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`meteogram: HTTP ${response.status}`);
  const lastMod = response.headers.get("Last-Modified");
  return {
    data: await response.json(),
    lastModified: lastMod ? new Date(lastMod) : null,
  };
}

/** The run and update times shown in the widget's footer. */
export interface RunTimes {
  analysisTime: Date | null;
  lastModified: Date;
}

/**
 * Read the model run and last-update times from a meteogram.json response.
 * Older WOD servers send neither in `meta`, so "last update" falls back to the
 * HTTP Last-Modified header and the run time to the first forecast step — which
 * runs an hour or so late whenever the forecast lead isn't zero.
 */
export function runTimes(
  data: MeteogramData,
  headerLastModified: Date | null,
  firstStepMs: number | undefined,
  now: Date = new Date(),
): RunTimes {
  const lastModified =
    parseTime(data.meta?.last_modified) ?? headerLastModified ?? now;
  const analysisTime =
    parseTime(data.meta?.analysis) ??
    (firstStepMs !== undefined ? new Date(firstStepMs) : lastModified);
  return { analysisTime, lastModified };
}

function parseTime(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
