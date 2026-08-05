import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import {
  buildMeteogram,
  formatPrecipTick,
  LAYOUT_COMPACT,
  LAYOUT_FULL,
  type MeteogramLayout,
  PRECIP_TICK_COLOR,
  PRECIP_TICKS,
  TICK_LABEL_DY,
  windTicksFor,
} from "../src/render";
import type { HourPoint } from "../src/types";

/**
 * The value axes are pinned strips mounted OUTSIDE the horizontal scroller, so
 * they stay put while the plot scrolls (matching the desktop .yr-chart). These
 * tests pin down the two invariants that would silently break that:
 *   1. no tick labels are left inside the scrolling plot, and
 *   2. every tick label shares its y with the gridline it names — which is what
 *      keeps them aligned at every scroll offset, since the strips never move.
 */

const t = labels("is");

function points(n: number): HourPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    local: new Date(Date.UTC(2026, 6, 8, i % 24)),
    utcMs: Date.UTC(2026, 6, 8, i % 24),
    tempC: 8 + (i % 7),
    precipMm: i % 5 === 0 ? 1.5 : 0,
    precipMaxMm: i % 5 === 0 ? 2.5 : 0,
    windMs: 4 + (i % 9),
    gustMs: 6 + (i % 9),
    dirDeg: (i * 23) % 360,
    symbol: "02d",
  }));
}

interface TextEl {
  y: number;
  fill: string;
  label: string;
}

/** Every <text> in an SVG string, attribute-order independent */
function texts(svg: string): TextEl[] {
  const out: TextEl[] = [];
  const re = /<text\b([^>]*)>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const attrs = m[1];
    const attr = (name: string): string =>
      new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";
    out.push({ y: Number(attr("y")), fill: attr("fill"), label: m[2] });
  }
  return out;
}

/** y1 values of every horizontal <line> (y1 === y2) */
function gridYs(svg: string): number[] {
  const ys: number[] = [];
  const re = /<line[^>]*\by1="([-\d.]+)"[^>]*\by2="([-\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    if (m[1] === m[2]) ys.push(Number(m[1]));
  }
  return ys;
}

describe.each([
  ["LAYOUT_FULL", LAYOUT_FULL],
  ["LAYOUT_COMPACT", LAYOUT_COMPACT],
])("meteogram axis strips (%s)", (_name, L: MeteogramLayout) => {
  const built = (): ReturnType<typeof buildMeteogram> =>
    buildMeteogram(points(48), t, 0, L);

  it("returns the axes as separate SVGs, so they can be pinned outside the scroller", () => {
    const { svg, axisSvg, rightAxisSvg } = built();
    expect(svg).toContain('class="mg-plot"');
    expect(axisSvg).toContain('class="mg-axis"');
    expect(rightAxisSvg).toContain('class="mg-axis-right"');
    // Decorative: the readout row carries the values for assistive tech.
    expect(axisSvg).toContain('aria-hidden="true"');
    expect(rightAxisSvg).toContain('aria-hidden="true"');
  });

  it("leaves no tick label behind in the scrolling plot", () => {
    const { svg, axisSvg, rightAxisSvg } = built();
    const axisLabels = [...texts(axisSvg), ...texts(rightAxisSvg)];
    expect(axisLabels.length).toBeGreaterThan(3);
    // The plot keeps hour ticks, day headers and the inline temp labels on the
    // curve; a tick label would betray itself by matching a strip label's text
    // AND its y (the strips and the plot share one coordinate system).
    const strays = texts(svg).filter((e) =>
      axisLabels.some((a) => a.label === e.label && a.y === e.y),
    );
    expect(strays).toEqual([]);
  });

  it("aligns EVERY tick label with the gridline it names", () => {
    const { svg, axisSvg, rightAxisSvg } = built();
    const plotGrid = gridYs(svg);
    for (const label of [...texts(axisSvg), ...texts(rightAxisSvg)]) {
      const onGrid = plotGrid.some(
        (g) => Math.abs(g - (label.y - TICK_LABEL_DY)) < 0.01,
      );
      expect(onGrid, `"${label.label}" at y=${label.y} has no gridline`).toBe(
        true,
      );
    }
  });

  it("puts precipitation on the RIGHT strip, in the precip blue", () => {
    const { axisSvg, rightAxisSvg } = built();
    for (const mm of PRECIP_TICKS) {
      const label = formatPrecipTick(mm);
      expect(texts(rightAxisSvg).filter((e) => e.label === label)).toHaveLength(
        1,
      );
      // ...and not in the left strip, where it used to collide with temp ticks.
      expect(texts(axisSvg).filter((e) => e.label === label)).toHaveLength(0);
    }
    expect(texts(rightAxisSvg).every((e) => e.fill === PRECIP_TICK_COLOR)).toBe(
      true,
    );
  });

  it("spans gridlines across the whole plot — there is no left gutter left", () => {
    const { svg, geo } = built();
    expect(svg).toContain('<line x1="0"');
    expect(geo.cx(0)).toBeCloseTo(L.colW / 2);
  });
});

describe("windTicksFor — the shared wind tick rule", () => {
  /** Mirrors WIND_TICK_MIN_GAP in render.ts */
  const MIN_GAP = 20;
  const MAXES = [15, 20, 30, 40, 50];
  /** Real wind lane heights: compact, full, desktop docked, desktop expanded */
  const LANES = [LAYOUT_COMPACT.windSpan, LAYOUT_FULL.windSpan, 68, 130];

  it("thins the ticks on a short lane and fills a tall one", () => {
    expect(windTicksFor(20, LAYOUT_FULL.windSpan)).toEqual([10, 20]);
    expect(windTicksFor(20, 130)).toEqual([5, 10, 15, 20]);
  });

  it("labels the lane ceiling even when it is not a round multiple of the step", () => {
    // Storm-force wind pushes the data-driven domain to 30/50 m/s. Stepping a
    // fixed ladder upwards would label 20 and leave the top of the lane blank.
    expect(windTicksFor(30, LAYOUT_FULL.windSpan)).toEqual([15, 30]);
    expect(windTicksFor(50, LAYOUT_FULL.windSpan)).toEqual([25, 50]);
  });

  it("always ends exactly on the domain maximum", () => {
    for (const max of MAXES) {
      for (const lanePx of LANES) {
        const ticks = windTicksFor(max, lanePx);
        expect(ticks[ticks.length - 1], `max=${max} lane=${lanePx}`).toBe(max);
      }
    }
  });

  it("keeps the steps even, round and never tighter than the minimum gap", () => {
    for (const max of MAXES) {
      for (const lanePx of LANES) {
        const ticks = windTicksFor(max, lanePx);
        const where = `max=${max} lane=${lanePx} → ${ticks.join(",")}`;
        const step = ticks[0];
        expect(ticks, where).toEqual(
          ticks.map((_, i) => (i + 1) * step), // evenly spaced from 0
        );
        expect(step % 5 === 0 || step <= 2, where).toBe(true);
        expect((step / max) * lanePx, where).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
  });
});
