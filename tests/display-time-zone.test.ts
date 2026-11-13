import { describe, expect, it, vi } from "vitest";

import { scrubTimeLabel } from "../src/graph-card";
import { labels } from "../src/i18n";
import { formatUtcOffset, groupDays } from "../src/landing";
import {
  inDisplayZone,
  isKnownTimeZone,
  shownOffsetMin,
  toHourPoints,
  zoneOffsetMin,
} from "../src/transform";
import type { HourPoint, MeteogramData } from "../src/types";

const t = labels("en");
const H = 3_600_000;

/** Hourly points from `startIso`, on a point whose own offset is `offsetMin`. */
function points(startIso: string, steps: number, offsetMin = 0): HourPoint[] {
  const start = Date.parse(startIso);
  const api: MeteogramData = {
    time: Array.from({ length: steps }, (_, i) => new Date(start + i * H).toISOString()),
    data: { air_temperature_at_2m_agl: Array.from({ length: steps }, () => 5) },
    meta: { location_timezone_offset: offsetMin },
  };
  return toHourPoints(api, steps);
}

const hours = (ps: HourPoint[]) => ps.map((p) => p.local.getUTCHours());

describe("zoneOffsetMin", () => {
  it("gives each zone's offset at an instant, with the API's sign", () => {
    const summer = Date.parse("2026-07-08T12:00:00Z");
    expect(zoneOffsetMin("Atlantic/Reykjavik", summer)).toBe(0);
    expect(zoneOffsetMin("Europe/Oslo", summer)).toBe(120);
    expect(zoneOffsetMin("America/Sao_Paulo", summer)).toBe(-180);
    expect(zoneOffsetMin("Asia/Kathmandu", summer)).toBe(345);
    expect(zoneOffsetMin("Europe/Oslo", Date.parse("2026-01-08T12:00:00Z"))).toBe(60);
  });
});

describe("points on the display clock", () => {
  it("shows the hours in the display zone", () => {
    const ps = inDisplayZone(points("2026-07-08T10:00:00Z", 3), "Europe/Oslo");
    expect(hours(ps)).toEqual([12, 13, 14]);
    // The instants are the same; only the clock changes.
    expect(ps.map((p) => p.utcMs)).toEqual(points("2026-07-08T10:00:00Z", 3).map((p) => p.utcMs));
  });

  it("follows a daylight-saving change inside the forecast, hour by hour", () => {
    // Oslo leaves summer time at 01:00 UTC on 25 Oct 2026: 03:00 CEST → 02:00 CET.
    const ps = inDisplayZone(points("2026-10-24T23:00:00Z", 4), "Europe/Oslo");
    expect(hours(ps)).toEqual([1, 2, 2, 3]);
  });

  it("puts the day boundary at the display zone's midnight", () => {
    // 22:00 UTC on 8 July is midnight in Oslo, the start of 9 July.
    const base = points("2026-07-08T12:00:00Z", 24);
    const days = groupDays(inDisplayZone(base, "Europe/Oslo"), t, 0);
    expect(days[0].hours).toHaveLength(10); // 14:00–23:00 on the 8th
    expect(days[1].hours[0].utcMs).toBe(Date.parse("2026-07-08T22:00:00Z"));
    // On the point's own clock (UTC) the 8th runs to 23:00 UTC.
    expect(groupDays(base, t, 0)[0].hours).toHaveLength(12);
  });

  it("names the selected hour on the display clock", () => {
    const ps = inDisplayZone(points("2026-07-08T12:00:00Z", 3), "America/Sao_Paulo");
    const selected = ps.find((p) => p.utcMs === Date.parse("2026-07-08T13:00:00Z"))!;
    expect(scrubTimeLabel(selected, t)).toBe("Wed 8 July · 10:00");
  });

  it("without the attribute, the points are unchanged", () => {
    const base = points("2026-07-08T12:00:00Z", 3, -180);
    expect(inDisplayZone(base, null)).toBe(base);
  });

  it("an unknown zone name leaves the points unchanged and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const base = points("2026-07-08T12:00:00Z", 3, -180);
    expect(inDisplayZone(base, "Not/AZone")).toBe(base);
    expect(inDisplayZone(base, "Not/AZone")).toBe(base);
    expect(isKnownTimeZone("Not/AZone")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("the header's zone", () => {
  const summer = Date.parse("2026-07-08T12:00:00Z");
  const label = (point: number | null, zone: string | null) =>
    formatUtcOffset(shownOffsetMin(point, zone, summer));

  it("names the display zone only when its offset differs from the point's", () => {
    expect(label(0, "Atlantic/Reykjavik")).toBe("UTC");
    expect(label(0, "Europe/Oslo")).toBe("UTC+2");
    expect(label(-180, "America/Sao_Paulo")).toBe("UTC-3");
    expect(label(-180, "Atlantic/Reykjavik")).toBe("UTC");
  });

  it("is the point's own without the attribute, or with an unknown zone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(label(-180, null)).toBe("UTC-3");
    expect(label(-180, "Not/AZone")).toBe("UTC-3");
    warn.mockRestore();
  });
});
