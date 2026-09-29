import { describe, expect, it } from "vitest";

import { DATA_COLORS } from "../src/colors";
import { labels } from "../src/i18n";
import {
  CHART_SPEC,
  chartHeaderBaselines,
  chartLaneChipY,
  resolveChartBands,
} from "../src/layout";
import { chartBlock, tempColorPanel } from "../src/map-panel-graph";
import { buildMeteogram, tempColor } from "../src/render";
import { componentStyles } from "../src/styles";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * The widget draws the same readings through three paths — the DOM
 * (`styles.ts`), the phone chart (`render.ts`) and the map-panel chart
 * (`map-panel-graph.ts`) — and each used to spell its own hex. They drifted:
 * temperature was `#C81D25` in the map panel and `#D14B4B` on the phone, so the
 * same line changed colour when the panel crossed 700 px, and a phone in
 * landscape showed BOTH at once (chart in one red, day chips and table in the
 * other). The day summary printed rain in the sub-zero blue.
 *
 * These tests fix the rule rather than the values: one palette, read by every
 * surface. A new hex typed straight into a chart or a stylesheet fails here.
 */

const points: HourPoint[] = Array.from({ length: 12 }, (_, i) => ({
  local: new Date(Date.UTC(2026, 8, 12, i)),
  utcMs: Date.UTC(2026, 8, 12, i),
  tempC: 8 + i * 0.5,
  precipMm: 0.4,
  precipMaxMm: 0.8,
  windMs: 5,
  gustMs: 9,
  dirDeg: 180,
  symbol: weatherSymbolCode(0, 0.5, 0, 1),
}));

const panelLayout = () => {
  const bands = resolveChartBands(CHART_SPEC, 560);
  return {
    colW: 42,
    axisW: 52,
    rightAxisW: 28,
    axisFont: 11,
    ...bands,
    precipBase: bands.tempBase,
    ...chartHeaderBaselines(bands, 16),
    laneChipY: chartLaneChipY(bands, 84),
    tempLo: 0,
    tempHi: 20,
    tempTicks: [0, 10, 20],
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
    tempLabelFont: 11,
    windLabelEvery: 0,
    symbolEvery: 2,
    arrowEvery: 2,
    gridEvery: 1,
    tempStroke: 2.8,
    windStroke: 2.4,
  };
};

/** Every hex literal in a string, upper-cased and de-duplicated. */
const hexes = (s: string): string[] => [
  ...new Set((s.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((h) => h.toUpperCase())),
];

const PALETTE = Object.values(DATA_COLORS).map((c) => c.toUpperCase());

/**
 * Structure, not data: the plot's own ground, gridlines, hairlines and label
 * ink. They are allowed to be spelled in the renderer — what may not be is a
 * colour that ENCODES a reading.
 */
const STRUCTURAL = ["#FFFFFF", "#EEF1F4", "#EAEEF1", "#DCE3E8", "#14202B"];

/** The reds and blues that used to be typed per file. */
const RETIRED = ["#D14B4B"];

describe("data-encoding colours", () => {
  it("give one temperature colour to both charts", () => {
    for (const t of [-8, -0.5, 0, 0.5, 12]) {
      expect(tempColorPanel(t)).toBe(tempColor(t));
    }
    expect(tempColor(12)).toBe(DATA_COLORS.temp);
    expect(tempColor(-12)).toBe(DATA_COLORS.tempCold);
  });

  it("paint the temperature line the same red in both renderers", () => {
    const phone = buildMeteogram(points, labels("en"), 0).svg;
    const panel = chartBlock(
      points,
      labels("en"),
      0,
      0,
      0,
      panelLayout(),
      true,
    );
    for (const svg of [phone, panel]) {
      expect(svg).toContain(DATA_COLORS.temp);
      for (const retired of RETIRED) expect(svg).not.toContain(retired);
    }
  });

  it("leave no data colour spelled outside the palette", () => {
    // The stylesheet keeps its own neutral tokens (ink, haze, rules); what it
    // may not do is restate a READING's colour. Both charts are pure data.
    const phone = buildMeteogram(points, labels("en"), 0);
    const chartHexes = hexes(phone.svg + phone.axisSvg + phone.rightAxisSvg);
    const stray = chartHexes.filter(
      (h) => !PALETTE.includes(h) && !STRUCTURAL.includes(h),
    );
    expect(stray).toEqual([]);
    for (const retired of RETIRED) {
      expect(componentStyles).not.toContain(retired);
    }
  });

  it("print precipitation in the precipitation blue, not the sub-zero blue", () => {
    // `.sel-stat-precip` and the hero card's rain value both used #2E6FB2 —
    // the colour this widget reserves for a temperature below freezing.
    expect(componentStyles).toContain(
      `.sel-stat-precip { color: ${DATA_COLORS.precip}; }`,
    );
    expect(DATA_COLORS.precip).not.toBe(DATA_COLORS.tempCold);
  });
});
