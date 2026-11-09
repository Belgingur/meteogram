import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentIndex, nowIndex } from "../src/graph-card";
import { groupDays, panelTableHtml } from "../src/landing";
import { labels } from "../src/i18n";
import { sampleHourPoints } from "../src/sample";

/**
 * Guards on the dev fixture itself.
 *
 * The sample series used to start at the current hour, which made index 0, "now"
 * and the plot's left edge the same column — so a renderer that never scrolled to
 * "now" looked correct locally and shipped. These tests keep the fixture standing
 * in for a real (already-aged) model analysis time so that class of bug stays
 * reproducible without API access.
 */
describe("sampleHourPoints — stands in for an aged model run", () => {
  it("starts before now, so index 0 is NOT the current hour", () => {
    const points = sampleHourPoints(48);
    expect(points[0].utcMs).toBeLessThan(Date.now());
    expect(nowIndex(points)).toBeGreaterThan(0);
  });

  it("still covers the future — the current hour is inside the series", () => {
    const points = sampleHourPoints(48);
    expect(points[points.length - 1].utcMs).toBeGreaterThan(Date.now());
    expect(nowIndex(points)).toBeLessThan(points.length - 1);
  });

  it("keeps the diurnal shape keyed to real clock hours, not to the index", () => {
    // Warmest hour of a full day should land in the afternoon (the specs peak
    // around 16:00 local), which only holds if `h` comes from the timestamp.
    const points = sampleHourPoints(72);
    const day = points.filter((p) => p.local.getUTCDate() === points[36].local.getUTCDate());
    const warmest = day.reduce((a, b) => ((b.tempC ?? -99) > (a.tempC ?? -99) ? b : a));
    expect(warmest.local.getUTCHours()).toBeGreaterThanOrEqual(12);
    expect(warmest.local.getUTCHours()).toBeLessThanOrEqual(20);
  });
});

// The clock is pinned: these used to read the real one and failed only when
// run between 23:30 and midnight UTC, the half hour in which the nearest column
// is already tomorrow's. The sample series is UTC, so these are its local times.
describe.each([
  "2026-07-08T12:00:00Z",
  "2026-07-08T23:20:00Z",
  "2026-07-08T23:40:00Z",
  "2026-07-08T23:59:00Z",
])("hourly table marks the hour containing now, at %s", (nowIso) => {
  const t = labels("en");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(nowIso));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags exactly one row in today's group", () => {
    const points = sampleHourPoints(48);
    const days = groupDays(points, t, currentIndex(points));
    const html = panelTableHtml(days[0], t);
    expect(html.match(/hrow-now/g)).toHaveLength(1);
  });

  it("flags no row on a later day", () => {
    const points = sampleHourPoints(48);
    const days = groupDays(points, t, currentIndex(points));
    expect(panelTableHtml(days[1], t)).not.toContain("hrow-now");
  });

  it("labels today's date 'Today' and tomorrow's 'Tomorrow'", () => {
    const points = sampleHourPoints(48);
    const days = groupDays(points, t, currentIndex(points));
    expect(days[0].name).toBe(t.today);
    expect(days[0].hours[0].local.getUTCDate()).toBe(new Date(nowIso).getUTCDate());
    expect(days[1].name).toBe(t.tomorrow);
    expect(days[1].hours[0].local.getUTCDate()).toBe(new Date(nowIso).getUTCDate() + 1);
  });

  it("marks the row whose clock hour is the current one", () => {
    // The invariant is about absolute time, not position: today's group begins at
    // the analysis hour (or at midnight when the run started the previous day),
    // so the marked row's offset varies — its hour label must not.
    const points = sampleHourPoints(48);
    const days = groupDays(points, t, currentIndex(points));
    const rows = days[0].hours;
    // One snapshot of the clock for the whole assertion: sampling it per row and
    // again for the expectation can straddle an hour boundary and fail on a
    // correct implementation.
    const now = Date.now();
    const marked = rows.findIndex(
      (p) => now >= p.utcMs && now < p.utcMs + 3_600_000,
    );
    expect(marked).toBeGreaterThanOrEqual(0);
    expect(rows[marked].local.getUTCHours()).toBe(new Date(now).getUTCHours());
  });
});
