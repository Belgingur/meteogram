import { describe, expect, it } from "vitest";
import { weatherSymbolCode } from "../src/symbol-code";

// weatherSymbolCode(precipRate, cloudFraction, snowFraction, daylightFraction, timestepH)
// maps forecast variables to a yr.no-style symbol code ("01d" … "50").

describe("weatherSymbolCode — missing inputs return an empty code", () => {
  it("returns '' when cloud fraction is null", () => {
    expect(weatherSymbolCode(0, null, 0, 1)).toBe("");
  });

  it("returns '' when daylight fraction is null", () => {
    expect(weatherSymbolCode(0, 0.1, 0, null)).toBe("");
  });

  it("returns '' when the precipitation rate is null", () => {
    expect(weatherSymbolCode(null, 0.1, 0, 1)).toBe("");
  });

  it("treats a precipitation rate of exactly 0 as valid (not missing)", () => {
    // rate 0 + near-clear sky + full daylight => clear, dry, day => "01d"
    expect(weatherSymbolCode(0, 0.1, 0, 1)).toBe("01d");
  });
});

describe("weatherSymbolCode — cloud cover selects the base symbol", () => {
  it("clear sky (<0.25) with no rain => 01", () => {
    expect(weatherSymbolCode(0, 0.1, 0, 1)).toBe("01d");
  });

  it("fair sky (0.25–0.5) with no rain => 02", () => {
    expect(weatherSymbolCode(0, 0.3, 0, 1)).toBe("02d");
  });

  it("cloud fraction 0.5–0.75 with no rain still maps to scattered => 03", () => {
    expect(weatherSymbolCode(0, 0.6, 0, 1)).toBe("03d");
  });

  it("overcast (>=0.75) with no rain => 04 and never carries a day/night suffix", () => {
    expect(weatherSymbolCode(0, 0.9, 0, 1)).toBe("04");
    expect(weatherSymbolCode(0, 0.9, 0, 0.1)).toBe("04");
  });
});

describe("weatherSymbolCode — day vs night suffix (non-overcast only)", () => {
  it("daylight >= 0.75 yields the day suffix 'd'", () => {
    expect(weatherSymbolCode(0, 0.1, 0, 0.75)).toBe("01d");
  });

  it("daylight < 0.75 yields the night suffix 'n'", () => {
    expect(weatherSymbolCode(0, 0.1, 0, 0.74)).toBe("01n");
  });
});

describe("weatherSymbolCode — precipitation intensity buckets (timestep = 1h)", () => {
  const cloud = 0.9; // overcast, so we read the intensity directly in the code
  const snow = 0; // rain
  const day = 1;

  it("< 0.1 mm/h counts as no precipitation => overcast dry (04)", () => {
    expect(weatherSymbolCode(0.09, cloud, snow, day, 1)).toBe("04");
  });

  it("0.1–0.3 mm/h is 'little' rain => overcast_little_rain (46)", () => {
    expect(weatherSymbolCode(0.1, cloud, snow, day, 1)).toBe("46");
  });

  it("0.3–3 mm/h is 'some' rain => overcast_some_rain (09)", () => {
    expect(weatherSymbolCode(0.3, cloud, snow, day, 1)).toBe("09");
  });

  it(">= 3 mm/h is 'much' rain => overcast_much_rain (10)", () => {
    expect(weatherSymbolCode(3, cloud, snow, day, 1)).toBe("10");
  });
});

describe("weatherSymbolCode — precipitation type from snow fraction", () => {
  const cloud = 0.9; // overcast
  const rate = 1; // 'some'
  const day = 1;

  it("snow fraction < 0.33 => rain (09)", () => {
    expect(weatherSymbolCode(rate, cloud, 0.32, day)).toBe("09");
  });

  it("snow fraction 0.33–0.66 => sleet (12)", () => {
    expect(weatherSymbolCode(rate, cloud, 0.33, day)).toBe("12");
  });

  it("snow fraction >= 0.66 => snow (13)", () => {
    expect(weatherSymbolCode(rate, cloud, 0.66, day)).toBe("13");
  });

  it("a null snow fraction falls back to rain (09)", () => {
    expect(weatherSymbolCode(rate, cloud, null, day)).toBe("09");
  });
});

describe("weatherSymbolCode — precipitation thresholds scale with the timestep", () => {
  // The same rate crosses a different bucket boundary at a 3h timestep,
  // because the thresholds are multiplied by timestep_h.
  it("0.2 mm/h is 'little' at a 1h step (=> 40d) but 'no' at a 3h step (=> 01d)", () => {
    expect(weatherSymbolCode(0.2, 0.1, 0, 1, 1)).toBe("40d");
    expect(weatherSymbolCode(0.2, 0.1, 0, 1, 3)).toBe("01d");
  });
});
