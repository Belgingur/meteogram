import { describe, expect, it } from "vitest";

import { runTimes, stationDataUrl } from "../src/api";
import type { ForecastMetadata, MeteogramData } from "../src/types";

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

describe("runTimes", () => {
  const body = (meta: MeteogramData["meta"]): MeteogramData => ({
    time: ["2026-10-06T07:00:00+00:00", "2026-10-06T08:00:00+00:00"],
    data: {},
    meta,
  });
  const header = new Date("2026-10-06T11:40:00Z");
  const firstStep = Date.parse("2026-10-06T07:00:00Z");

  it("reads the run and update time from the response's meta", () => {
    const t = runTimes(
      body({
        analysis: "2026-10-06T06:00:00+00:00",
        last_modified: "2026-10-06T11:32:04+00:00",
        location_timezone_offset: 0,
      }),
      header,
      firstStep,
    );
    expect(t.analysisTime?.toISOString()).toBe("2026-10-06T06:00:00.000Z");
    expect(t.lastModified.toISOString()).toBe("2026-10-06T11:32:04.000Z");
  });

  it("falls back to the header and first step when meta lacks them", () => {
    // Older WOD servers send only the timezone offset in meta.
    const t = runTimes(
      body({ location_timezone_offset: 0 }),
      header,
      firstStep,
    );
    expect(t.analysisTime?.getTime()).toBe(firstStep);
    expect(t.lastModified).toEqual(header);
  });

  it("ignores unparseable timestamps", () => {
    const t = runTimes(
      body({ analysis: "soon", last_modified: "" }),
      header,
      firstStep,
    );
    expect(t.analysisTime?.getTime()).toBe(firstStep);
    expect(t.lastModified).toEqual(header);
  });

  it("uses the update time as the run time when there is nothing else", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    const t = runTimes(body({}), null, undefined, now);
    expect(t.lastModified).toEqual(now);
    expect(t.analysisTime).toEqual(now);
  });
});
