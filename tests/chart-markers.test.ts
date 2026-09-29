import { DATA_COLORS } from "../src/colors";
import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import {
  CHART_COMPACT,
  CHART_EXPANDED,
  chartBlock,
  resolveChartLayout,
} from "../src/map-panel-graph";
import { nowMarkerIndex } from "../src/graph-card";
import { buildMeteogram, windMax } from "../src/render";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * Two marker defects in the panel chart:
 *
 *  1. The accent (orange) line sat on the ANALYSIS time — which is the chart's
 *     own left edge for a fresh run — while "now", the thing a reader actually
 *     looks for, was a grey hairline three hours to its right.
 *  2. The midnight divider was drawn on the 00:00 column's left EDGE. Every
 *     other mark for an hour (its label, its temperature point, its bars) sits
 *     on the column's centre, so the boundary landed half an hour early and
 *     read as a rendering fault.
 */

const HOUR = 3_600_000;

function hours(startUtcMs: number, count: number): HourPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const utcMs = startUtcMs + i * HOUR;
    return {
      local: new Date(utcMs),
      utcMs,
      tempC: 9,
      precipMm: 0,
      precipMaxMm: 0,
      windMs: 5,
      gustMs: 9,
      dirDeg: 200,
      symbol: weatherSymbolCode(0, 0.5, 0, 1),
    };
  });
}

/** 09:00 UTC on a day, running 40 h so exactly one midnight falls inside. */
const START = Date.UTC(2026, 8, 17, 9);
const POINTS = hours(START, 40);
const MIDNIGHT_I = POINTS.findIndex((p) => p.local.getUTCHours() === 0);

const attrs = (svg: string, cls: string): Record<string, string> => {
  const tag = svg.match(new RegExp(`<line class="${cls}"[^>]*>`))?.[0] ?? "";
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
};

describe("panel chart markers", () => {
  const L = CHART_EXPANDED;
  const svg = chartBlock(POINTS, labels("is"), 5, 3, 0, L, false);
  const cx = (i: number): number => i * L.colW + L.colW / 2;

  it("puts the accent line on now and leaves the analysis time a hairline", () => {
    const now = attrs(svg, "chart-now");
    const ana = attrs(svg, "chart-ana");

    expect(now.stroke).toBe(DATA_COLORS.now);
    expect(now["stroke-dasharray"]).toBeUndefined();
    expect(Number(now.x1)).toBe(cx(3));

    expect(ana.stroke).toBe(DATA_COLORS.neutral);
    expect(ana["stroke-dasharray"]).toBe("4 3");
    expect(Number(ana.x1)).toBe(cx(0));
  });

  it("draws the day divider on the 00:00 column, not half an hour before it", () => {
    expect(MIDNIGHT_I).toBeGreaterThan(0);
    const xs = [...svg.matchAll(/<line x1="([\d.]+)" x2="\1" y1="[\d.]+" y2="[\d.]+" stroke="#C2CBD2"/g)]
      .map((m) => Number(m[1]));

    expect(xs).toContain(cx(MIDNIGHT_I));
    expect(xs).not.toContain(MIDNIGHT_I * L.colW);
  });
});

describe("landing meteogram day divider", () => {
  it("also sits on the 00:00 column centre", () => {
    const { svg, geo } = buildMeteogram(POINTS, labels("is"), 5);
    const dashed = [...svg.matchAll(/<line x1="([\d.]+)" x2="\1"[^>]*stroke-dasharray="3 3"/g)]
      .map((m) => Number(m[1]));

    expect(dashed).toContain(geo.cx(MIDNIGHT_I));
  });
});

/**
 * The phone chart had no "now" line at all — only the desktop panel drew one —
 * so the current hour was findable on one surface and not the other.
 */
describe("landing meteogram now marker", () => {
  it("draws the same accent line as the panel chart on the now column", () => {
    const { svg, geo } = buildMeteogram(POINTS, labels("is"), 5, undefined, 3);
    const now = attrs(svg, "chart-now");

    expect(now.stroke).toBe(DATA_COLORS.now);
    expect(now["stroke-dasharray"]).toBeUndefined();
    expect(Number(now.x1)).toBe(geo.cx(3));
    expect(svg).toContain('class="chart-now-dot"');
  });

  it("sits under the scrubber so a moved cursor stays on top", () => {
    const { svg } = buildMeteogram(POINTS, labels("is"), 5, undefined, 3);
    expect(svg.indexOf('class="chart-now"')).toBeLessThan(
      svg.indexOf('class="scrub-cursor"'),
    );
  });

  it("is omitted when now is outside the series", () => {
    const { svg } = buildMeteogram(POINTS, labels("is"), 5, undefined, -1);
    expect(svg).not.toContain("chart-now");
  });
});

describe("nowMarkerIndex", () => {
  it("finds the column holding now", () => {
    expect(nowMarkerIndex(POINTS, START + 3 * HOUR + 10 * 60_000)).toBe(3);
  });

  it("declines rather than clamp to an edge", () => {
    expect(nowMarkerIndex(POINTS, START - 2 * HOUR)).toBe(-1);
    expect(nowMarkerIndex(POINTS, START + 45 * HOUR)).toBe(-1);
    expect(nowMarkerIndex([], START)).toBe(-1);
  });
});

describe("panel chart now marker outside the run", () => {
  it("draws no now line rather than parking one on an edge column", () => {
    const svg = chartBlock(POINTS, labels("is"), 5, -1, 0, CHART_EXPANDED, false);
    expect(svg).not.toContain("chart-now");
    // The analysis hairline is independent of now and stays.
    expect(svg).toContain("chart-ana");
  });
});

/**
 * The panel chart's wind lane had a fixed 15 m/s (20 expanded) top and clamped
 * to it, so every stronger wind or gust was drawn flat along the lane's top
 * edge, while the phone chart scaled to the same data and showed the peak.
 */
describe("panel chart wind scale", () => {
  const stormy = POINTS.map((p, i) => ({
    ...p,
    windMs: 8 + (i % 10),
    gustMs: 12 + (i % 10) * 1.6,
  }));

  it("grows past the layout's floor to fit the data, as the phone does", () => {
    for (const base of [CHART_COMPACT, CHART_EXPANDED]) {
      const L = resolveChartLayout(base, stormy);
      expect(L.windMax).toBe(Math.max(base.windMax, windMax(stormy)));
      expect(L.windMax).toBeGreaterThanOrEqual(26.4);
      expect(Math.max(...L.windTicks)).toBeLessThanOrEqual(L.windMax);
    }
  });

  it("keeps the layout's own scale for calm data", () => {
    const L = resolveChartLayout(CHART_EXPANDED, POINTS);
    expect(L.windMax).toBe(Math.max(CHART_EXPANDED.windMax, windMax(POINTS)));
  });

  it("no longer flattens the gust peaks onto one line", () => {
    const L = resolveChartLayout(CHART_COMPACT, stormy);
    const svg = chartBlock(stormy, labels("is"), 5, 3, 0, L, false);
    const gust = svg.match(/<path d="([^"]+)"[^>]*stroke-dasharray="4 4"/)?.[1] ?? "";
    const ys = [...gust.matchAll(/[\d.]+[ ,]([\d.]+)/g)].map((m) => Number(m[1]));
    const top = Math.min(...ys);
    // 12..26.4 m/s: only the true peak may sit on the highest y.
    expect(ys.filter((y) => y === top).length).toBeLessThan(ys.length / 5);
  });
});
