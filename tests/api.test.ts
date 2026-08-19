import { describe, expect, it } from "vitest";

import { stationDataUrl } from "../src/api";
import type { ForecastMetadata } from "../src/types";

const meta = (duration_h: number): ForecastMetadata =>
  ({
    duration_h,
    station_data_url:
      "https://wod.example/api/v2/data/point/upstream/ecmwf-0p25/[station]/meteogram.xml",
  }) as ForecastMetadata;

describe("stationDataUrl", () => {
  it("substitutes the point and switches the format to json", () => {
    const url = stationDataUrl(meta(72), 64.1465, -21.9426, 48);
    expect(url).toContain("/latlon/64.1465,-21.9426/meteogram.json");
    expect(url).not.toContain("meteogram.xml");
    expect(url).not.toContain("[station]");
  });

  it("asks for the requested window when hours is given", () => {
    expect(stationDataUrl(meta(240), 64, -22, 48)).toContain("?duration=48h");
  });

  it("omits duration entirely when no window is asked for", () => {
    // No `duration` means the API returns the whole run — the only cap that
    // should apply is how far the forecast actually goes.
    expect(stationDataUrl(meta(72), 64, -22)).toMatch(/meteogram\.json$/);
    expect(stationDataUrl(meta(72), 64, -22, Infinity)).toMatch(
      /meteogram\.json$/,
    );
  });

  it("does not clamp the window to the config's duration_h", () => {
    // duration_h undercounts what the model serves (ECMWF-0p25 declares 72 h
    // and returns 90), so clamping by it dropped real forecast hours.
    expect(stationDataUrl(meta(72), 64, -22, 168)).toContain("?duration=168h");
  });
});
