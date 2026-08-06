import { describe, expect, it } from "vitest";
import { indexAtInstant } from "../src/graph-card";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * A scrubbed hour is carried across reloads as an instant, never as a column
 * index: the widget builds three different windows over the same forecast (the
 * graph card counts from the analysis time, graphPoints() from now, the table
 * groups by day), so an index meant a different hour depending on which view
 * read it back — and a different hour again the next day.
 */

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 6, 8, 12, 0, 0);

function series(startMs: number, count: number, stepH = 1): HourPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const utcMs = startMs + i * stepH * HOUR;
    return {
      local: new Date(utcMs),
      utcMs,
      tempC: 10,
      precipMm: 0,
      precipMaxMm: 0,
      windMs: 5,
      gustMs: null,
      dirDeg: 180,
      symbol: weatherSymbolCode(0, 0.5, 0, 1),
    };
  });
}

describe("indexAtInstant", () => {
  it("finds the column holding the instant", () => {
    const pts = series(NOW - 3 * HOUR, 24); // analysis 3 h back
    expect(indexAtInstant(pts, NOW + 5 * HOUR, NOW)).toBe(8);
  });

  it("resolves the same instant to different columns in different windows", () => {
    // The exact bug an index could not survive: two views over one forecast.
    const target = NOW + 5 * HOUR;
    const fromAnalysis = series(NOW - 3 * HOUR, 24);
    const fromNow = series(NOW, 24);
    expect(indexAtInstant(fromAnalysis, target, NOW)).toBe(8);
    expect(indexAtInstant(fromNow, target, NOW)).toBe(5);
  });

  it("declines an hour that has already finished", () => {
    const pts = series(NOW - 6 * HOUR, 24);
    expect(indexAtInstant(pts, NOW - 2 * HOUR, NOW)).toBe(-1);
  });

  it("keeps the current hour, which began in the past but has not ended", () => {
    const pts = series(NOW - 6 * HOUR, 24);
    // Half past the hour: the 12:00 step is still running.
    expect(indexAtInstant(pts, NOW, NOW + HOUR / 2)).toBe(6);
  });

  it("declines an instant beyond the end of the series", () => {
    const pts = series(NOW, 12);
    expect(indexAtInstant(pts, NOW + 40 * HOUR, NOW)).toBe(-1);
  });

  it("snaps to the nearest step on a coarse grid", () => {
    // A 6-hourly long-range run. Inside the series every instant is within half
    // a step of some column, so the tolerance only ever rejects instants that
    // fall outside the series — see the two cases below.
    const pts = series(NOW, 12, 6);
    expect(indexAtInstant(pts, NOW + 12 * HOUR, NOW)).toBe(2); // exact
    expect(indexAtInstant(pts, NOW + 14 * HOUR, NOW)).toBe(2); // 2 h off a 6 h step
  });

  it("declines an instant before the series, even when its step has not finished", () => {
    const pts = series(NOW, 12, 6); // first column is NOW
    // A 6 h step beginning 5 h ago is still running, so the has-it-finished rule
    // alone would keep this — but 5 h is more than half a step from the first
    // column, so it is not an hour this series covers.
    expect(indexAtInstant(pts, NOW - 5 * HOUR, NOW)).toBe(-1);
  });

  it("accepts an instant within half a step", () => {
    const pts = series(NOW, 12, 3);
    expect(indexAtInstant(pts, NOW + 7 * HOUR, NOW)).toBe(2); // 1 h off a 3 h step
  });

  it("has no opinion about an empty series", () => {
    expect(indexAtInstant([], NOW, NOW)).toBe(-1);
  });
});
