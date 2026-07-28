import { describe, expect, it } from "vitest";
import { toHourPoints } from "../src/transform";
import type { MeteogramData } from "../src/types";

// Build a MeteogramData with hourly (or custom-spaced) timestamps. `hours` is
// the number of steps; `stepH` the spacing between them.
function makeApi(
  data: Record<string, (number | null)[]>,
  opts: { steps?: number; stepH?: number; offsetMin?: number } = {},
): MeteogramData {
  const { steps = 3, stepH = 1, offsetMin } = opts;
  const start = Date.UTC(2026, 0, 1, 0, 0, 0); // 2026-01-01T00:00:00Z
  const time = Array.from({ length: steps }, (_, i) =>
    new Date(start + i * stepH * 3_600_000).toISOString(),
  );
  const meta: { [k: string]: number } = {};
  if (offsetMin !== undefined) meta.location_timezone_offset = offsetMin;
  return { time, data, meta };
}

describe("toHourPoints — degenerate input", () => {
  it("returns [] when there are no timestamps", () => {
    expect(toHourPoints({ time: [], data: {}, meta: {} }, 48)).toEqual([]);
  });

  it("returns [] when there is only one timestamp (timestep is undefined)", () => {
    const api: MeteogramData = {
      time: ["2026-01-01T00:00:00Z"],
      data: {},
      meta: {},
    };
    expect(toHourPoints(api, 48)).toEqual([]);
  });
});

describe("toHourPoints — timezone offset shifts the local timestamp", () => {
  it("shifts local by location_timezone_offset minutes while keeping true UTC", () => {
    const api = makeApi({ air_temperature_at_2m_agl: [1, 2, 3] }, {
      offsetMin: -120,
    });
    const p = toHourPoints(api, 48);
    expect(p[0].utcMs).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
    // local is the UTC instant plus the offset, read back as ms
    expect(p[0].local.getTime()).toBe(p[0].utcMs - 120 * 60_000);
  });

  it("defaults the offset to 0 when meta omits it", () => {
    const api = makeApi({ air_temperature_at_2m_agl: [1, 2, 3] });
    const p = toHourPoints(api, 48);
    expect(p[0].local.getTime()).toBe(p[0].utcMs);
  });
});

describe("toHourPoints — precipitation rate is scaled to mm per timestep", () => {
  it("multiplies the rate by the timestep in hours (1h step)", () => {
    const api = makeApi({ lwe_precipitation_rate: [2, 0, 0.5] }, { stepH: 1 });
    const p = toHourPoints(api, 48);
    expect(p[0].precipMm).toBe(2);
    expect(p[2].precipMm).toBe(0.5);
  });

  it("multiplies the rate by the timestep in hours (3h step)", () => {
    const api = makeApi({ lwe_precipitation_rate: [2, 0, 0] }, { stepH: 3 });
    const p = toHourPoints(api, 48);
    expect(p[0].precipMm).toBe(6); // 2 mm/h over a 3h step
  });

  it("falls back to the mean rate for precipMaxMm when no max series is present", () => {
    const api = makeApi({ lwe_precipitation_rate: [2, 0, 0] }, { stepH: 3 });
    const p = toHourPoints(api, 48);
    expect(p[0].precipMaxMm).toBe(6); // same as precipMm
  });

  it("uses the dedicated max series for precipMaxMm when present", () => {
    const api = makeApi(
      {
        lwe_precipitation_rate: [2, 0, 0],
        lwe_precipitation_rate_max: [10, 0, 0],
      },
      { stepH: 3 },
    );
    const p = toHourPoints(api, 48);
    expect(p[0].precipMm).toBe(6);
    expect(p[0].precipMaxMm).toBe(30);
  });

  it("reports 0 mm when the precipitation series is missing entirely", () => {
    const api = makeApi({ air_temperature_at_2m_agl: [1, 2, 3] });
    const p = toHourPoints(api, 48);
    expect(p[0].precipMm).toBe(0);
    expect(p[0].precipMaxMm).toBe(0);
  });
});

describe("toHourPoints — wind gust is optional", () => {
  it("emits null gust for every hour when the gust series is absent", () => {
    const api = makeApi({ wind_speed_at_10m_agl: [5, 6, 7] });
    const p = toHourPoints(api, 48);
    expect(p.map((x) => x.gustMs)).toEqual([null, null, null]);
  });

  it("passes gust values through (including interior nulls) when present", () => {
    const api = makeApi({
      wind_speed_at_10m_agl: [5, 6, 7],
      wind_speed_of_gust_at_10m_agl: [9, null, 11],
    });
    const p = toHourPoints(api, 48);
    expect(p.map((x) => x.gustMs)).toEqual([9, null, 11]);
  });
});

describe("toHourPoints — maxHours clamps the number of points", () => {
  it("caps to ceil(maxHours / timestep) at a 1h step", () => {
    const api = makeApi(
      { air_temperature_at_2m_agl: Array(10).fill(0) },
      { steps: 10, stepH: 1 },
    );
    expect(toHourPoints(api, 3)).toHaveLength(3);
  });

  it("accounts for the timestep width at a 3h step", () => {
    const api = makeApi(
      { air_temperature_at_2m_agl: Array(10).fill(0) },
      { steps: 10, stepH: 3 },
    );
    // ceil(3 / 3) === 1
    expect(toHourPoints(api, 3)).toHaveLength(1);
  });

  it("never returns more points than there are timestamps", () => {
    const api = makeApi(
      { air_temperature_at_2m_agl: [1, 2, 3] },
      { steps: 3, stepH: 1 },
    );
    expect(toHourPoints(api, 999)).toHaveLength(3);
  });
});

describe("toHourPoints — pass-through and symbol integration", () => {
  it("carries temperature, wind and direction through, preserving nulls", () => {
    const api = makeApi({
      air_temperature_at_2m_agl: [-1.5, null, 3],
      wind_speed_at_10m_agl: [4, 5, null],
      wind_from_direction_at_10m_agl: [90, null, 270],
    });
    const p = toHourPoints(api, 48);
    expect(p.map((x) => x.tempC)).toEqual([-1.5, null, 3]);
    expect(p.map((x) => x.windMs)).toEqual([4, 5, null]);
    expect(p.map((x) => x.dirDeg)).toEqual([90, null, 270]);
  });

  it("computes the yr.no symbol from the hour's cloud/snow/daylight/precip", () => {
    const api = makeApi({
      lwe_precipitation_rate: [0, 0, 0],
      cloud_area_fraction: [0.1, 0.1, 0.1],
      snow_fraction: [0, 0, 0],
      daylight_fraction: [1, 1, 1],
    });
    const p = toHourPoints(api, 48);
    expect(p[0].symbol).toBe("01d"); // clear, dry, day
  });

  it("leaves the symbol empty when the inputs are not computable", () => {
    const api = makeApi({ air_temperature_at_2m_agl: [1, 2, 3] });
    const p = toHourPoints(api, 48);
    expect(p[0].symbol).toBe("");
  });
});
