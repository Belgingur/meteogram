import { weatherSymbolCode } from "./symbol-code";
import type { HourPoint, MeteogramData } from "./types";

const MS_IN_HOUR = 3_600_000;

/**
 * Read one named variable as a per-timestep array, degrading gracefully: a
 * missing variable (the ECMWF-IS purchase omits some, e.g. wind gust), a
 * non-array value or any access error yields an all-null array of the right
 * length rather than throwing. This is the per-series guard that keeps a single
 * absent variable from failing the whole chart (task A2).
 */
function series(
  api: MeteogramData,
  name: string,
): (number | null)[] {
  try {
    const arr = api.data?.[name];
    if (Array.isArray(arr)) return arr;
  } catch {
    /* fall through to nulls */
  }
  return api.time.map(() => null);
}

/** Whether a variable is present AND carries at least one real value — used to
 *  decide if a series (e.g. wind gust) should be drawn/legended at all. */
function present(values: (number | null)[]): boolean {
  return values.some((v) => v !== null);
}

/**
 * Turn the raw meteogram.json response into per-hour points, shifted to the
 * location's timezone (meta.location_timezone_offset, minutes) and with
 * precipitation scaled from rate to mm per timestep, matching the previous
 * widget's chart preparation.
 */
export function toHourPoints(api: MeteogramData, maxHours: number): HourPoint[] {
  const times = api.time;
  if (!times || times.length < 2) return [];

  const timestepH =
    (new Date(times[1]).getTime() - new Date(times[0]).getTime()) / MS_IN_HOUR;
  const offsetMin = api.meta?.location_timezone_offset ?? 0;

  const temp = series(api, "air_temperature_at_2m_agl");
  const precipRate = series(api, "lwe_precipitation_rate");
  const precipRateMax = series(api, "lwe_precipitation_rate_max");
  const wind = series(api, "wind_speed_at_10m_agl");
  const gust = series(api, "wind_speed_of_gust_at_10m_agl");
  const dir = series(api, "wind_from_direction_at_10m_agl");
  const cloud = series(api, "cloud_area_fraction");
  const snow = series(api, "snow_fraction");
  const daylight = series(api, "daylight_fraction");

  // Wind gust is optional (missing from the ECMWF-IS dataset). When the whole
  // series is absent, keep gustMs null so the dashed gust line and its legend
  // entry are simply omitted (see hasGust in the renderers) rather than drawn as
  // a duplicate of the wind line. When present, per-hour nulls just break the
  // line — we no longer backfill gust from wind.
  const hasGust = present(gust);

  const n = Math.min(times.length, Math.ceil(maxHours / timestepH));
  const points: HourPoint[] = [];
  for (let i = 0; i < n; i++) {
    const rate = precipRate[i];
    const rateMax = precipRateMax[i] ?? rate;
    const utcMs = new Date(times[i]).getTime();
    points.push({
      local: new Date(utcMs + offsetMin * 60_000),
      utcMs,
      tempC: temp[i],
      precipMm: rate === null ? 0 : rate * timestepH,
      precipMaxMm: rateMax === null ? 0 : rateMax * timestepH,
      windMs: wind[i],
      gustMs: hasGust ? gust[i] : null,
      dirDeg: dir[i],
      symbol: weatherSymbolCode(rate, cloud[i], snow[i], daylight[i], timestepH),
    });
  }
  return points;
}
