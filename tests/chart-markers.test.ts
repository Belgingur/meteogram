import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { CHART_EXPANDED, chartBlock } from "../src/map-panel-graph";
import { buildMeteogram } from "../src/render";
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

    expect(now.stroke).toBe("#F0A32F");
    expect(now["stroke-dasharray"]).toBeUndefined();
    expect(Number(now.x1)).toBe(cx(3));

    expect(ana.stroke).toBe("#6B7A86");
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
