import { describe, expect, it } from "vitest";

import {
  draggablePanelHeaderHtml,
  formatUtcOffset,
  panelSummary,
} from "../src/landing";
import { labels } from "../src/i18n";

/**
 * The chart renders in the forecast point's zone; the map timeline around it
 * renders in the browser's. This label is the only thing telling a reader which
 * clock they are looking at, so its sign convention is load-bearing.
 */
describe("formatUtcOffset", () => {
  it("renders zero as a bare UTC", () => {
    expect(formatUtcOffset(0)).toBe("UTC");
  });

  it("does not mistake a legitimate zero for a missing field", () => {
    // Every Icelandic domain sends 0. A falsiness check would drop the label
    // exactly where it is most often correct.
    expect(formatUtcOffset(0)).not.toBeNull();
  });

  it("renders whole hours without a minutes component", () => {
    expect(formatUtcOffset(-180)).toBe("UTC-3");
    expect(formatUtcOffset(120)).toBe("UTC+2");
  });

  it("renders non-whole offsets as H:MM", () => {
    expect(formatUtcOffset(345)).toBe("UTC+5:45");
    // The sign belongs to the hours; the minutes part stays positive.
    expect(formatUtcOffset(-210)).toBe("UTC-3:30");
  });

  it("returns null for a missing or non-finite offset", () => {
    expect(formatUtcOffset(null)).toBeNull();
    expect(formatUtcOffset(undefined)).toBeNull();
    expect(formatUtcOffset(NaN)).toBeNull();
    expect(formatUtcOffset(Infinity)).toBeNull();
  });

  it("follows the API's sign convention, not getTimezoneOffset()'s", () => {
    // The Brazil fixture. The API says local = UTC + offset, so -180 is UTC−3;
    // Date.prototype.getTimezoneOffset() reports +180 for the same zone. Routing
    // this value through that method would print UTC+3 for São Paulo.
    expect(formatUtcOffset(-180)).toBe("UTC-3");
    expect(formatUtcOffset(-180)).not.toBe("UTC+3");
  });
});

describe("panelSummary", () => {
  const base = {
    modelName: "BEL-BR",
    place: "17.68°S 43.89°W",
    lang: "EN",
  };

  it("appends the zone as the last segment", () => {
    expect(panelSummary({ ...base, tzOffsetMin: -180 })).toBe(
      "BEL-BR · 17.68°S 43.89°W · EN · UTC-3",
    );
  });

  it("shows UTC for an Iceland point", () => {
    expect(
      panelSummary({ modelName: "BEL-IS", place: "Reykjavík", lang: "IS", tzOffsetMin: 0 }),
    ).toBe("BEL-IS · Reykjavík · IS · UTC");
  });

  it("omits the segment AND its separator when the offset is unknown", () => {
    for (const tzOffsetMin of [null, undefined]) {
      const summary = panelSummary({ ...base, tzOffsetMin });
      expect(summary).toBe("BEL-BR · 17.68°S 43.89°W · EN");
      expect(summary.endsWith("·")).toBe(false);
      expect(summary.split(" · ")).toHaveLength(3);
    }
  });

  it("reaches the header pill", () => {
    const summary = panelSummary({ ...base, tzOffsetMin: -180 });
    expect(draggablePanelHeaderHtml(summary, true, labels("en"))).toContain(
      "UTC-3",
    );
  });
});
