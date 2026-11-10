import { distanceKm } from "./geo";
import type {
  ForecastMetadata,
  ForecastUrl,
  MeteoConfigResponse,
  MeteogramData,
  StationMetadata,
} from "./types";

/**
 * Thin client for the WOD widget API, following the same endpoints as the
 * previous belgingur-meteogram widget:
 *   {origin}/api/v2/widget/meteo/config/{client-name}  → forecast list
 *   forecast.url                                       → forecast metadata
 *   station_data_url (templated)                       → meteogram.json
 * The first two are cached (see CONFIG_TTL_MS); only the point data is
 * fetched for every point.
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

/**
 * How long the forecast list and a forecast's metadata are reused. Neither
 * depends on the point, and the run times come with the point data, so a
 * widget asks for them once instead of before every point it loads. The
 * config response itself expires an hour after it is served.
 */
export const CONFIG_TTL_MS = 60 * 60 * 1000;

/**
 * How long one request may take, from sending it to the end of its body,
 * before it is given up and the widget shows its error state with Retry. Long
 * enough for a slow mobile connection to fetch a two-week point forecast; short
 * enough that a request that will never answer doesn't leave the loading
 * skeleton running indefinitely.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * GET `url` and parse it as JSON, through an AbortController that gives up
 * after {@link REQUEST_TIMEOUT_MS}, or as soon as `signal` aborts. The timer
 * covers reading the body too, so a response that stalls half-way also ends.
 * Errors are labelled with `what` ("meteogram: timed out after 20 s").
 */
async function fetchJson<T>(
  url: string,
  what: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<{ json: T; response: Response }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = (): void => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${what}: HTTP ${response.status}`);
    return { json: (await response.json()) as T, response };
  } catch (err) {
    if (timedOut) {
      throw new Error(`${what}: timed out after ${REQUEST_TIMEOUT_MS / 1000} s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Settle with `promise`, or reject as soon as `signal` aborts, without
 * cancelling `promise` itself (other callers may still be waiting for it).
 */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError(signal));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

const configCache = new Map<string, { at: number; json: Promise<unknown> }>();

/**
 * GET `url` as JSON, sharing one request between every caller (all widgets on
 * the page) for {@link CONFIG_TTL_MS}. A failed or timed-out request is
 * forgotten, so a retry asks again. `signal` lets one caller stop waiting; it
 * doesn't cancel the shared request, which has its own timeout.
 */
function cachedJson<T>(url: string, what: string, signal?: AbortSignal): Promise<T> {
  const hit = configCache.get(url);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) {
    return untilAborted(hit.json as Promise<T>, signal);
  }
  const json = fetchJson<T>(url, what).then((r) => r.json);
  configCache.set(url, { at: Date.now(), json });
  json.catch(() => {
    if (configCache.get(url)?.json === json) configCache.delete(url);
  });
  return untilAborted(json, signal);
}

/** Forget every cached config and forecast metadata response. */
export function clearConfigCache(): void {
  configCache.clear();
}

export async function loadConfig(
  opts: ApiOptions,
  signal?: AbortSignal,
): Promise<ForecastUrl[]> {
  const data = await cachedJson<MeteoConfigResponse>(configUrl(opts), "config", signal);
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

export function loadForecastMetadata(
  url: string,
  signal?: AbortSignal,
): Promise<ForecastMetadata> {
  return cachedJson<ForecastMetadata>(url, "forecast", signal);
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
 *
 * With a `stationRef` (and a forecast that {@link hasStationEndpoint}) it asks
 * for that station instead of the point, which is the only request the API
 * corrects against the station's observations.
 */
export function stationDataUrl(
  forecast: ForecastMetadata,
  lat: number,
  lon: number,
  hours?: number,
  stationRef?: string,
): string {
  const query =
    hours !== undefined && Number.isFinite(hours) ? `?duration=${hours}h` : "";
  const point =
    stationRef && hasStationEndpoint(forecast)
      ? `station/${encodeURIComponent(stationRef)}`
      : `latlon/${lat},${lon}`;
  return forecast.station_data_url
    .replace("[station]", point)
    .replace("meteogram.xml", `meteogram.json${query}`);
}

/**
 * Whether the forecast serves point data by station ref. WOD has the station
 * endpoint for schedules and jobs, not for upstream models.
 */
export function hasStationEndpoint(forecast: ForecastMetadata): boolean {
  return !forecast.forecast_id?.startsWith("upstream/");
}

/**
 * How far a point may be from a station and still be taken as that station.
 *
 * Not an exact match: a host's own copy of a station list (Mímir's map labels)
 * need not carry the coordinates WOD has for the station, and a click on a
 * village label lands a few hundred metres from either. A kilometre is close
 * enough to mean "this station" and far enough not to claim the next valley.
 */
export const STATION_MATCH_KM = 1;

/**
 * The station with a WOD ref nearest to the point, when it is within
 * {@link STATION_MATCH_KM}. Its data can come from the station endpoint, which
 * corrects what it can against the station's observations.
 */
export function refStationAt(
  stations: StationMetadata[],
  lat: number,
  lon: number,
): StationMetadata | null {
  let best: StationMetadata | null = null;
  let bestKm = STATION_MATCH_KM;
  for (const s of stations) {
    if (!s.extra?.ref) continue;
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (km <= bestKm) {
      best = s;
      bestKm = km;
    }
  }
  return best;
}

export interface MeteogramFetchResult {
  data: MeteogramData;
  /** HTTP Last-Modified when present */
  lastModified: Date | null;
}

/**
 * Fetch one point's forecast. Gives up after {@link REQUEST_TIMEOUT_MS}, and
 * cancels the request as soon as `signal` aborts (a newer load, or the widget
 * leaving the page).
 */
export async function loadMeteogramData(
  url: string,
  opts: ApiOptions,
  signal?: AbortSignal,
): Promise<MeteogramFetchResult> {
  const headers = new Headers();
  if (opts.user && opts.password) {
    headers.set("Authorization", "Basic " + btoa(`${opts.user}:${opts.password}`));
  }
  const { json, response } = await fetchJson<MeteogramData>(
    url,
    "meteogram",
    { headers },
    signal,
  );
  const lastMod = response.headers.get("Last-Modified");
  return {
    data: json,
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
