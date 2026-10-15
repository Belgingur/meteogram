import { describe, expect, it } from "vitest";

import { DATA_COLORS } from "../src/colors";
import { labels } from "../src/i18n";
import {
  CHART_COMPACT,
  CHART_EXPANDED,
  chartBlock,
  resolveChartLayout,
} from "../src/map-panel-graph";
import {
  buildMeteogram,
  LAYOUT_COMPACT,
  LAYOUT_FULL,
  precipLaneShare,
  precipScaleMm,
} from "../src/render";
import type { HourPoint } from "../src/types";

const t = labels("en");

/** 24 dry hours with the given precipitation (mm) in the first columns. */
function points(rain: number[], rainMax: number[] = rain): HourPoint[] {
  return Array.from({ length: 24 }, (_, i) => ({
    local: new Date(Date.UTC(2026, 9, 15, i)),
    utcMs: Date.UTC(2026, 9, 15, i),
    tempC: 6,
    precipMm: rain[i] ?? 0,
    precipMaxMm: rainMax[i] ?? 0,
    windMs: 5,
    gustMs: 8,
    dirDeg: 180,
    symbol: "09",
  }));
}

/** Heights of every <rect> filled with `fill`, in document order. */
function barHeights(svg: string, fill: string): number[] {
  const out: number[] = [];
  for (const m of svg.matchAll(/<rect\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    if (!attrs.includes(`fill="${fill}"`)) continue;
    out.push(Number(/\bheight="([-\d.]+)"/.exec(attrs)?.[1]));
  }
  return out;
}

describe("precipScaleMm", () => {
  it("keeps the layout's own scale for a dry or light forecast", () => {
    expect(precipScaleMm(points([]), 2)).toBe(2);
    expect(precipScaleMm(points([0.4, 1.8]), 2)).toBe(2);
    expect(precipScaleMm(points([2]), 2)).toBe(2);
  });

  it("stretches to the wettest bar, rounded up to a tidy value", () => {
    expect(precipScaleMm(points([2.3]), 2)).toBe(2.5);
    expect(precipScaleMm(points([3.7]), 2)).toBe(4);
    expect(precipScaleMm(points([7]), 2)).toBe(8);
    expect(precipScaleMm(points([12]), 2)).toBe(15);
    expect(precipScaleMm(points([23]), 2)).toBe(25);
  });

  it("counts the lighter max-precip bar too", () => {
    expect(precipScaleMm(points([1], [5.5]), 2)).toBe(6);
  });

  it("ignores readings the model does not have", () => {
    const p = points([NaN, 1]);
    p[2].precipMaxMm = Number.POSITIVE_INFINITY;
    expect(precipScaleMm(p, 2)).toBe(2);
  });
});

describe("precipLaneShare", () => {
  it("draws a dry run exactly as the lane always has", () => {
    const s = { baseMm: 2, topMm: 2 };
    expect(precipLaneShare(0.5, s)).toBeCloseTo(0.25, 9);
    expect(precipLaneShare(1, s)).toBeCloseTo(0.5, 9);
    expect(precipLaneShare(2, s)).toBe(1);
  });

  it("gives up only as much of the ruler as a slightly wetter run needs", () => {
    const s = { baseMm: 2, topMm: 3 };
    expect(precipLaneShare(1, s)).toBeCloseTo(1 / 3, 9);
    expect(precipLaneShare(2, s)).toBeCloseTo(2 / 3, 9);
    expect(precipLaneShare(3, s)).toBeCloseTo(1, 9);
  });

  it("keeps a 0–base ruler in the bottom half of a wetter run", () => {
    for (const topMm of [4, 5, 8, 15, 40]) {
      const s = { baseMm: 2, topMm };
      expect(precipLaneShare(1, s)).toBeCloseTo(0.25, 9);
      expect(precipLaneShare(2, s)).toBeCloseTo(0.5, 9);
      expect(precipLaneShare(topMm, s)).toBeCloseTo(1, 9);
    }
  });

  it("gives each doubling above the base the same height", () => {
    const s = { baseMm: 2, topMm: 16 };
    expect(precipLaneShare(4, s)).toBeCloseTo(0.5 + 1 / 6, 9);
    expect(precipLaneShare(8, s)).toBeCloseTo(0.5 + 2 / 6, 9);
  });

  it("never redraws a bar in a jump as the run gets slightly wetter", () => {
    for (const topMm of [2, 3, 4, 6, 15]) {
      for (const mm of [0.5, 1, 2, 2.5, 3, 4, 6]) {
        if (mm > topMm) continue;
        const s = { baseMm: 2, topMm };
        const wetter = { baseMm: 2, topMm: topMm + 1e-4 };
        expect(precipLaneShare(mm, wetter), `${mm}mm, top ${topMm}`).toBeCloseTo(
          precipLaneShare(mm, s),
          3,
        );
      }
    }
  });

  it("grows with the amount and never leaves the lane", () => {
    const s = { baseMm: 2, topMm: 15 };
    let prev = 0;
    for (let mm = 0.1; mm <= 15; mm += 0.1) {
      const share = precipLaneShare(mm, s);
      expect(share).toBeGreaterThan(prev);
      expect(share).toBeLessThanOrEqual(1);
      prev = share;
    }
    expect(precipLaneShare(0, s)).toBe(0);
    expect(precipLaneShare(-1, s)).toBe(0);
    expect(precipLaneShare(NaN, s)).toBe(0);
  });
});

describe.each([
  ["LAYOUT_FULL", LAYOUT_FULL],
  ["LAYOUT_COMPACT", LAYOUT_COMPACT],
])("phone chart precipitation (%s)", (_name, L) => {
  it("draws heavy rain in order instead of cutting it off at ~2mm", () => {
    const { svg } = buildMeteogram(points([1.5, 3, 6, 15]), t, 0, L);
    const [h15, h3, h6, h15mm] = barHeights(svg, DATA_COLORS.precip);
    expect(h15mm).toBeCloseTo(L.precipCap, 5);
    expect(h15).toBeLessThan(h3);
    expect(h3).toBeLessThan(h6);
    expect(h6).toBeLessThan(h15mm);
  });

  it("keeps light rain readable in a week with a downpour", () => {
    const { svg } = buildMeteogram(points([1, 15]), t, 0, L);
    const [h1] = barHeights(svg, DATA_COLORS.precip);
    // Half its dry-week height — not the fifteenth a straight stretch gave it.
    expect(h1).toBeCloseTo(L.precipPerMm / 2, 5);
  });

  it("draws light rain exactly as before", () => {
    const { svg } = buildMeteogram(points([1, 2]), t, 0, L);
    const [h1, h2] = barHeights(svg, DATA_COLORS.precip);
    expect(h1).toBeCloseTo(L.precipPerMm, 5);
    expect(h2).toBeCloseTo(2 * L.precipPerMm, 5);
  });

  it("labels the raised scale's top and the light-rain ruler", () => {
    const { rightAxisSvg } = buildMeteogram(points([9]), t, 0, L);
    const ticks = [...rightAxisSvg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(
      (m) => Number(m[1]),
    );
    expect(ticks).toContain(10);
    expect(ticks).toContain(2);
    for (const mm of ticks) expect(mm).toBeLessThanOrEqual(10);
  });
});

describe.each([
  ["CHART_COMPACT", CHART_COMPACT],
  ["CHART_EXPANDED", CHART_EXPANDED],
])("desktop chart precipitation (%s)", (_name, base) => {
  const baseMm = base.precipCap / base.precipPerMm;

  it("keeps the layout's scale and [1, 2] ladder for a light forecast", () => {
    const L = resolveChartLayout(base, points([0.5, 1.2]));
    expect(L.precipTopMm).toBe(baseMm);
    expect(L.precipTicks).toEqual([1, 2]);
  });

  it("raises the lane's top so the wettest bar fits, and relabels it", () => {
    const L = resolveChartLayout(base, points([4, 8]));
    expect(L.precipTopMm).toBe(8);
    expect(L.precipTicks).toContain(8);
    for (const mm of L.precipTicks) expect(mm).toBeLessThanOrEqual(8);
  });

  it("draws heavy rain in order instead of cutting it off", () => {
    const p = points([1, 4, 8]);
    const L = resolveChartLayout(base, p);
    const html = chartBlock(p, t, 0, -1, -1, L, false);
    const [h1, h4, h8] = barHeights(html, DATA_COLORS.precip);
    expect(h8).toBeCloseTo(L.precipCap, 5);
    expect(h4).toBeLessThan(h8);
    expect(h1).toBeLessThan(h4);
    // The light hour keeps half its dry-week height.
    expect(h1).toBeCloseTo(base.precipPerMm / 2, 5);
  });

  it("gives the same layout when resolved twice", () => {
    const p = points([4, 8]);
    const once = resolveChartLayout(base, p);
    expect(resolveChartLayout(once, p)).toEqual(once);
  });
});
