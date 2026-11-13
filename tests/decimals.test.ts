import { describe, expect, it } from "vitest";

import { scrubValueText } from "../src/graph-card";
import { formatDecimal, labels, LANGS } from "../src/i18n";
import { coordLabel, distanceLabel, stationPlaceNoteHtml } from "../src/landing";
import { formatPrecipTick } from "../src/render";
import type { HourPoint } from "../src/types";

const COMMA = ["is", "fo", "pl", "es", "pt"] as const;

describe("formatDecimal", () => {
  it("writes a comma in every language but English", () => {
    for (const lang of COMMA) expect(formatDecimal(0.4, 1, labels(lang)), lang).toBe("0,4");
    expect(formatDecimal(0.4, 1, labels("en"))).toBe("0.4");
  });

  it("covers every language the widget offers", () => {
    expect(LANGS.map((l) => l.code).sort()).toEqual([...COMMA, "en"].sort());
  });

  it("keeps the precision it is asked for, with no thousands separator", () => {
    expect(formatDecimal(64.1466, 2, labels("is"))).toBe("64,15");
    expect(formatDecimal(1234.5, 1, labels("is"))).toBe("1234,5");
    expect(formatDecimal(3, 1, labels("pl"))).toBe("3,0");
  });
});

describe("decimals in the widget's text", () => {
  it("distances below 10 km get the separator; whole kilometres stay whole", () => {
    expect(distanceLabel(2.1, labels("is"))).toBe("2,1 km");
    expect(distanceLabel(2.1, labels("en"))).toBe("2.1 km");
    expect(distanceLabel(340.4, labels("is"))).toBe("340 km");
  });

  it("coordinates use the separator and the language's compass letter", () => {
    expect(coordLabel(64.15, -21.94, labels("is"))).toBe("64,15°N 21,94°V");
    expect(coordLabel(64.15, -21.94, labels("en"))).toBe("64.15°N 21.94°W");
  });

  it("the station line uses the separator in each language", () => {
    for (const lang of COMMA) {
      expect(stationPlaceNoteHtml("Höfn", 2.1, labels(lang)), lang).toContain("2,1 km");
    }
    expect(stationPlaceNoteHtml("Höfn", 2.1, labels("en"))).toContain("2.1 km");
  });

  it("rain axis ticks use the separator; whole ticks are unchanged", () => {
    expect(formatPrecipTick(2.5, labels("is"))).toBe("2,5");
    expect(formatPrecipTick(2.5, labels("en"))).toBe("2.5");
    expect(formatPrecipTick(2, labels("pt"))).toBe("2");
  });

  it("the slider's spoken value writes rain the same way", () => {
    const p = {
      time: new Date("2026-07-08T12:00:00Z"),
      local: new Date("2026-07-08T12:00:00Z"),
      tempC: 11,
      precipMm: 0.4,
      windMs: 5,
      gustMs: 9,
      dirDeg: 225,
      symbol: "",
    } as unknown as HourPoint;
    expect(scrubValueText(p, labels("is"))).toContain("0,4 mm");
    expect(scrubValueText(p, labels("en"))).toContain("0.4 mm");
  });
});
