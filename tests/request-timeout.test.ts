import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REQUEST_TIMEOUT_MS,
  clearConfigCache,
  loadConfig,
  loadForecastMetadata,
  loadMeteogramData,
} from "../src/api";

const CONFIG = "https://wod.example/api/v2/widget/meteo/config/site";
const FORECAST = `${CONFIG}/forecast/upstream/a`;
const POINT = "https://wod.example/data/latlon/64.1,-21.9/meteogram.json";

/** A fetch that never answers, and rejects like the real one when aborted. */
function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
  );
}

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("request timeout", () => {
  beforeEach(() => {
    clearConfigCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is long enough for a slow phone connection", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(20_000);
  });

  it("gives up on point data that never comes, and aborts the request", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const result = loadMeteogramData(POINT, { clientName: "site" });
    const settled = expect(result).rejects.toThrow("meteogram: timed out after 20 s");
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(signal.aborted).toBe(true);
  });

  it("forgets a timed-out config request, so Retry asks again", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const first = expect(loadConfig({ clientName: "site", apiUrl: CONFIG })).rejects.toThrow(
      "config: timed out after 20 s",
    );
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await first;

    fetchMock.mockImplementation(() =>
      ok({ forecasts: [{ id: "upstream/a", name: "A", url: FORECAST }] }),
    );
    const forecasts = await loadConfig({ clientName: "site", apiUrl: CONFIG });
    expect(forecasts.map((f) => f.id)).toEqual(["upstream/a"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels point data when the caller aborts (a newer load, or the element removed)", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const caller = new AbortController();
    const result = loadMeteogramData(POINT, { clientName: "site" }, caller.signal);
    const settled = expect(result).rejects.toMatchObject({ name: "AbortError" });
    caller.abort();
    await settled;
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(true);
    // No timer left behind to fire later.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets one caller stop waiting for shared metadata without cancelling it for the others", async () => {
    let answer: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const leaving = new AbortController();
    const gone = loadForecastMetadata(FORECAST, leaving.signal);
    const staying = loadForecastMetadata(FORECAST);
    const goneSettled = expect(gone).rejects.toMatchObject({ name: "AbortError" });
    leaving.abort();
    await goneSettled;

    answer(new Response(JSON.stringify({ forecast_id: "upstream/a", stations: [] })));
    await expect(staying).resolves.toMatchObject({ forecast_id: "upstream/a" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
