import { describe, expect, it } from "vitest";
import { currentIndex } from "../src/graph-card";
import { labels } from "../src/i18n";
import { groupDays } from "../src/landing";
import type { HourPoint } from "../src/types";

/**
 * Which day is "Today" is decided by the column that contains now, not by the
 * nearest one: from 23:30 the nearest column is tomorrow's 00:00, and the day
 * chips used to move a day ahead for the last half hour of every day (from
 * 22:30 with 3-hourly steps).
 */

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 6, 8, 0); // Wednesday 8 July, 00:00 UTC

/** Points at the given hours after T0, with local time `offsetH` ahead of UTC. */
function series(hours: number[], offsetH = 0): HourPoint[] {
  return hours.map((h) => {
    const utcMs = T0 + h * HOUR;
    return {
      local: new Date(utcMs + offsetH * HOUR),
      utcMs,
      tempC: 10,
      precipMm: 0,
      precipMaxMm: 0,
      windMs: 4,
      gustMs: null,
      dirDeg: 180,
      symbol: "",
    };
  });
}

const range = (from: number, to: number, step = 1): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const at = (h: number, m = 0): number => T0 + h * HOUR + m * 60_000;

describe("currentIndex", () => {
  const hourly = series(range(0, 47));

  it("is the column that started last, up to the next one", () => {
    expect(currentIndex(hourly, at(12))).toBe(12);
    expect(currentIndex(hourly, at(12, 29))).toBe(12);
    expect(currentIndex(hourly, at(12, 31))).toBe(12);
    expect(currentIndex(hourly, at(23, 40))).toBe(23);
    expect(currentIndex(hourly, at(24))).toBe(24);
  });

  it("spans a whole 3-hour step", () => {
    const mixed = series([...range(0, 21), ...range(24, 72, 3)]);
    expect(currentIndex(mixed, at(26, 59))).toBe(mixed.findIndex((p) => p.utcMs === at(24)));
    expect(currentIndex(mixed, at(45, 40))).toBe(mixed.findIndex((p) => p.utcMs === at(45)));
  });

  it("is the first column before the series starts and the last after it ends", () => {
    expect(currentIndex(hourly, at(-5))).toBe(0);
    expect(currentIndex(hourly, at(80))).toBe(hourly.length - 1);
    expect(currentIndex([], at(5))).toBe(0);
  });
});

describe("groupDays with today from currentIndex", () => {
  const t = labels("en");

  function today(points: HourPoint[], now: number) {
    const days = groupDays(points, t, currentIndex(points, now));
    return { days, first: days[0] };
  }

  it("keeps today on Wednesday until midnight with hourly steps", () => {
    const points = series(range(0, 71));
    for (const now of [at(23, 20), at(23, 40), at(23, 59)]) {
      const { days, first } = today(points, now);
      expect(first.name).toBe(t.today);
      expect(first.hours[0].local.getUTCDate()).toBe(8);
      expect(first.hours.at(-1)!.utcMs).toBe(at(23));
      expect(days[1].name).toBe(t.tomorrow);
      expect(days[1].hours[0].local.getUTCDate()).toBe(9);
    }
    expect(today(points, at(24, 5)).first.hours[0].local.getUTCDate()).toBe(9);
  });

  it("keeps today on Wednesday from 22:30 when the day ends on a 3-hourly 21:00", () => {
    const points = series(range(0, 72, 3));
    const { first } = today(points, at(22, 40));
    expect(first.name).toBe(t.today);
    expect(first.hours.at(-1)!.utcMs).toBe(at(21));
  });

  it("uses the point's local day, not UTC's, for a point an hour ahead", () => {
    // 22:40 UTC is 23:40 in the Faroe Islands in summer: still Wednesday there.
    const points = series(range(0, 71), 1);
    const { first } = today(points, at(22, 40));
    expect(first.name).toBe(t.today);
    expect(first.hours[0].local.getUTCDate()).toBe(8);
    expect(first.hours.at(-1)!.local.getUTCHours()).toBe(23);
  });
});
