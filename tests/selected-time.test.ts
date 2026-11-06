import { describe, expect, it } from "vitest";
import { columnAtTime, timeEventDetail } from "../src/graph-card";
import { labels } from "../src/i18n";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * A host (Mímir's timeline) selects an hour with `selected-time`, an absolute
 * UTC instant. The column it lands on is what the panel shows and what the
 * host's map pin shows, so the rule has to be exact — and, unlike a restored
 * scrub, it must take hours that have already passed.
 */

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 6, 8, 9, 0, 0); // a run's first column

function point(utcMs: number, tempC: number | null = 10): HourPoint {
  return {
    local: new Date(utcMs),
    utcMs,
    tempC,
    precipMm: 0,
    precipMaxMm: 0,
    windMs: 5,
    gustMs: null,
    dirDeg: 180,
    symbol: weatherSymbolCode(0, 0.5, 0, 1),
  };
}

function series(startMs: number, count: number, stepH = 1): HourPoint[] {
  return Array.from({ length: count }, (_, i) => point(startMs + i * stepH * HOUR));
}

/** Hourly for `hourly` columns, then 3-hourly for `threeHourly` more. */
function mixedSeries(hourly: number, threeHourly: number): HourPoint[] {
  const first = series(T0, hourly);
  const last = first[first.length - 1].utcMs;
  return [...first, ...series(last + 3 * HOUR, threeHourly, 3)];
}

describe("columnAtTime", () => {
  it("selects the column on the exact hour", () => {
    const pts = series(T0, 48);
    expect(columnAtTime(pts, T0 + 30 * HOUR)).toBe(30);
  });

  it("takes the nearest column within half an hourly step", () => {
    const pts = series(T0, 48);
    expect(columnAtTime(pts, T0 + 5 * HOUR + 20 * 60_000)).toBe(5);
    expect(columnAtTime(pts, T0 + 5 * HOUR + 40 * 60_000)).toBe(6);
  });

  it("between 3-hourly steps, picks the nearest step, measured on the local spacing", () => {
    // Columns 0–23 hourly (09:00 … 08:00 next day), then 3-hourly from 11:00.
    const pts = mixedSeries(24, 10);
    const step = pts[24].utcMs; // first 3-hourly column
    expect(pts[25].utcMs - step).toBe(3 * HOUR);
    expect(columnAtTime(pts, step + 1 * HOUR)).toBe(24);
    expect(columnAtTime(pts, step + 2 * HOUR)).toBe(25);
    // An exact tie goes to the earlier column, as nowIndex does.
    expect(columnAtTime(pts, step + 1.5 * HOUR)).toBe(24);
    // Past the end of a 3-hourly run, half of THAT step still counts…
    const end = pts[pts.length - 1].utcMs;
    expect(columnAtTime(pts, end + 1.5 * HOUR)).toBe(pts.length - 1);
    // …and more than half is outside.
    expect(columnAtTime(pts, end + 1.6 * HOUR)).toBe(-1);
  });

  it("selects an hour earlier today that has already passed", () => {
    // Unlike indexAtInstant, nothing here depends on the clock: the run's
    // first hours are as selectable as its last.
    const pts = series(T0, 48);
    expect(columnAtTime(pts, T0 + 1 * HOUR)).toBe(1);
    expect(columnAtTime(pts, T0)).toBe(0);
  });

  it("is outside before the run starts", () => {
    const pts = series(T0, 48);
    expect(columnAtTime(pts, T0 - 30 * 60_000)).toBe(0); // within half a step
    expect(columnAtTime(pts, T0 - 31 * 60_000)).toBe(-1);
    expect(columnAtTime(pts, T0 - 24 * HOUR)).toBe(-1);
  });

  it("is outside past the end of the run", () => {
    const pts = series(T0, 48);
    const end = pts[47].utcMs;
    expect(columnAtTime(pts, end + 30 * 60_000)).toBe(47);
    expect(columnAtTime(pts, end + 31 * 60_000)).toBe(-1);
    expect(columnAtTime(pts, end + 10 * 24 * HOUR)).toBe(-1);
  });

  it("has nothing to select in an empty series or for an invalid instant", () => {
    expect(columnAtTime([], T0)).toBe(-1);
    expect(columnAtTime(series(T0, 4), NaN)).toBe(-1);
  });
});

describe("timeEventDetail", () => {
  it("reports the column's UTC instant and the readout's rounded temperature", () => {
    const pts = [point(T0, 11.6), point(T0 + HOUR, -0.4), point(T0 + 2 * HOUR, null)];
    expect(timeEventDetail(pts, 0, "host")).toEqual({
      time: "2026-07-08T09:00:00.000Z",
      tempC: 12,
      source: "host",
    });
    // The readout prints Math.round(-0.4) as "0°": the pin gets 0, not -0.
    expect(Object.is(timeEventDetail(pts, 1, "user").tempC, 0)).toBe(true);
    expect(timeEventDetail(pts, 2, "user")).toEqual({
      time: "2026-07-08T11:00:00.000Z",
      tempC: null,
      source: "user",
    });
  });

  it("reports nothing for a time outside the forecast", () => {
    const pts = series(T0, 4);
    expect(timeEventDetail(pts, -1, "host")).toEqual({
      time: null,
      tempC: null,
      source: "host",
    });
  });
});

describe("noForecastForTime", () => {
  it("has a short line in every language", () => {
    for (const lang of ["is", "en", "fo", "pl", "es", "pt"]) {
      const text = labels(lang).noForecastForTime;
      expect(text.length).toBeGreaterThan(5);
      expect(text.length).toBeLessThan(40);
    }
    expect(labels("en").noForecastForTime).toBe("No forecast for this time");
  });
});
