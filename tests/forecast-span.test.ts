import { describe, expect, it } from "vitest";

import { forecastSpanLabel } from "../src/graph-card";
import { labels } from "../src/i18n";
import type { HourPoint } from "../src/types";

const HOUR = 3_600_000;

/** `count` points `stepH` hours apart, starting Sat 12 Sep 2026 00:00 UTC. */
function run(count: number, stepH: number): HourPoint[] {
  const start = Date.UTC(2026, 8, 12, 0);
  return Array.from({ length: count }, (_, i) => {
    const utcMs = start + i * stepH * HOUR;
    return {
      local: new Date(utcMs),
      utcMs,
      tempC: 5,
      precipMm: 0,
      precipMaxMm: 0,
      windMs: 3,
      gustMs: null,
      dirDeg: 0,
      symbol: "",
    };
  });
}

describe("forecastSpanLabel", () => {
  const en = labels("en");

  it("counts intervals, not points", () => {
    // 121 hourly points are 120 hours: five days, not "121 hours".
    expect(forecastSpanLabel(run(121, 1), en)).toBe("5 days · to Thu 17 September");
  });

  it("measures a 3-hourly run by time, not by its point count", () => {
    expect(forecastSpanLabel(run(41, 3), en)).toBe("5 days · to Thu 17 September");
  });

  it("reads a short run as one day rather than zero", () => {
    expect(forecastSpanLabel(run(7, 1), en)).toBe("1 day · to Sat 12 September");
  });

  it("uses each locale's own wording and plural", () => {
    expect(forecastSpanLabel(run(25, 1), labels("is"))).toMatch(/^1 dagur · til /);
    expect(forecastSpanLabel(run(121, 1), labels("pl"))).toMatch(/^5 dni · do /);
  });

  it("has nothing to say about fewer than two points", () => {
    expect(forecastSpanLabel(run(1, 1), en)).toBe("");
  });
});
