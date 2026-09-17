import { weatherSymbolCode } from "./symbol-code";
import type { HourPoint, MeteogramData } from "./types";

const MS_IN_HOUR = 3_600_000;

/**
 * Read one named variable as a per-timestep array, degrading gracefully: a
 * missing variable (the ECMWF-IS purchase omits some, e.g. wind gust), a
 * non-array value or any access error yields an all-null array of the right
 * length rather than throwing. This is the per-series guard that keeps a single
 * absent variable from failing the whole chart.
 *
 * The result is always exactly `len` long. A response can carry more timestamps
 * than values — ICON-EU has answered with 121 `time` entries and 93 of
 * everything else — and reading past the end of the short array yields `undefined`, which
 * is neither a number nor the `null` every consumer checks for. One of those
 * reaching the temperature scale is enough to make `Math.min` NaN and wipe the
 * whole line, so the ragged tail is turned into honest nulls here, at the edge.
 */
function series(
  api: MeteogramData,
  name: string,
  len: number,
): (number | null)[] {
  let arr: unknown;
  try {
    arr = api.data?.[name];
  } catch {
    /* fall through to nulls */
  }
  const source = Array.isArray(arr) ? (arr as (number | null)[]) : [];
  return Array.from({ length: len }, (_, i) => {
    const v = source[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
}

/**
 * How many timesteps the response actually carries values for.
 *
 * Columns beyond this have no data in any series, so plotting them draws an
 * empty stretch of chart that reads as a rendering fault rather than as the end
 * of the run. The shortest present series wins: a column is only worth drawing
 * when every variable can say something about it.
 *
 * Empty arrays are ignored — a variable the model does not carry at all should
 * not truncate the run to nothing.
 */
function coveredSteps(api: MeteogramData): number {
  let lengths: number[] = [];
  try {
    lengths = Object.values(api.data ?? {})
      .filter((v): v is (number | null)[] => Array.isArray(v) && v.length > 0)
      .map((v) => v.length);
  } catch {
    /* no readable data block — the caller falls back to times.length */
  }
  return lengths.length ? Math.min(...lengths) : Number.POSITIVE_INFINITY;
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

  // Every column the chart draws has to be a column the data can fill, so the
  // run is cut to whichever comes first: the timestamps, the values behind them,
  // or the caller's window.
  const n = Math.min(
    times.length,
    coveredSteps(api),
    Math.ceil(maxHours / timestepH),
  );
  if (!(n > 0)) return [];

  const temp = series(api, "air_temperature_at_2m_agl", n);
  const precipRate = series(api, "lwe_precipitation_rate", n);
  const precipRateMax = series(api, "lwe_precipitation_rate_max", n);
  const wind = series(api, "wind_speed_at_10m_agl", n);
  const gust = series(api, "wind_speed_of_gust_at_10m_agl", n);
  const dir = series(api, "wind_from_direction_at_10m_agl", n);
  const cloud = series(api, "cloud_area_fraction", n);
  const snow = series(api, "snow_fraction", n);
  const daylight = series(api, "daylight_fraction", n);

  // Wind gust is optional (missing from the ECMWF-IS dataset). When the whole
  // series is absent, keep gustMs null so the dashed gust line and its legend
  // entry are simply omitted (see hasGust in the renderers) rather than drawn as
  // a duplicate of the wind line. When present, per-hour nulls just break the
  // line — we no longer backfill gust from wind.
  const hasGust = present(gust);

  const points: HourPoint[] = [];
  for (let i = 0; i < n; i++) {
    const rate = precipRate[i];
    const rateMax = precipRateMax[i] ?? rate;
    const utcMs = new Date(times[i]).getTime();
    points.push({
      local: new Date(utcMs + offsetMin * 60_000),
      utcMs,
      tempC: temp[i],
      // `== null` deliberately, not `===`: a missing value has to read as "no
      // rain", and `undefined * timestepH` is NaN, which paints nothing at all.
      precipMm: rate == null ? 0 : rate * timestepH,
      precipMaxMm: rateMax == null ? 0 : rateMax * timestepH,
      windMs: wind[i],
      gustMs: hasGust ? gust[i] : null,
      dirDeg: dir[i],
      symbol: weatherSymbolCode(rate, cloud[i], snow[i], daylight[i], timestepH),
    });
  }
  return points;
}
