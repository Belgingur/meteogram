import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONFIG_TTL_MS,
  clearConfigCache,
  loadConfig,
  loadForecastMetadata,
} from "../src/api";

const CONFIG = "https://wod.example/api/v2/widget/meteo/config/site";
const FORECAST = `${CONFIG}/forecast/upstream/a`;

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("config and forecast metadata cache", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearConfigCache();
    vi.useFakeTimers();
    fetchMock = vi.fn((url: string) =>
      url === CONFIG
        ? ok({ forecasts: [{ id: "upstream/a", name: "A", url: FORECAST }] })
        : ok({ forecast_id: "upstream/a", stations: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the config and metadata once for many points", async () => {
    for (let i = 0; i < 3; i++) {
      await loadConfig({ clientName: "site", apiUrl: CONFIG });
      await loadForecastMetadata(FORECAST);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one request between loads that overlap", async () => {
    await Promise.all([loadForecastMetadata(FORECAST), loadForecastMetadata(FORECAST)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again once the cached response is an hour old", async () => {
    await loadForecastMetadata(FORECAST);
    vi.advanceTimersByTime(CONFIG_TTL_MS - 1);
    await loadForecastMetadata(FORECAST);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await loadForecastMetadata(FORECAST);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed request, so a retry asks again", async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("", { status: 502 })));
    await expect(loadForecastMetadata(FORECAST)).rejects.toThrow("forecast: HTTP 502");
    await expect(loadForecastMetadata(FORECAST)).resolves.toMatchObject({
      forecast_id: "upstream/a",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
