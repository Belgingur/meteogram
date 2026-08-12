import { describe, expect, it } from "vitest";

import {
  ARROW_STRIP_MIN,
  hasArrowStrip,
  LEGACY_COMPACT_SPEC,
  LEGACY_FULLSCREEN_SPEC,
  resolveYrBands,
  YR_SPEC,
  yrHeaderBaselines,
  yrLaneChipY,
  type YrSpec,
} from "../src/layout";

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
      plotTop: 40,
      tempTop: 40,
      tempBase: 166,
      windTop: 182,
      windBase: 250,
      plotBottom: 250,
    });
    expect(resolveYrBands(LEGACY_FULLSCREEN_SPEC, 560)).toEqual({
      height: 560,
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
      expect(bands.plotTop).toBe(YR_SPEC.headerPx);
      expect(bands.height - bands.plotBottom).toBe(YR_SPEC.arrowsPx);
    }
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
