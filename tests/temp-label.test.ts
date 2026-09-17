import { describe, expect, it } from "vitest";
import * as render from "../src/render";
import {
  buildMeteogram,
  LAYOUT_FULL,
  TEMP_LABEL_CAP,
  temperatureTicks,
  tempLabelBaselineY,
} from "../src/render";
import type { MeteogramLayout } from "../src/render";
import { labels } from "../src/i18n";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * Temperature value labels used to be placed at `tempY + tempLabelDy` with no
 * clamp, which put the hottest ones in the band above the lane — where the
 * weather-symbol row and the scrub track live. Both are painted after the
 * labels, so the track drew a grey bar straight through the digits. The tick
 * range always brackets the data, so the day's maximum sits in the top step of
 * the scale essentially every time; this was not an edge case.
 */

const box = (baseline: number, L: MeteogramLayout): [number, number] => [
  baseline - L.tempFont * TEMP_LABEL_CAP,
  baseline,
];

const overlaps = (a: [number, number], b: [number, number]): boolean =>
  a[0] < b[1] && b[0] < a[1];

/**
 * Every layout the module exports, discovered rather than listed: a new geometry
 * added to render.ts is covered by these invariants the moment it exists, which
 * is the only way a placement rule tuned against two layouts stays honest.
 */
const LAYOUTS: [string, MeteogramLayout][] = Object.entries(render)
  .filter(
    (entry): entry is [string, MeteogramLayout] =>
      typeof entry[1] === "object" &&
      entry[1] !== null &&
      "tempTop" in entry[1] &&
      "tempLabelDy" in entry[1],
  )
  .sort(([a], [b]) => a.localeCompare(b));

it("found the exported layouts to check", () => {
  expect(LAYOUTS.map(([name]) => name)).toEqual(["LAYOUT_COMPACT", "LAYOUT_FULL"]);
});

describe.each(LAYOUTS)("tempLabelBaselineY — %s", (_name, L) => {
  // Every position a point can occupy in its lane, quarter-pixel steps.
  const positions: number[] = [];
  for (let y = L.tempTop; y <= L.tempBottom; y += 0.25) positions.push(y);

  it("keeps the whole glyph box inside the temperature lane", () => {
    for (const y of positions) {
      const [top, bottom] = box(tempLabelBaselineY(y, L), L);
      expect(top, `label top at tempY=${y}`).toBeGreaterThanOrEqual(L.tempTop);
      expect(bottom, `label bottom at tempY=${y}`).toBeLessThanOrEqual(L.tempBottom);
    }
  });

  it("never collides with the weather-symbol row", () => {
    const symbols: [number, number] = [L.symbolY, L.symbolY + L.symbolSize];
    for (const y of positions) {
      expect(overlaps(box(tempLabelBaselineY(y, L), L), symbols), `tempY=${y}`).toBe(
        false,
      );
    }
  });

  it("never collides with the scrub track or its handle", () => {
    // The track is a 4px stroke centred on scrubTop; the handle a circle there.
    const track: [number, number] = [L.scrubTop - 2, L.scrubTop + 2];
    const handle: [number, number] = [L.scrubTop - L.handleR, L.scrubTop + L.handleR];
    for (const y of positions) {
      const b = box(tempLabelBaselineY(y, L), L);
      if (L.hasTrack) expect(overlaps(b, track), `track, tempY=${y}`).toBe(false);
      expect(overlaps(b, handle), `handle, tempY=${y}`).toBe(false);
    }
  });

  it("still prefers sitting above the point when there is room", () => {
    const mid = (L.tempTop + L.tempBottom) / 2;
    expect(tempLabelBaselineY(mid, L)).toBe(mid + L.tempLabelDy);
  });

  it("flips below only near the top of the lane", () => {
    const flipped = positions.filter((y) => tempLabelBaselineY(y, L) > y);
    expect(flipped.length).toBeGreaterThan(0);
    // Contiguous run starting at the very top, i.e. one threshold, no oscillation
    expect(flipped[0]).toBe(L.tempTop);
    expect(Math.max(...flipped)).toBeLessThan((L.tempTop + L.tempBottom) / 2);
  });
});

/** Points whose maximum lands exactly on the top tick — the worst case */
function pointsPeakingAtTopTick(): HourPoint[] {
  const start = Date.UTC(2026, 6, 8, 0, 0, 0);
  const temps = [8, 9, 10, 11, 12, 12, 11, 10, 9, 8, 9, 10];
  expect(temperatureTicks(temps).at(-1)).toBe(12); // hi === data max
  return temps.map((tempC, i) => {
    const utcMs = start + i * 3_600_000;
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
  });
}

describe("buildMeteogram — emitted temperature labels", () => {
  const { svg } = buildMeteogram(pointsPeakingAtTopTick(), labels("is"), 0, LAYOUT_FULL);

  // In the plot SVG the degree sign appears only on temperature value labels:
  // axis tick labels live in a separate pinned strip.
  const baselines = [...svg.matchAll(/<text [^>]*y="([\d.]+)"[^>]*>-?\d+°<\/text>/g)].map(
    (m) => Number(m[1]),
  );

  it("emits labels through the clamped placement", () => {
    expect(baselines.length).toBeGreaterThan(0);
    for (const y of baselines) {
      const [top, bottom] = box(y, LAYOUT_FULL);
      expect(top).toBeGreaterThanOrEqual(LAYOUT_FULL.tempTop);
      expect(bottom).toBeLessThanOrEqual(LAYOUT_FULL.tempBottom);
    }
  });

  it("gives them a halo, since labels and symbols share every other column", () => {
    expect(svg).toContain('paint-order="stroke"');
  });
});

describe("temperatureTicks — a non-finite range never collapses the scale", () => {
  it("falls back to the default ladder when every reading is non-finite", () => {
    expect(temperatureTicks([NaN, NaN])).toEqual([0, 2, 4, 6, 8]);
  });

  it("ignores a stray NaN instead of returning no ticks at all", () => {
    const ticks = temperatureTicks([2, NaN, 8]);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true);
    expect(ticks[0]).toBeLessThanOrEqual(2);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(8);
  });
});
