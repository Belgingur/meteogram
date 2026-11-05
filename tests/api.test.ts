import { describe, expect, it } from "vitest";

import {
  hasStationEndpoint,
  refStationAt,
  runTimes,
  stationDataUrl,
} from "../src/api";
import type {
  ForecastMetadata,
  MeteogramData,
  StationMetadata,
} from "../src/types";

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

describe("stationDataUrl for a station", () => {
  const schedule = {
    forecast_id: "schedule/island-8/2",
    station_data_url:
      "https://wod.example/api/v2/data/point/schedule/island-8/2/[station]/meteogram.xml",
  } as ForecastMetadata;

  it("asks the station endpoint, which serves corrected data", () => {
    expect(stationDataUrl(schedule, 64, -22, undefined, "vi.1475")).toBe(
      "https://wod.example/api/v2/data/point/schedule/island-8/2/station/vi.1475/meteogram.json",
    );
  });

  it("keeps the duration on a station request", () => {
    expect(stationDataUrl(schedule, 64, -22, 48, "vi.1475")).toMatch(
      /\/station\/vi\.1475\/meteogram\.json\?duration=48h$/,
    );
  });

  it("asks for the point on an upstream model, which has no station endpoint", () => {
    const upstream = { ...meta(72), forecast_id: "upstream/ecmwf-0p25" };
    expect(stationDataUrl(upstream, 64, -22, undefined, "vi.1475")).toContain(
      "/latlon/64,-22/meteogram.json",
    );
  });
});

describe("hasStationEndpoint", () => {
  it("is true for schedules and false for upstream models", () => {
    const at = (forecast_id: string) => ({ forecast_id }) as ForecastMetadata;
    expect(hasStationEndpoint(at("schedule/island-8/2"))).toBe(true);
    expect(hasStationEndpoint(at("upstream/ecmwf-0p25"))).toBe(false);
  });
});

describe("refStationAt", () => {
  const station = (
    name: string,
    lat: number,
    lon: number,
    ref?: string,
  ): StationMetadata => ({
    id: ref ?? `latlon/${lat},${lon}`,
    name,
    lat,
    lon,
    extra: ref ? { ref } : {},
  });
  const akureyri = station("Akureyri", 65.6856, -18.1002, "vi.3471");
  const plain = station("Akureyri town", 65.6835, -18.0878);

  it("takes a point a few hundred metres off as the station", () => {
    // Where a host's own label for the town puts it, not WOD's coordinates
    expect(refStationAt([plain, akureyri], 65.6835, -18.0878)).toBe(akureyri);
  });

  it("ignores stations the config does not list by ref", () => {
    expect(refStationAt([plain], 65.6835, -18.0878)).toBeNull();
  });

  it("does not claim a point more than a kilometre away", () => {
    expect(refStationAt([akureyri], 65.70, -18.1002)).toBeNull();
  });

  it("picks the nearer of two stations in range", () => {
    const near = station("Near", 64.0, -22.0, "a");
    const far = station("Far", 64.006, -22.0, "b");
    expect(refStationAt([far, near], 64.001, -22.0)).toBe(near);
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
