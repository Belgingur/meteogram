import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { stationRowsHtml, type Place } from "../src/landing";

describe("stationRowsHtml", () => {
  const t = labels("en");

  it("marks only the selected station when two share a name", () => {
    const a: Place = { name: "Höfn", lat: 64.25, lon: -15.21 };
    const b: Place = { name: "Höfn", lat: 66.08, lon: -23.95 };
    const html = stationRowsHtml([a, b], b, "", t);
    const rows = html.split('<button class="station').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith(" sel")).toBe(false);
    expect(rows[1].startsWith(" sel")).toBe(true);
  });
});
