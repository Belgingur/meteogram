import { describe, expect, it, vi } from "vitest";

import { labels } from "../src/i18n";
import { dayChipsHtml, groupDays, panelTableHtml } from "../src/landing";
import { componentStyles } from "../src/styles";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * Two defects in the landscape panel —
 * the layout a phone gets the moment it is turned sideways, because `wide` is
 * `isWide || landscape`.
 *
 *  1. The day chips overflowed their own rounded boxes. `.wide .day-chip` is
 *     sized for the DOCKED panel, which omits the date line, but landscape asks
 *     for the date line — and the chip carried the full month name ("12
 *     September") in a hard 76 px box with `text-align: center`, so the text
 *     spilled past both edges.
 *  2. The "now" rail is drawn as `inset 2px 0 0` on the row's left edge, and the
 *     first column started at x = 0, so the marker sat against the hour digits
 *     it marks.
 */

const HOUR = 3_600_000;

function dayOfHours(startUtcMs: number, count: number): HourPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const utcMs = startUtcMs + i * HOUR;
    return {
      local: new Date(utcMs),
      utcMs,
      tempC: 10,
      precipMm: 0,
      precipMaxMm: 0,
      windMs: 4,
      gustMs: null,
      dirDeg: 180,
      symbol: weatherSymbolCode(0, 0.5, 0, 1),
    };
  });
}

const points = dayOfHours(Date.UTC(2026, 8, 12, 0), 48);

describe("day chips", () => {
  it("carry a short month, and keep the long one for the card header", () => {
    const days = groupDays(points, labels("en"), 0);
    expect(days[0].date).toBe("12 September");
    expect(days[0].dateShort).toBe("12 Sep");

    const html = dayChipsHtml(days, 0, true);
    expect(html).toContain("12 Sep");
    expect(html).not.toContain("12 September");
  });

  it("shorten the date in every locale the widget ships", () => {
    for (const lang of ["is", "en", "fo", "pl", "es", "pt"]) {
      const t = labels(lang);
      const [day] = groupDays(points, t, 0);
      expect(day.dateShort.length).toBeLessThanOrEqual(day.date.length);
      // A short month that is still the whole month name is not a short month.
      expect(day.dateShort).not.toBe("");
    }
  });

  it("let the chip grow past its floor rather than clip its text", () => {
    // 76 px fits "Tomorrow" + an icon + "19°/12°" and nothing else. A fixed
    // width there means any wider content renders OUTSIDE the rounded box.
    const rule = componentStyles
      .split(".wide .day-chip {")[1]
      .split("}")[0];
    expect(rule).toContain("min-width: 76px");
    expect(rule).toContain("width: auto");
    // `min-width: 76px` is the floor and must stay; a bare `width` must not.
    expect(rule).not.toMatch(/(?<![-\w])width: 76px/);
  });
});

describe("the current-hour marker", () => {
  it("is drawn as a rail at the row edge", () => {
    expect(componentStyles).toContain("inset 2px 0 0 var(--aurora)");
  });

  it("keeps a gutter between the rail and the hour it marks", () => {
    // Every row carries the same side padding — the marked one, the plain ones
    // and the header — so the rail has room to read and no column shifts when
    // the marker moves down the table.
    for (const selector of [".hrow {", ".hrow-p {", ".hrow-head {"]) {
      const rule = componentStyles.split(selector)[1].split("}")[0];
      expect(rule).toMatch(/padding: [\d.]+px 8px/);
    }
  });

  it("still marks exactly one row of the table", () => {
    const now = Date.UTC(2026, 8, 12, 9);
    const hours = dayOfHours(Date.UTC(2026, 8, 12, 0), 24);
    const days = groupDays(hours, labels("en"), 0);
    vi.setSystemTime(new Date(now));
    const html = panelTableHtml(days[0], labels("en"));
    expect(html.match(/hrow-now/g)?.length).toBe(1);
    vi.useRealTimers();
  });
});
