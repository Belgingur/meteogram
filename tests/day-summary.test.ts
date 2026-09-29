import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { groupDays, panelTableHtml, selDayCardHtml } from "../src/landing";
import type { HourPoint } from "../src/types";

const HOUR = 3_600_000;

/** One local day, hourly: 2–12 °C, 0.5 mm every third hour, 4 m/s. */
function day(): HourPoint[] {
  const start = Date.UTC(2026, 8, 12, 0);
  return Array.from({ length: 24 }, (_, i) => ({
    local: new Date(start + i * HOUR),
    utcMs: start + i * HOUR,
    tempC: 2 + (i % 11),
    precipMm: i % 3 === 0 ? 0.5 : 0,
    precipMaxMm: 0,
    windMs: 4,
    gustMs: null,
    dirDeg: 180,
    symbol: "",
  }));
}

describe("day summary", () => {
  const t = labels("en");
  const [d] = groupDays(day(), t, 0);

  it("totals the day's precipitation", () => {
    expect(d.precipMm).toBeCloseTo(4, 5);
  });

  it("names every figure it shows, one per table column", () => {
    const html = selDayCardHtml(d, t);
    for (const label of [t.tempCol, t.precip, t.wind]) {
      expect(html).toContain(`<span class="sel-stat-label">${label}</span>`);
    }
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("12° / 2°");
    expect(text).toContain("4.0 mm");
    expect(text).toContain("4 m/s");
  });

  it("appears on the desktop table too, not only on the phone", () => {
    expect(panelTableHtml(d, t)).toContain('class="sel-stats"');
  });

  it("shows a dash rather than 0.0 mm on a dry day", () => {
    const [dry] = groupDays(
      day().map((p) => ({ ...p, precipMm: 0 })),
      t,
      0,
    );
    expect(selDayCardHtml(dry, t)).toContain(
      '<span class="sel-stat-precip">–</span>',
    );
  });
});
