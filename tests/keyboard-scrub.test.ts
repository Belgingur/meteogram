import { describe, expect, it } from "vitest";

import { scrubKeyIndex, scrubValueText } from "../src/graph-card";
import { labels } from "../src/i18n";
import { weatherSymbolCode } from "../src/symbol-code";
import type { HourPoint } from "../src/types";

/**
 * The charts are keyboard sliders: the same keys, the same clamping and the
 * same announcement on the phone card, the desktop panel and the landscape
 * rail, which all delegate to these two helpers.
 */
describe("scrubKeyIndex", () => {
  it("steps one column on the arrow keys", () => {
    expect(scrubKeyIndex("ArrowRight", 5, 48)).toBe(6);
    expect(scrubKeyIndex("ArrowUp", 5, 48)).toBe(6);
    expect(scrubKeyIndex("ArrowLeft", 5, 48)).toBe(4);
    expect(scrubKeyIndex("ArrowDown", 5, 48)).toBe(4);
  });

  it("jumps a day on the Page keys and to the ends on Home/End", () => {
    expect(scrubKeyIndex("PageUp", 5, 48)).toBe(29);
    expect(scrubKeyIndex("PageDown", 30, 48)).toBe(6);
    expect(scrubKeyIndex("Home", 30, 48)).toBe(0);
    expect(scrubKeyIndex("End", 3, 48)).toBe(47);
  });

  it("clamps at both ends", () => {
    expect(scrubKeyIndex("ArrowLeft", 0, 48)).toBe(0);
    expect(scrubKeyIndex("PageUp", 40, 48)).toBe(47);
    expect(scrubKeyIndex("PageDown", 3, 48)).toBe(0);
  });

  it("ignores every other key", () => {
    expect(scrubKeyIndex("Enter", 5, 48)).toBeNull();
    expect(scrubKeyIndex("a", 5, 48)).toBeNull();
  });
});

describe("scrubValueText", () => {
  const p: HourPoint = {
    local: new Date(Date.UTC(2026, 6, 8, 12)),
    utcMs: Date.UTC(2026, 6, 8, 12),
    tempC: 10.6,
    precipMm: 0.44,
    precipMaxMm: 1,
    windMs: 5.2,
    gustMs: 9.4,
    dirDeg: 225,
    symbol: weatherSymbolCode(0, 0.5, 0, 1),
  };

  it("reads the readout out in words", () => {
    expect(scrubValueText(p, labels("en"))).toBe(
      "Wed 8 July · 12:00, 11°, 0.4 mm, 5 (9) m/s SW",
    );
  });

  it("says a missing reading is missing", () => {
    const t = scrubValueText({ ...p, tempC: null, windMs: null }, labels("en"));
    expect(t).toBe("Wed 8 July · 12:00, –, 0.4 mm, –");
  });
});
