import { describe, expect, it } from "vitest";

import {
  ARROW_STRIP_MIN,
  CHART_FIT_SELECTORS,
  fittedLaneY,
  fittedWidth,
  hasArrowStrip,
  MIN_FIT_HEIGHT,
  resolveChartFit,
  resolveYrBands,
  YR_SPEC,
  yrHeaderBaselines,
  yrLaneChipY,
  type YrSpec,
} from "../src/layout";
import { labels } from "../src/i18n";
import { chartBlock } from "../src/map-panel-graph";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * The bands each chart was hand-typed with before the spec existed, as the
 * fixed/flex split that reproduces them. Fixtures, not production values: they
 * exist so the tests can show the model is faithful and say exactly what the
 * shared spec moved.
 */
const LEGACY_COMPACT_SPEC: YrSpec = {
  headerPx: 40,
  // The legacy charts had no symbol row — the glyphs floated in the temp lane.
  symbolsPx: 0,
  arrowsPx: 12,
  temp: 126,
  gap: 16,
  wind: 68,
};

const LEGACY_FULLSCREEN_SPEC: YrSpec = {
  headerPx: 66,
  symbolsPx: 0,
  arrowsPx: 74,
  temp: 254,
  gap: 36,
  wind: 130,
};

/** Chart heights the yr renderer is asked for across the four surfaces. */
const HEIGHTS = [140, 180, 200, 262, 360, 560, 900, 1400];

describe("resolveYrBands", () => {
  it("reproduces the geometry each chart was hand-typed with", () => {
    // Proof that the band model is faithful: fed the old fixed/flex split, it
    // returns the exact pixel tables that used to be typed out by hand. Any
    // difference from today's charts is therefore the shared spec's doing, not
    // the mechanism's.
    expect(resolveYrBands(LEGACY_COMPACT_SPEC, 262)).toEqual({
      height: 262,
      symbolTop: 40,
      symbolsPx: 0,
      plotTop: 40,
      tempTop: 40,
      tempBase: 166,
      windTop: 182,
      windBase: 250,
      plotBottom: 250,
    });
    expect(resolveYrBands(LEGACY_FULLSCREEN_SPEC, 560)).toEqual({
      height: 560,
      symbolTop: 66,
      symbolsPx: 0,
      plotTop: 66,
      tempTop: 66,
      tempBase: 320,
      windTop: 356,
      windBase: 486,
      plotBottom: 486,
    });
  });

  it("keeps chrome the same size at every chart height", () => {
    // The point of the fixed/flex split: a landscape phone's day header is the
    // same height as a desktop overlay's, so the text does not get inflated or
    // crushed by how tall the chart happens to be.
    for (const height of HEIGHTS) {
      const bands = resolveYrBands(YR_SPEC, height);
      // plotTop is the header plus the symbol row, so the header itself is what
      // is left when the row it gained is taken back off.
      expect(bands.plotTop - bands.symbolsPx).toBe(YR_SPEC.headerPx);
      expect(bands.height - bands.plotBottom).toBe(YR_SPEC.arrowsPx);
    }
  });

  it("keeps the symbol row at full size on every height a chart really uses", () => {
    // 140px is the robustness probe, not a surface: landscape fit-scales the
    // 262px compact chart rather than resolving bands that short. Everything a
    // renderer actually asks for can afford the row.
    for (const height of HEIGHTS.filter((h) => h >= 180)) {
      expect(resolveYrBands(YR_SPEC, height).symbolsPx).toBe(YR_SPEC.symbolsPx);
    }
    // And when it cannot, the row gives way instead of the header or the arrows.
    const cramped = resolveYrBands(YR_SPEC, 140);
    expect(cramped.symbolsPx).toBeLessThan(YR_SPEC.symbolsPx);
    expect(cramped.plotTop - cramped.symbolsPx).toBe(YR_SPEC.headerPx);
    expect(cramped.height - cramped.plotBottom).toBe(YR_SPEC.arrowsPx);
  });

  it("gives every size the same lane proportions", () => {
    const share = (height: number) => {
      const b = resolveYrBands(YR_SPEC, height);
      const lanes = b.plotBottom - b.plotTop;
      return (b.tempBase - b.tempTop) / lanes;
    };
    // The old tables disagreed by three points here (48.1% vs 45.4%).
    const shares = HEIGHTS.map(share);
    for (const s of shares) {
      expect(s).toBeCloseTo(shares[0], 2);
    }
  });

  it("keeps the bands ordered and inside the chart at any height", () => {
    for (const spec of [YR_SPEC, LEGACY_COMPACT_SPEC, LEGACY_FULLSCREEN_SPEC]) {
      for (const height of HEIGHTS) {
        const b = resolveYrBands(spec, height);
        expect(b.plotTop).toBeGreaterThanOrEqual(0);
        expect(b.tempBase).toBeGreaterThan(b.tempTop);
        expect(b.windTop).toBeGreaterThanOrEqual(b.tempBase);
        expect(b.windBase).toBeGreaterThan(b.windTop);
        expect(b.plotBottom).toBeLessThanOrEqual(height);
      }
    }
  });

  it("yields to the lanes rather than crushing them on a very short chart", () => {
    const bands = resolveYrBands(YR_SPEC, 90);
    expect(bands.plotTop).toBeLessThan(YR_SPEC.headerPx);
    expect(bands.plotBottom - bands.plotTop).toBeGreaterThanOrEqual(55);
  });

  it("does not compound rounding error down the stack", () => {
    const spec: YrSpec = {
      headerPx: 7,
      symbolsPx: 0,
      arrowsPx: 5,
      temp: 13,
      gap: 3,
      wind: 11,
    };
    const height = 333;
    const b = resolveYrBands(spec, height);
    const lanes = height - 12;
    expect(b.plotBottom).toBe(7 + Math.round(((13 + 3 + 11) / 27) * lanes));
  });

  it("degrades safely for a spec with no lanes", () => {
    const zero: YrSpec = {
      headerPx: 0,
      symbolsPx: 0,
      arrowsPx: 0,
      temp: 0,
      gap: 0,
      wind: 0,
    };
    expect(() => resolveYrBands(zero, 262)).not.toThrow();
  });
});

describe("hasArrowStrip", () => {
  it("gives every size a real arrow strip under the shared spec", () => {
    // The docked panel used to have only 12px of tail, so it drew its arrows
    // inside the wind lane, on top of the line. Now every size draws them in
    // the same place.
    for (const height of HEIGHTS) {
      expect(hasArrowStrip(resolveYrBands(YR_SPEC, height))).toBe(true);
    }
    expect(YR_SPEC.arrowsPx).toBeGreaterThanOrEqual(ARROW_STRIP_MIN);
  });

  it("still reports the old panel geometry as having none", () => {
    expect(hasArrowStrip(resolveYrBands(LEGACY_COMPACT_SPEC, 262))).toBe(false);
  });
});

describe("yrHeaderBaselines", () => {
  it("keeps both label rows inside the header, above the plot", () => {
    for (const height of HEIGHTS) {
      for (const size of [10, 13, 16, 20]) {
        const bands = resolveYrBands(YR_SPEC, height);
        const { dayLabelY, hourLabelY } = yrHeaderBaselines(bands, size);
        expect(dayLabelY).toBeGreaterThan(0);
        expect(hourLabelY).toBeGreaterThan(dayLabelY);
        // The regression this guards: an hour-label baseline below plotTop puts
        // the row inside the plot, printed over the gridlines.
        expect(hourLabelY).toBeLessThanOrEqual(bands.plotTop);
      }
    }
  });

  it("reproduces the panel's original baselines for its own type size", () => {
    const bands = resolveYrBands(LEGACY_COMPACT_SPEC, 262);
    expect(yrHeaderBaselines(bands, 13)).toEqual({
      dayLabelY: 15,
      hourLabelY: 32,
    });
  });
});

describe("resolveChartFit", () => {
  it("scales the chart's base height onto the space available", () => {
    expect(resolveChartFit(560, 280)).toEqual({ scale: 0.5, heightPx: 280 });
    expect(resolveChartFit(262, 524)).toEqual({ scale: 2, heightPx: 524 });
  });

  it("declines to fit into a space too small to be worth it", () => {
    expect(resolveChartFit(560, MIN_FIT_HEIGHT - 1)).toBeNull();
    expect(resolveChartFit(0, 400)).toBeNull();
    expect(resolveChartFit(560, 0)).toBeNull();
  });
});

describe("fitted dimensions", () => {
  it("keeps widths fractional so the drawing agrees with the pointer maths", () => {
    // The regression: rounding the width made the horizontal scale
    // round(w·s)/w instead of s, so the scrub cursor drifted further from its
    // column the further right you scrubbed.
    const fit = resolveChartFit(560, 331)!;
    const width = fittedWidth(1234, fit);
    expect(width).not.toBe(Math.round(width));
    expect(width / 1234).toBe(fit.scale);
  });

  it("moves lane chips by exactly the same scale as the plot", () => {
    const fit = resolveChartFit(262, 200)!;
    for (const baseY of [48, 120, 190]) {
      expect(fittedLaneY(baseY, fit) / baseY).toBeCloseTo(fit.scale, 10);
    }
  });

  it("is an identity at scale 1", () => {
    const fit = resolveChartFit(262, 262)!;
    expect(fittedWidth(500, fit)).toBe(500);
    expect(fittedLaneY(48, fit)).toBe(48);
  });
});

describe("CHART_FIT_SELECTORS", () => {
  /** A chart layout resolved the way the renderer resolves one. */
  const resolveYrLayoutForTest = () => ({
    colW: 42,
    axisW: 52,
    rightAxisW: 28,
    axisFont: 11,
    ...resolveYrBands(YR_SPEC, 560),
    precipBase: resolveYrBands(YR_SPEC, 560).tempBase,
    ...yrHeaderBaselines(resolveYrBands(YR_SPEC, 560), 16),
    laneChipY: yrLaneChipY(resolveYrBands(YR_SPEC, 560), 84),
    tempLo: 0,
    tempHi: 10,
    tempTicks: [0, 5, 10],
    windMax: 20,
    windTicks: [5, 10, 15, 20],
    precipPerMm: 40,
    precipCap: 84,
    precipMaxW: 18,
    precipW: 12,
    symbolScale: 0.82,
    symbolSize: 26,
    plotPad: 16,
    dayLabelSize: 16,
    hourLabelSize: 11,
    tempLabelEvery: 0,
    windLabelEvery: 0,
    symbolEvery: 2,
    arrowEvery: 2,
    gridEvery: 1,
    tempStroke: 2.8,
    windStroke: 2.4,
  });

  const points: HourPoint[] = Array.from({ length: 12 }, (_, i) => ({
    local: new Date(Date.UTC(2026, 7, 12, i)),
    utcMs: Date.UTC(2026, 7, 12, i),
    tempC: 8 + i * 0.5,
    precipMm: 0.4,
    precipMaxMm: 0.8,
    windMs: 5,
    gustMs: 9,
    dirDeg: 180,
    symbol: weatherSymbolCode(0, 0.5, 0, 1),
  }));

  it("covers every SVG the chart renders", () => {
    // The bug this guards: the chart draws three SVGs that share one y-scale,
    // but the overlay's fit only ever stretched two of them, leaving the
    // right-hand precip axis at full height with its ticks off the gridlines.
    const html = chartBlock(
      points,
      labels("is"),
      0,
      0,
      0,
      resolveYrLayoutForTest(),
      true,
    );
    const rendered = [...html.matchAll(/<svg class="(yr-[\w-]+)"/g)].map(
      (m) => `.${m[1]}`,
    );
    expect(rendered.sort()).toEqual([".yr-axis", ".yr-axis-right", ".yr-plot"]);
    for (const selector of rendered) {
      expect(CHART_FIT_SELECTORS).toContain(selector);
    }
  });

  it("lists the plot itself, which anchors the scale", () => {
    expect(CHART_FIT_SELECTORS).toContain(".yr-plot");
  });
});

describe("yrLaneChipY", () => {
  it("puts each chip inside its own lane, clear of the tallest precip bar", () => {
    for (const height of [200, 262, 560, 900]) {
      const bands = resolveYrBands(YR_SPEC, height);
      const precipCap = Math.round((height / 262) * 44);
      const [temp, precip, wind] = yrLaneChipY(bands, precipCap);
      expect(temp).toBeGreaterThanOrEqual(bands.tempTop);
      expect(temp).toBeLessThan(bands.tempBase);
      expect(precip).toBeLessThanOrEqual(bands.tempBase - precipCap);
      expect(wind).toBeGreaterThanOrEqual(bands.windTop);
      expect(wind).toBeLessThan(bands.windBase);
    }
  });

  it("reproduces the panel's original chip positions", () => {
    const bands = resolveYrBands(LEGACY_COMPACT_SPEC, 262);
    expect(yrLaneChipY(bands, 44)).toEqual([48, 120, 190]);
  });
});
