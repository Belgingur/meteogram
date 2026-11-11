import { describe, expect, it } from "vitest";

import {
  CHART_EXPANDED,
  chartLayoutAtHeight,
  expandedChartHeight,
  expandedChartNeedsRedraw,
} from "../src/map-panel-graph";
import { CHART_SPEC } from "../src/layout";

/**
 * The expanded panel draws its chart at the height its column actually has
 * (see renderMapPanelGraph), instead of drawing CHART_EXPANDED's 560px and
 * scrolling. What that must NOT do is shrink the furniture: the day header and
 * the arrow strip are type and glyphs, so a shorter chart has to lose lane
 * height and keep its rows — that is the whole reason the reader stopped having
 * to scroll to find them.
 */
describe("chartLayoutAtHeight", () => {
  const base = CHART_EXPANDED;

  it("returns the base layout untouched at its own height", () => {
    expect(chartLayoutAtHeight(base, base.height)).toBe(base);
  });

  it("keeps the header, symbol row and arrow strip at their designed pixels", () => {
    for (const h of [300, 420, 700]) {
      const L = chartLayoutAtHeight(base, h);
      expect(L.height).toBe(h);
      // Day header + symbol row above the plot, arrow strip below it — all three
      // fixed, so plotTop and the tail are the same at every height.
      expect(L.plotTop).toBe(base.plotTop);
      expect(L.symbolTop).toBe(CHART_SPEC.headerPx);
      expect(L.symbolsPx).toBe(base.symbolsPx);
      expect(L.plotTop).toBe(CHART_SPEC.headerPx + L.symbolsPx);
      expect(L.height - L.plotBottom).toBe(base.height - base.plotBottom);
      expect(L.height - L.plotBottom).toBe(CHART_SPEC.arrowsPx);
    }
  });

  it("gives the whole height difference to the lanes", () => {
    const short = chartLayoutAtHeight(base, base.height - 200);
    const lanes = (l: typeof base): number => l.plotBottom - l.plotTop;
    expect(lanes(base) - lanes(short)).toBe(200);
    // Both lanes shrink — the temperature lane is not starved to spare the wind
    // one, nor the reverse.
    expect(short.tempBase - short.tempTop).toBeLessThan(
      base.tempBase - base.tempTop,
    );
    expect(short.windBase - short.windTop).toBeLessThan(
      base.windBase - base.windTop,
    );
  });

  it("carries the non-geometric layout through unchanged", () => {
    const L = chartLayoutAtHeight(base, 320);
    expect(L.colW).toBe(base.colW);
    expect(L.symbolSize).toBe(base.symbolSize);
    expect(L.symbolEvery).toBe(base.symbolEvery);
    expect(L.arrowEvery).toBe(base.arrowEvery);
    expect(L.dayLabelSize).toBe(base.dayLabelSize);
    expect(L.hourLabelSize).toBe(base.hourLabelSize);
    expect(L.axisFont).toBe(base.axisFont);
  });

  it("keeps the lane chips inside their lanes at any height", () => {
    for (const h of [260, 380, 560, 820]) {
      const L = chartLayoutAtHeight(base, h);
      const [tempChip, precipChip, windChip] = L.laneChipY;
      expect(tempChip).toBeGreaterThanOrEqual(L.plotTop);
      expect(precipChip).toBeGreaterThanOrEqual(L.plotTop);
      expect(windChip).toBeGreaterThanOrEqual(L.windTop);
      expect(windChip).toBeLessThan(L.windBase);
    }
  });
});

/**
 * The expanded chart shares its column with its own horizontal scrollbar, so
 * the height it is drawn at leaves the scrollbar's thickness free, measured
 * from the painted scroller (offsetHeight - clientHeight), never assumed.
 */
describe("expandedChartHeight", () => {
  it("takes a classic scrollbar's measured thickness off the column", () => {
    expect(expandedChartHeight(632, { offsetHeight: 640, clientHeight: 632 })).toBe(624);
    expect(expandedChartHeight(632, { offsetHeight: 646, clientHeight: 632 })).toBe(618);
  });

  it("takes nothing off for an overlay scrollbar, which takes no room", () => {
    expect(expandedChartHeight(632, { offsetHeight: 632, clientHeight: 632 })).toBe(632);
  });

  it("takes nothing off without a scroller", () => {
    expect(expandedChartHeight(632, null)).toBe(632);
  });
});

/**
 * The expanded column can change height after the chart was drawn for it, with
 * nothing resized (a web font that loads late re-flows the text above it). The
 * chart is then drawn again, by the same rule as after its first paint (#32).
 */
describe("expandedChartNeedsRedraw", () => {
  const bar = { offsetHeight: 629, clientHeight: 618 }; // an 11px classic scrollbar
  const none = { offsetHeight: 618, clientHeight: 618 }; // an overlay scrollbar

  it("leaves a chart drawn for the column's height alone", () => {
    expect(expandedChartNeedsRedraw(618, bar, 607)).toBe(false);
    expect(expandedChartNeedsRedraw(618, none, 618)).toBe(false);
  });

  it("redraws when the column shrank: the chart would overflow it", () => {
    // Drawn at 607 for a 618px column; the font loads and the column is 606.
    expect(expandedChartNeedsRedraw(606, bar, 607)).toBe(true);
  });

  it("redraws when the column grew", () => {
    expect(expandedChartNeedsRedraw(640, bar, 607)).toBe(true);
  });

  it("redraws for any shrink, even 1px: the column doesn't scroll, so the overflow would cut into the scrollbar", () => {
    expect(expandedChartNeedsRedraw(617, bar, 607)).toBe(true);
    expect(expandedChartNeedsRedraw(616, bar, 607)).toBe(true);
  });

  it("ignores growth of 2px or less", () => {
    expect(expandedChartNeedsRedraw(619, bar, 607)).toBe(false);
    expect(expandedChartNeedsRedraw(620, bar, 607)).toBe(false);
    expect(expandedChartNeedsRedraw(621, bar, 607)).toBe(true);
  });

  it("counts the scrollbar: the same column needs a shorter chart with a classic bar", () => {
    expect(expandedChartNeedsRedraw(618, none, 607)).toBe(true);
    expect(expandedChartNeedsRedraw(618, bar, 618)).toBe(true);
  });

  it("doesn't redraw for a column too short to draw a chart in", () => {
    expect(expandedChartNeedsRedraw(200, bar, 607)).toBe(false);
  });
});
