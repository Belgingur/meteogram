import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { distanceKm, distanceLabel, stationRowsHtml, type Place } from "../src/landing";

describe("distanceKm", () => {
  it("measures a known distance (Reykjavík to Akureyri, ~250 km)", () => {
    const km = distanceKm(64.1466, -21.9426, 65.6885, -18.1262);
    expect(km).toBeGreaterThan(240);
    expect(km).toBeLessThan(260);
  });

  it("weights longitude by latitude everywhere, not just near Iceland", () => {
    // One degree of longitude on the equator is ~111 km; the old fixed 0.2
    // weight made it count for less than half a degree of latitude.
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
    expect(distanceKm(0, 0, 1, 0)).toBeCloseTo(111.2, 0);
  });

  it("takes the short way round the antimeridian", () => {
    expect(distanceKm(0, 179.5, 0, -179.5)).toBeCloseTo(111.2, 0);
  });
});

describe("distanceLabel", () => {
  it("keeps a decimal below 10 km and rounds above", () => {
    expect(distanceLabel(3.46)).toBe("3.5 km");
    expect(distanceLabel(12.4)).toBe("12 km");
    expect(distanceLabel(340.6)).toBe("341 km");
  });

  it("says nothing for a distance it cannot state", () => {
    expect(distanceLabel(Number.NaN)).toBe("");
  });
});

describe("stationRowsHtml", () => {
  const t = labels("en");

  it("shows the distance each row is ordered by", () => {
    const p: Place = { name: "Vík", lat: 63.42, lon: -19.0, distanceKm: 12.4 };
    expect(stationRowsHtml([p], null, "", t)).toContain("12 km");
  });
});
