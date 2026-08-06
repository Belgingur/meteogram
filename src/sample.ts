import { weatherSymbolCode } from "./symbol-code";
import type { HourPoint } from "./types";

/**
 * Generated sample data equivalent to the design prototype's
 * (Reykjavík, early July, 8–14 °C) so the widget can be developed and
 * design-reviewed without API access. Enabled with the `sample` attribute.
 */

interface DaySpec {
  max: number;
  min: number;
  rain: [number, number, number] | null;
  wind: number;
  dir: number;
  cloud: number;
}

// Seven days, matching the prototype's daySpecs
const daySpecs: DaySpec[] = [
  { max: 12, min: 8, rain: [12, 19, 0.9], wind: 6, dir: 220, cloud: 0.85 },
  { max: 13, min: 9, rain: null, wind: 4, dir: 180, cloud: 0.4 },
  { max: 11, min: 8, rain: [6, 16, 1.4], wind: 8, dir: 160, cloud: 0.9 },
  { max: 14, min: 9, rain: null, wind: 3, dir: 90, cloud: 0.1 },
  { max: 12, min: 8, rain: [14, 20, 0.4], wind: 5, dir: 200, cloud: 0.5 },
  { max: 10, min: 7, rain: [3, 21, 1.8], wind: 10, dir: 150, cloud: 0.95 },
  { max: 13, min: 8, rain: null, wind: 5, dir: 250, cloud: 0.45 },
];

/**
 * Hours of already-elapsed forecast the fixture opens with, standing in for a
 * real model analysis time: a run is always some hours old by the time a browser
 * loads it, so `time[0]` is the past, not "now".
 *
 * This matters beyond realism. While the sample's first point WAS the current
 * hour, every "does it open at the current hour?" bug was invisible locally —
 * index 0, "now" and the plot's left edge all coincided, so a renderer that
 * simply never scrolled looked correct. Keep this non-zero.
 */
const SAMPLE_ANALYSIS_AGE_H = 3;

export function sampleHourPoints(hours: number): HourPoint[] {
  const start = new Date();
  // Truncate in UTC, not local time: real forecast steps land on whole UTC
  // hours, and everything downstream reads these points with getUTC* accessors.
  // Truncating locally would put every sample point at :30 for a contributor in
  // a half-hour-offset zone (IST, NPT, ACST) — same code, different data.
  start.setUTCMinutes(0, 0, 0);
  start.setTime(start.getTime() - SAMPLE_ANALYSIS_AGE_H * 3_600_000);
  const day0 = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const points: HourPoint[] = [];
  for (let i = 0; i < hours; i++) {
    const utcMs = start.getTime() + i * 3_600_000;
    const at = new Date(utcMs);
    // Key the diurnal shape and the day spec off each point's real clock
    // hour/date rather than off `i`. Now that the series no longer begins at the
    // top of a synthetic day, `i % 24` would slide the warm afternoon and the
    // bright-night daylight window away from the hour labels the chart draws.
    const h = at.getUTCHours();
    const dayIdx = Math.round(
      (Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - day0) /
        86_400_000,
    );
    const spec = daySpecs[dayIdx % daySpecs.length];
    const temp = Math.round(
      spec.min + (spec.max - spec.min) * (0.5 - 0.5 * Math.cos(((h - 4) / 24) * 2 * Math.PI)),
    );
    let precip = 0;
    if (spec.rain && h >= spec.rain[0] && h < spec.rain[1]) {
      precip =
        Math.round(
          spec.rain[2] *
            (0.4 + 0.6 * Math.sin((Math.PI * (h - spec.rain[0])) / (spec.rain[1] - spec.rain[0]))) *
            10,
        ) / 10;
    }
    const wind = Math.max(1, spec.wind + Math.round(1.5 * Math.sin(((h - 15) / 24) * 2 * Math.PI)));
    const daylight = h >= 4 && h <= 23 ? 1 : 0; // Icelandic summer nights are bright
    points.push({
      local: new Date(utcMs),
      utcMs,
      tempC: temp,
      precipMm: precip,
      precipMaxMm: precip > 0 ? Math.round(precip * 1.6 * 10) / 10 : 0,
      windMs: wind,
      gustMs: Math.round(wind * 1.8),
      dirDeg: (spec.dir + Math.round(20 * Math.sin(h / 8)) + 360) % 360,
      symbol: weatherSymbolCode(precip, precip > 0 ? 0.9 : spec.cloud, 0, daylight),
    });
  }
  return points;
}

/** Sample station list for the settings overlay (from the prototype) */
export const samplePlaces = [
  { name: "Reykjavík", lat: 64.146, lon: -21.942 },
  { name: "Kópavogur", lat: 64.11, lon: -21.91 },
  { name: "Akranes", lat: 64.32, lon: -22.07 },
  { name: "Keflavík", lat: 64.0, lon: -22.56 },
  { name: "Selfoss", lat: 63.93, lon: -21.0 },
  { name: "Vík í Mýrdal", lat: 63.42, lon: -19.01 },
  { name: "Ísafjörður", lat: 66.07, lon: -23.13 },
  { name: "Akureyri", lat: 65.68, lon: -18.09 },
  { name: "Egilsstaðir", lat: 65.26, lon: -14.39 },
  { name: "Höfn í Hornafirði", lat: 64.25, lon: -15.21 },
  { name: "Hveravellir", lat: 64.87, lon: -19.56 },
];

/** Sample forecast-model list (the handoff's placeholder names) */
export const sampleModels = [
  { id: "sample/harmonie", name: "HARMONIE 2.5 km" },
  { id: "sample/wrf9", name: "WRF 9 km" },
  { id: "sample/ecmwf", name: "ECMWF 0.1°" },
];
