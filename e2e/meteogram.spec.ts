import { expect, test, type Locator, type Page } from "@playwright/test";

const FIXED_TIME = new Date("2026-07-08T12:00:00Z");

// Every test fails on an uncaught exception or console error, not only on the
// assertions it makes: a broken listener rarely breaks the first paint.
let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(m.text());
  });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

/** Offline and deterministic: answer the font request with an empty sheet (an
    aborted request would log a console error, which fails the test). */
async function blockWebfonts(page: Page): Promise<void> {
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
}

async function openFixture(
  page: Page,
  /** Serve the fixture with `selected-time` already on this widget, so the
   *  chart is first drawn with it rather than moved to it afterwards. */
  selectedTime?: { id: string; iso: string },
): Promise<void> {
  await page.clock.install({ time: FIXED_TIME });
  await page.addInitScript(() => localStorage.clear());
  await blockWebfonts(page);
  if (selectedTime) {
    // Set just before the element is defined, i.e. before it first connects.
    await page.addInitScript(({ id, iso }) => {
      const define = customElements.define.bind(customElements);
      customElements.define = (name, ctor, options) => {
        if (name === "bel-meteogram") {
          document.getElementById(id)?.setAttribute("selected-time", iso);
        }
        define(name, ctor, options);
      };
    }, selectedTime);
  }
  await page.goto("/e2e/fixture.html");
}

/**
 * Every drawn part of the scrub cursor in a widget's chart, and whether it
 * computes as visible: the SVG line and its temperature and wind dots (every
 * chart), the phone chart's handle, and the landscape rail's HTML cursor line
 * and grab dot. Read from computed style, so a part hidden by an attribute, a
 * class or a stylesheet all count, and a part left showing cannot slip by.
 */
async function cursorParts(
  widget: Locator,
): Promise<{ part: string; shown: boolean }[]> {
  return widget.evaluate((el) =>
    [
      ...el.shadowRoot!.querySelectorAll(
        ".graph-host :is(.scrub-cursor, .scrub-dot-temp, .scrub-dot-wind, .scrub-handle, .scrub-grab)",
      ),
    ].map((part) => {
      const cs = getComputedStyle(part);
      return {
        part: `${part.tagName.toLowerCase()}.${part.getAttribute("class")}`,
        shown: cs.visibility !== "hidden" && cs.display !== "none",
      };
    }),
  );
}

/** The "now" marker's temperature dot computes as `visibility`. */
async function expectNowDot(
  widget: Locator,
  visibility: "visible" | "hidden",
): Promise<void> {
  const dot = widget.locator(".chart-now-dot");
  await expect(dot).toHaveCount(1);
  await expect
    .poll(() => dot.evaluate((el) => getComputedStyle(el).visibility))
    .toBe(visibility);
}

/** No part of the cursor is on screen, and there are parts to check. The orange
 *  "now" marker is not the cursor: it marks the current hour whatever is
 *  selected, so its line stays. Its dot is drawn exactly like the cursor's
 *  temperature dot, so with no cursor it goes too. */
async function expectNoCursor(widget: Locator, minParts = 3): Promise<void> {
  await expect.poll(async () => (await cursorParts(widget)).length).toBeGreaterThanOrEqual(minParts);
  await expect
    .poll(async () => (await cursorParts(widget)).filter((p) => p.shown))
    .toEqual([]);
  // Computed style, not toBeVisible: a vertical line has a zero-width box.
  const now = widget.locator(".graph-host .chart-now");
  await expect(now).toHaveCount(1);
  expect(await now.evaluate((el) => getComputedStyle(el).visibility)).toBe("visible");
  await expectNowDot(widget, "hidden");
}

/** x of an SVG line inside the component, in its own user units */
async function lineX(line: Locator): Promise<number> {
  return Number(await line.getAttribute("x1"));
}

async function widths(items: Locator): Promise<number[]> {
  return items.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  );
}

/** Tap on touch devices, click otherwise — the plot takes both */
/**
 * Scroll the page vertically so `target`'s top sits near the top of the
 * viewport, and return its box. Not scrollIntoView: that would also scroll the
 * chart's own horizontal scroller and move the columns under test.
 */
async function reveal(
  page: Page,
  target: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const top = (await target.boundingBox())!.y;
  await page.evaluate((dy) => window.scrollBy(0, dy), top - 80);
  return (await target.boundingBox())!;
}

async function press(
  page: Page,
  target: Locator,
  x: number,
  y: number,
): Promise<void> {
  const box = await reveal(page, target);
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await page.touchscreen.tap(box.x + x, box.y + y);
  else await page.mouse.click(box.x + x, box.y + y);
}

test("renders the sample graph card", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openFixture(page);

  const graph = page.locator("#graph-card");
  await expect(graph.locator(".card")).toBeVisible();
  await expect(graph.locator("svg.mg-plot")).toBeVisible();
  await expect(graph.locator(".error")).toHaveCount(0);
});

test("graph card opens on now and hovering moves the cursor, not the now line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openFixture(page);

  const graph = page.locator("#graph-card");
  const now = graph.locator(".chart-now");
  const cursor = graph.locator(".scrub-cursor");
  await expect(now).toHaveCount(1);
  expect(await lineX(cursor)).toBe(await lineX(now));
  await expect(graph.locator(".ro-time")).toContainText("12:00");

  // Two columns (34 px each) right of now. The plot's box already carries the
  // scroll offset, so plot-local x maps straight onto the page.
  const nowX = await lineX(now);
  const plotBox = await reveal(page, graph.locator("svg.mg-plot"));
  await page.mouse.move(plotBox.x + nowX + 68, plotBox.y + 100);

  await expect(graph.locator(".ro-time")).toContainText("14:00");
  expect(await lineX(cursor)).toBe(nowX + 68);
  expect(await lineX(now)).toBe(nowX);
});

test("switches language when the attribute changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);

  const mobile = page.locator("#mobile-full");
  await expect(mobile.locator(".tab[data-view='table']")).toHaveText("Table");
  await mobile.evaluate((el) => el.setAttribute("language", "is"));
  await expect(mobile.locator(".tab[data-view='table']")).toHaveText("Tafla");
  await expect(mobile.locator(".tab[data-view='graph']")).toHaveText("Graf");
});

test.describe("mobile @mobile", () => {
  test("renders mobile full mode and switches to the graph", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await expect(mobile.locator(".page.narrow")).toBeVisible();
    await expect(mobile.locator(".tab[data-view='table']")).toHaveClass(/on/);
    await expect(mobile.locator(".tab[data-view='table']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(mobile.locator(".tab[data-view='graph']")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(mobile.locator(".day-chip")).not.toHaveCount(0);

    await mobile.locator(".tab[data-view='graph']").click();

    await expect(mobile.locator(".tab[data-view='graph']")).toHaveClass(/on/);
    await expect(mobile.locator(".tab[data-view='graph']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(mobile.locator(".tab[data-view='table']")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(mobile.locator(".graph-host svg.mg-plot")).toBeVisible();
  });

  test("gives every day chip the same width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    // "Tomorrow" is the longest name, and must not make its chip wider.
    const chips = page.locator("#mobile-full .day-chip");
    await expect(chips).not.toHaveCount(0);
    expect(new Set(await widths(chips)).size).toBe(1);
  });

  test("selecting a day chip shows that day, and only today marks now", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    const chips = mobile.locator(".day-chip");
    await expect(chips.nth(0)).toHaveClass(/sel/);
    await expect(mobile.locator(".hrow-now")).toHaveCount(1);

    await chips.nth(1).click();

    await expect(chips.nth(1)).toHaveClass(/sel/);
    await expect(chips.nth(0)).not.toHaveClass(/sel/);
    await expect(mobile.locator(".day-chip.sel")).toHaveCount(1);
    await expect(mobile.locator(".hrow-now")).toHaveCount(0);
  });

  test("mobile graph draws the now line and a tap moves only the cursor", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".tab[data-view='graph']").click();

    const host = mobile.locator(".graph-host");
    const now = host.locator(".chart-now");
    const cursor = host.locator(".scrub-cursor");
    await expect(now).toHaveCount(1);
    await expect(now).toHaveAttribute("stroke", "#D17F00");
    const nowX = await lineX(now);
    expect(await lineX(cursor)).toBe(nowX);

    // The now line must be on screen when the card opens, not scrolled away.
    const scroller = host.locator(".scroll");
    const view = await scroller.evaluate((el) => ({
      left: el.scrollLeft,
      width: el.clientWidth,
    }));
    expect(nowX).toBeGreaterThanOrEqual(view.left);
    expect(nowX).toBeLessThanOrEqual(view.left + view.width);

    // One column (34 px) right of now, low in the plot, clear of the chips.
    const before = await host.locator(".ro-time").textContent();
    const plot = host.locator("svg.mg-plot");
    await press(page, plot, nowX + 34, 200);

    await expect(host.locator(".ro-time")).not.toHaveText(before ?? "");
    expect(await lineX(cursor)).toBe(nowX + 34);
    expect(await lineX(now)).toBe(nowX);
  });

  test("the page never scrolls sideways on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await expect(mobile.locator(".page.narrow")).toBeVisible();
    const overflow = async (): Promise<number> =>
      mobile.evaluate((el) => {
        const page = el.shadowRoot!.querySelector<HTMLElement>(".page")!;
        return page.scrollWidth - page.clientWidth;
      });
    expect(await overflow()).toBeLessThanOrEqual(0);

    await mobile.locator(".tab[data-view='graph']").click();
    await expect(mobile.locator(".graph-host svg.mg-plot")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test("the Table/Graph switch works from the keyboard", async ({
    page,
    browserName,
  }) => {
    // WebKit does not move focus to buttons with Tab by default.
    test.skip(
      browserName === "webkit",
      "WebKit skips buttons in the tab order",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".tab[data-view='table']").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(mobile.locator(".tab[data-view='graph']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the mobile chart is a keyboard slider that announces the hour", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".tab[data-view='graph']").click();
    const slider = mobile.locator(".graph-host .scroll[role='slider']");
    const cursor = mobile.locator(".graph-host .scrub-cursor");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      /12:00, \d+°, [\d.]+ mm/,
    );
    const x0 = await lineX(cursor);

    await slider.focus();
    await page.keyboard.press("ArrowRight");
    expect(await lineX(cursor)).toBe(x0 + 34);
    await expect(slider).toHaveAttribute("aria-valuetext", /13:00/);

    // End: the last column, scrolled into view rather than left off-screen.
    await page.keyboard.press("End");
    const max = Number(await slider.getAttribute("aria-valuemax"));
    await expect(slider).toHaveAttribute("aria-valuenow", String(max));
    const end = await lineX(cursor);
    const view = await slider.evaluate((el) => ({
      left: el.scrollLeft,
      width: el.clientWidth,
    }));
    expect(end).toBeGreaterThanOrEqual(view.left);
    expect(end).toBeLessThanOrEqual(view.left + view.width);
  });

  test("picking a day keeps that chip in view and focused", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    const row = mobile.locator(".day-chips");
    const last = mobile.locator(".day-chip").last();
    await row.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await last.focus();
    await page.keyboard.press("Enter");

    await expect(last).toHaveClass(/sel/);
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(last).toBeFocused();
    const inView = await last.evaluate((chip) => {
      const r = chip.getBoundingClientRect();
      const v = chip.parentElement!.parentElement!.getBoundingClientRect();
      return r.left >= v.left - 1 && r.right <= v.right + 1;
    });
    expect(inView).toBe(true);
  });

  test("settings dialog takes focus, traps Tab and closes on Escape", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit skips buttons in the tab order",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".pill").click();
    const dialog = mobile.locator(".overlay[role='dialog']");
    await expect(dialog).toBeFocused();
    await expect(mobile.locator(".station-search")).toHaveAttribute(
      "aria-label",
      /.+/,
    );

    // Shift+Tab from the dialog wraps to its last control, not out to the page.
    await page.keyboard.press("Shift+Tab");
    const inside = await dialog.evaluate((d) =>
      d.contains((d.getRootNode() as ShadowRoot).activeElement),
    );
    expect(inside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(mobile.locator(".pill")).toBeFocused();
  });

  test("keeps the chosen view across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: FIXED_TIME });
    await blockWebfonts(page);
    await page.goto("/e2e/fixture.html");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".tab[data-view='graph']").click();
    await expect(mobile.locator(".graph-host svg.mg-plot")).toBeVisible();
    // The persisted view must not throw or blank the widget on the way back in.
    await page.reload();
    await expect(mobile.locator(".page.narrow")).toBeVisible();
    await expect(mobile.locator(".error")).toHaveCount(0);
  });
});

test.describe("desktop", () => {
  test("renders the desktop panel and switches to the table", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    await expect(panel.locator(".page.wide-2a")).toBeVisible();
    await expect(panel.locator(".graph-host svg.chart-plot")).toBeVisible();
    await expect(panel.locator(".tab[data-view='graph']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(panel.locator(".tab[data-view='table']")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await panel.locator(".tab[data-view='table']").click();

    await expect(panel.locator(".tab[data-view='table']")).toHaveClass(/on/);
    await expect(panel.locator(".tab[data-view='table']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(panel.locator(".tab[data-view='graph']")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(panel.locator(".panel-table")).toBeVisible();
    await expect(panel.locator(".hrow-now")).toHaveCount(1);
  });

  test("desktop chips are equal and the now line matches the phone's", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    expect(new Set(await widths(panel.locator(".day-chip"))).size).toBe(1);
    await expect(panel.locator(".graph-host .chart-now")).toHaveCount(1);
    await expect(panel.locator(".graph-host .chart-now")).toHaveAttribute(
      "stroke",
      "#D17F00",
    );
  });

  test("hovering the desktop chart moves the readout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    // The plot is far wider than the panel; aim inside the visible scroller.
    const scroller = panel.locator(".chart-scroll");
    const before = await panel.locator(".ro-time").first().textContent();
    const box = await reveal(page, scroller);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await expect(panel.locator(".ro-time").first()).not.toHaveText(
      before ?? "",
    );
  });

  test("the close button is keyboard reachable and labelled", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const close = page.locator("#desktop-panel button[aria-label]").first();
    await expect(close).toBeVisible();
    expect((await close.getAttribute("aria-label"))?.trim()).not.toBe("");
  });

  test("arrow keys in the station search move the caret, not the chart", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const cursor = panel.locator(".chart-plot .scrub-cursor");
    const x0 = await lineX(cursor);

    // With nothing focused the arrows scrub the chart…
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => lineX(cursor)).toBeGreaterThan(x0);
    const x1 = await lineX(cursor);

    // …but inside a text field they belong to the field.
    await panel.locator(".pill").click();
    const search = panel.locator(".station-search");
    await search.fill("abcdef");
    await search.press("ArrowLeft");
    await search.press("ArrowLeft");
    expect(
      await search.evaluate((el: HTMLInputElement) => el.selectionStart),
    ).toBe(4);
    expect(await lineX(cursor)).toBe(x1);
  });

  test("the desktop chart slider moves one hour per key, not two", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const slider = panel.locator(".chart-scroll[role='slider']");
    await expect(slider).toHaveAttribute("aria-valuetext", /12:00/);
    const now = Number(await slider.getAttribute("aria-valuenow"));
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", String(now + 1));
    await expect(slider).toHaveAttribute("aria-valuetext", /13:00/);
  });
});

test("the bottom sheet takes focus, closes on Escape and gives focus back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);

  await page.evaluate(() => {
    const opener = document.createElement("button");
    opener.id = "opener";
    opener.textContent = "open";
    document.body.prepend(opener);
    opener.focus();
    type Ctor = {
      openSheet(o: {
        title: string;
        attributes: Record<string, string>;
      }): HTMLElement;
    };
    (customElements.get("bel-meteogram") as unknown as Ctor).openSheet({
      title: "Reykjavík",
      attributes: { sample: "", language: "is", hours: "24" },
    });
  });

  const sheet = page.locator("bel-meteogram-sheet");
  await expect(sheet.locator(".close")).toBeFocused();
  await expect(sheet.locator(".close")).toHaveAttribute("aria-label", "Loka");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#opener")).toBeFocused();
});

test.describe("station-corrected forecast @mobile", () => {
  const API = "https://wod.example/api/v2";
  const CONFIG = `${API}/widget/meteo/config/site`;
  const STATION = { name: "Akureyri", lat: 65.6856, lon: -18.1002 };

  /** Answer the WOD API from fixtures: one schedule forecast with a station
   *  listed by ref, and the same series from either point endpoint — the
   *  station one adding the corrections it applied. */
  async function mockApi(page: Page, requested: string[]): Promise<void> {
    const t0 = Date.parse("2026-07-08T00:00:00Z");
    const time = Array.from({ length: 48 }, (_, i) =>
      new Date(t0 + i * 3_600_000).toISOString(),
    );
    const series = (v: number) => time.map(() => v);
    const body = (corrections?: Record<string, string>) => ({
      time,
      data: {
        air_temperature_at_2m_agl: series(9),
        wind_speed_at_10m_agl: series(4),
        wind_from_direction_at_10m_agl: series(200),
        lwe_precipitation_rate: series(0),
        cloud_area_fraction: series(0.5),
      },
      meta: { location_timezone_offset: 0, ...(corrections && { corrections }) },
    });
    await page.route(`${API}/**`, (route) => {
      const url = route.request().url();
      requested.push(url);
      const json = url.startsWith(`${CONFIG}/forecast/`)
        ? {
            forecast_id: "schedule/island-8/2",
            duration_h: 48,
            url: "",
            station_data_url: `${API}/data/point/schedule/island-8/2/[station]/meteogram.xml`,
            stations: [
              { id: "vi.3471", ...STATION, extra: { ref: "vi.3471" } },
              { id: "latlon/64.135,-21.877", name: "Reykjavík", lat: 64.135, lon: -21.877, extra: {} },
            ],
          }
        : url === CONFIG
          ? {
              expires: "",
              forecasts: [
                { id: "schedule/island-8/2", name: "Island", url: `${CONFIG}/forecast/schedule/island-8/2` },
              ],
            }
          : url.includes("/station/")
            ? body({
                air_temperature_at_2m_agl: "linear_regression",
                wind_speed_at_10m_agl: "linear_regression",
              })
            : body();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(json),
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    });
  }

  async function mount(page: Page, lat: number, lon: number): Promise<Locator> {
    await page.evaluate(
      ({ lat, lon, config }) => {
        const el = document.createElement("bel-meteogram");
        el.id = "api-full";
        el.setAttribute("mode", "full");
        el.setAttribute("language", "en");
        el.setAttribute("client-name", "site");
        el.setAttribute("api-url", config);
        el.setAttribute("prefer-coordinates", "");
        el.setAttribute("location-lat", String(lat));
        el.setAttribute("location-lon", String(lon));
        document.querySelector("main")!.prepend(el);
      },
      { lat, lon, config: CONFIG },
    );
    return page.locator("#api-full");
  }

  test("a point by a station listed by ref shows the corrected forecast", async ({
    page,
  }) => {
    const requested: string[] = [];
    await mockApi(page, requested);
    await openFixture(page);
    // A village label's position, a couple of hundred metres off the station
    const widget = await mount(page, 65.6835, -18.0878);

    const badge = widget.locator(".corrected");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("");
    await expect(badge).toHaveAttribute(
      "title",
      "Corrected against observations at Akureyri: temp, wind",
    );
    expect(requested.filter((u) => u.includes("/data/point/"))).toEqual([
      `${API}/data/point/schedule/island-8/2/station/vi.3471/meteogram.json`,
    ]);
  });

  test("a point away from any ref station has no badge", async ({ page }) => {
    const requested: string[] = [];
    await mockApi(page, requested);
    await openFixture(page);
    const widget = await mount(page, 64.135, -21.877);

    // Loaded, so the badge is absent and not merely not drawn yet
    await expect(widget.locator(".sk")).toHaveCount(0);
    await expect(widget.locator(".loc-sub, .panel-loc-sub").first()).toBeVisible();
    await expect(widget.locator(".corrected")).toHaveCount(0);
    expect(requested.filter((u) => u.includes("/data/point/"))).toEqual([
      `${API}/data/point/schedule/island-8/2/latlon/64.135,-21.877/meteogram.json`,
    ]);
  });
});

test.describe("station-place line @mobile", () => {
  test("the host's station note shows under the coordinates and goes with a station pick", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);
    const panel = page.locator("#desktop-panel");
    const note = panel.locator(".loc-note");
    await expect(note).toHaveCount(0);

    await panel.evaluate((el) => {
      el.setAttribute("station-place", "Reykjavík");
      el.setAttribute("station-place-km", "2.12");
    });
    await expect(note).toHaveText(
      "Forecast for the weather station 2.1 km from Reykjavík centre",
    );
    // A quiet secondary line, right under the coordinates.
    await expect(panel.locator(".panel-loc-sub + .loc-note")).toHaveCount(1);

    // A station picked in the settings is not the host's point any more.
    await panel.locator(".pill").click();
    await panel.locator(".station-list .station").nth(1).click();
    await expect(note).toHaveCount(0);
    expect(await panel.evaluate((el) => el.hasAttribute("station-place"))).toBe(false);
  });

  test("the mobile location block shows it too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);
    const widget = page.locator("#mobile-full");
    await widget.evaluate((el) => {
      el.setAttribute("station-place", "Borgarnes");
      el.setAttribute("station-place-km", "0.5");
    });
    await expect(widget.locator(".loc-sub + .loc-note")).toHaveText(
      "Forecast for the weather station 0.5 km from Borgarnes centre",
    );
  });
});

interface TimeDetail {
  time: string | null;
  tempC: number | null;
  source: "host" | "user";
}

/** Record the widget's `bel-meteogram-time` and `bel-meteogram-status` events. */
async function recordEvents(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const w = window as unknown as { times: unknown[]; statuses: unknown[] };
    w.times = [];
    w.statuses = [];
    const el = document.getElementById(id)!;
    el.addEventListener("bel-meteogram-time", (e) =>
      w.times.push((e as CustomEvent).detail),
    );
    el.addEventListener("bel-meteogram-status", (e) =>
      w.statuses.push((e as CustomEvent).detail),
    );
  }, id);
}

async function timeEvents(page: Page): Promise<TimeDetail[]> {
  return page.evaluate(
    () => (window as unknown as { times: TimeDetail[] }).times,
  );
}

async function statusEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () => (window as unknown as { statuses: unknown[] }).statuses,
  );
}

async function setSelectedTime(
  page: Page,
  id: string,
  iso: string | null,
): Promise<void> {
  await page.evaluate(
    ([id, iso]) => {
      const el = document.getElementById(id!)!;
      if (iso === null) el.removeAttribute("selected-time");
      else el.setAttribute("selected-time", iso);
    },
    [id, iso],
  );
}

/** The scrub readout's temperature as the reader sees it ("12°" → 12). */
async function readoutTemp(readout: Locator): Promise<number> {
  return Number.parseInt((await readout.locator(".ro-temp").textContent()) ?? "", 10);
}

// The sample run starts at 09:00 UTC on the frozen day (FIXED_TIME − 3 h) and
// steps hourly, so column = hours since then; "now" (12:00) is column 3.
test.describe("selected-time", () => {
  test("moves the desktop readout and cursor without a reload, and reports the readout's temperature", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const slider = panel.locator(".chart-scroll[role='slider']");
    const readout = panel.locator(".graph-host .readout");
    const cursor = panel.locator(".chart-plot .scrub-cursor");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    const nowTemp = await panel.locator(".now-temp").textContent();
    // The cursor sits at the centre of column 3: x = 3.5 columns.
    const colW = (await lineX(cursor)) / 3.5;
    await recordEvents(page, "desktop-panel");

    await setSelectedTime(page, "desktop-panel", "2026-07-09T15:00:00.000Z");

    await expect(slider).toHaveAttribute("aria-valuenow", "30");
    await expect(readout.locator(".ro-time")).toHaveText(/15:00/);
    await expect.poll(() => lineX(cursor)).toBeCloseTo(30.5 * colW, 1);
    // The shown day follows the hour; "the weather now" stays on now.
    await expect(panel.locator(".day-chip.sel")).toHaveAttribute("data-day", "1");
    await expect(panel.locator(".now-temp")).toHaveText(nowTemp ?? "");
    // …and the chart scrolls the new hour into view.
    const scroll = panel.locator(".chart-scroll");
    const view = await scroll.evaluate((el) => [el.scrollLeft, el.clientWidth]);
    const x = await lineX(cursor);
    expect(x).toBeGreaterThan(view[0]);
    expect(x).toBeLessThan(view[0] + view[1]);

    const tempC = await readoutTemp(readout);
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: "2026-07-09T15:00:00.000Z", tempC, source: "host" }]);
    // Paint-only: nothing was refetched.
    expect(await statusEvents(page)).toEqual([]);

    // The same hour again is not reported twice.
    await setSelectedTime(page, "desktop-panel", "2026-07-09T15:00:00.000Z");
    await setSelectedTime(page, "desktop-panel", "2026-07-09T15:10:00.000Z");
    expect(await timeEvents(page)).toHaveLength(1);
  });

  test("a time outside the forecast reports nothing and says so in the readout", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const readout = panel.locator(".graph-host .readout");
    await expect(readout).toBeVisible();
    await recordEvents(page, "desktop-panel");

    await setSelectedTime(page, "desktop-panel", "2026-08-01T00:00:00.000Z");

    await expect(readout).toHaveClass(/is-outside/);
    await expect(readout.locator(".ro-time")).toHaveText("No forecast for this time");
    await expect(readout.locator(".ro-vals")).toBeHidden();
    await expectNoCursor(panel);
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: null, tempC: null, source: "host" }]);

    // Back inside: the cursor and values return.
    await setSelectedTime(page, "desktop-panel", "2026-07-08T18:00:00.000Z");
    await expect(readout).not.toHaveClass(/is-outside/);
    await expect(readout.locator(".ro-time")).toHaveText(/18:00/);
    await expect
      .poll(async () => (await cursorParts(panel)).every((p) => p.shown))
      .toBe(true);
    await expectNowDot(panel, "visible");
  });

  test("no cursor when the chart is first drawn outside, or repainted while outside", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Before the run (09:00 on the 8th), already set when the chart is built.
    await openFixture(page, { id: "desktop-panel", iso: "2026-07-08T00:00:00.000Z" });

    const panel = page.locator("#desktop-panel");
    const readout = panel.locator(".graph-host .readout");
    await expect(readout).toHaveClass(/is-outside/);
    await expectNoCursor(panel);

    // Inside, on another day (the panel repaints for the day chips)…
    await setSelectedTime(page, "desktop-panel", "2026-07-09T15:00:00.000Z");
    await expect(panel.locator(".day-chip.sel")).toHaveAttribute("data-day", "1");
    await expect
      .poll(async () => (await cursorParts(panel)).every((p) => p.shown))
      .toBe(true);
    await expectNowDot(panel, "visible");

    // …then past the run's end…
    await setSelectedTime(page, "desktop-panel", "2026-07-20T00:00:00.000Z");
    await expect(readout).toHaveClass(/is-outside/);
    await expectNoCursor(panel);

    // …and a repaint while outside (picking a day) draws no cursor either.
    await panel.locator(".day-chip[data-day='2']").click();
    await expect(panel.locator(".day-chip.sel")).toHaveAttribute("data-day", "2");
    await expect(panel.locator(".graph-host .readout")).toHaveClass(/is-outside/);
    await expectNoCursor(panel);
  });

  test("removing the attribute returns to now", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const slider = panel.locator(".chart-scroll[role='slider']");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await setSelectedTime(page, "desktop-panel", "2026-07-10T06:00:00.000Z");
    await expect(slider).toHaveAttribute("aria-valuenow", "45");
    await expect(panel.locator(".day-chip.sel")).toHaveAttribute("data-day", "2");
    await recordEvents(page, "desktop-panel");

    await setSelectedTime(page, "desktop-panel", null);

    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await expect(slider).toHaveAttribute("aria-valuetext", /12:00/);
    await expect(panel.locator(".day-chip.sel")).toHaveAttribute("data-day", "0");
    const tempC = await readoutTemp(panel.locator(".graph-host .readout"));
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: "2026-07-08T12:00:00.000Z", tempC, source: "host" }]);
  });

  test("a key press reports the reader's hour; a hover only previews it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const slider = panel.locator(".chart-scroll[role='slider']");
    const readout = panel.locator(".graph-host .readout");
    await setSelectedTime(page, "desktop-panel", "2026-07-08T15:00:00.000Z");
    await expect(slider).toHaveAttribute("aria-valuenow", "6");
    await recordEvents(page, "desktop-panel");

    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "7");
    const tempC = await readoutTemp(readout);
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: "2026-07-08T16:00:00.000Z", tempC, source: "user" }]);

    // Hovering moves the readout but reports nothing, and leaving puts the
    // cursor back on the selected hour.
    const box = await reveal(page, panel.locator(".chart-scroll"));
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
    await expect(readout.locator(".ro-time")).not.toHaveText(/16:00/);
    await page.mouse.move(2, 2);
    await expect(readout.locator(".ro-time")).toHaveText(/16:00/);
    expect(await timeEvents(page)).toHaveLength(1);

    // The host's hour is not stored as the reader's own scrub.
    await page.waitForTimeout(400);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mimirMapPanelState") ?? "{}"),
    );
    expect(stored.scrubUtcMs).toBeUndefined();
  });
});

test.describe("without selected-time", () => {
  test("scrubbing works as it always has, and reports committed moves", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const slider = panel.locator(".chart-scroll[role='slider']");
    const readout = panel.locator(".graph-host .readout");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await recordEvents(page, "desktop-panel");

    // A day ahead, into tomorrow. The day chips are the reader's own choice
    // and a scrub has never moved them; it does not now either.
    await slider.focus();
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "27");
    await expect(readout.locator(".ro-time")).toHaveText(/12:00/);
    await expect(panel.locator(".day-chip.sel")).toHaveAttribute("data-day", "0");
    const tempC = await readoutTemp(readout);
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: "2026-07-09T12:00:00.000Z", tempC, source: "user" }]);
    // Still stored as the reader's scrub, as before.
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem("mimirMapPanelState") ?? "{}").scrubUtcMs,
        ),
      )
      .toBe(Date.parse("2026-07-09T12:00:00Z"));

    // Hover moves the cursor and it stays where the mouse left it; nothing is
    // reported for a hover.
    const box = await reveal(page, panel.locator(".chart-scroll"));
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await expect(readout.locator(".ro-time")).not.toHaveText(/12:00/);
    const hovered = await readout.locator(".ro-time").textContent();
    await page.mouse.move(2, 2);
    await expect(readout.locator(".ro-time")).toHaveText(hovered ?? "");
    expect(await timeEvents(page)).toHaveLength(1);
  });
});

// The graph card (no `mode`) has no day chips or panel around it, but takes
// `selected-time` and reports `bel-meteogram-time` the same way.
test.describe("selected-time in graph mode", () => {
  test("reports the host's time and the reader's click, key and drag, never a hover", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await openFixture(page);

    const graph = page.locator("#graph-card");
    const slider = graph.locator(".scroll[role='slider']");
    const readout = graph.locator(".readout");
    const roTime = readout.locator(".ro-time");
    const cursor = graph.locator(".scrub-cursor");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await recordEvents(page, "graph-card");
    const expected: TimeDetail[] = [];
    /** The readout shows `hh`, and the events so far are `expected` plus this one. */
    const expectEvent = async (
      hh: string,
      time: string | null,
      source: TimeDetail["source"],
    ): Promise<void> => {
      if (time) await expect(roTime).toContainText(hh);
      else await expect(roTime).toHaveText("No forecast for this time");
      const tempC = time ? await readoutTemp(readout) : null;
      expected.push({ time, tempC, source });
      await expect.poll(() => timeEvents(page)).toEqual(expected);
    };

    // The host sets the time.
    await setSelectedTime(page, "graph-card", "2026-07-08T15:00:00.000Z");
    await expect(slider).toHaveAttribute("aria-valuenow", "6");
    await expectEvent("15:00", "2026-07-08T15:00:00.000Z", "host");

    // Hovering two columns (34 px each) right previews 17:00 and reports
    // nothing; leaving puts the cursor back on the host's hour.
    const plot = await reveal(page, graph.locator("svg.mg-plot"));
    const x15 = plot.x + (await lineX(cursor));
    await page.mouse.move(x15 + 68, plot.y + 100);
    await expect(roTime).toContainText("17:00");
    await page.mouse.move(2, 2);
    await expect(roTime).toContainText("15:00");
    expect(await timeEvents(page)).toEqual(expected);

    // A click one column right picks 16:00.
    await page.mouse.click(x15 + 34, plot.y + 100);
    await expectEvent("16:00", "2026-07-08T16:00:00.000Z", "user");
    await page.mouse.move(2, 2);

    // An arrow key on the focused chart picks 17:00.
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "8");
    await expectEvent("17:00", "2026-07-08T17:00:00.000Z", "user");

    // A drag along the track, from the cursor two columns right: nothing while
    // it moves, then 19:00 when it lets go. (It starts on the selected hour, so
    // the press itself reports nothing new.)
    const hit = (await graph.locator(".scrub-hit").boundingBox())!;
    const y = hit.y + hit.height / 2;
    const x17 = plot.x + (await lineX(cursor));
    await page.mouse.move(x17, y);
    await page.mouse.down();
    await page.mouse.move(x17 + 68, y, { steps: 4 });
    await expect(roTime).toContainText("19:00");
    expect(await timeEvents(page)).toEqual(expected);
    await page.mouse.up();
    await expectEvent("19:00", "2026-07-08T19:00:00.000Z", "user");
    await page.mouse.move(2, 2);

    // The host's time goes outside the forecast (before the run)…
    await setSelectedTime(page, "graph-card", "2026-07-08T00:00:00.000Z");
    await expectEvent("", null, "host");
    await expectNowDot(graph, "hidden");

    // …and is removed: back to the current hour.
    await setSelectedTime(page, "graph-card", null);
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await expectEvent("12:00", "2026-07-08T12:00:00.000Z", "host");
    await expectNowDot(graph, "visible");
  });
});

test.describe("selected-time in graph mode @mobile", () => {
  test("a tap picks the reader's hour", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const graph = page.locator("#graph-card");
    const readout = graph.locator(".readout");
    const cursor = graph.locator(".scrub-cursor");
    await setSelectedTime(page, "graph-card", "2026-07-08T15:00:00.000Z");
    await expect(graph.locator(".scroll[role='slider']")).toHaveAttribute("aria-valuenow", "6");
    await recordEvents(page, "graph-card");

    // One column (34 px) right of the cursor. A tap on touch, a click otherwise.
    await press(page, graph.locator("svg.mg-plot"), (await lineX(cursor)) + 34, 100);
    await expect(readout.locator(".ro-time")).toContainText("16:00");
    const tempC = await readoutTemp(readout);
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: "2026-07-08T16:00:00.000Z", tempC, source: "user" }]);
  });
});

test.describe("selected-time on the phone @mobile", () => {
  test("moves the pinned readout and cursor, and the day the table shows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page);

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".tab[data-view='graph']").click();
    const slider = mobile.locator(".graph-host .scroll[role='slider']");
    const readout = mobile.locator(".graph-host .readout");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await recordEvents(page, "mobile-full");

    await setSelectedTime(page, "mobile-full", "2026-07-09T15:00:00.000Z");

    await expect(slider).toHaveAttribute("aria-valuenow", "30");
    await expect(readout.locator(".ro-time")).toHaveText(/15:00/);
    const tempC = await readoutTemp(readout);
    await expect
      .poll(() => timeEvents(page))
      .toEqual([{ time: "2026-07-09T15:00:00.000Z", tempC, source: "host" }]);

    await setSelectedTime(page, "mobile-full", "2026-06-01T00:00:00.000Z");
    await expect(readout).toHaveClass(/is-outside/);
    await expect(readout.locator(".ro-time")).toHaveText("No forecast for this time");
    // Line, both dots and the handle.
    await expectNoCursor(mobile, 4);

    await setSelectedTime(page, "mobile-full", "2026-07-10T09:00:00.000Z");
    await expect(readout).not.toHaveClass(/is-outside/);
    await expectNowDot(mobile, "visible");
    await mobile.locator(".tab[data-view='table']").click();
    await expect(mobile.locator(".day-chip.sel")).toHaveAttribute("data-day", "2");
    expect(await statusEvents(page)).toEqual([]);
  });
});

test.describe("selected-time outside the run, first drawn @mobile", () => {
  test("the phone chart draws no cursor", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page, { id: "mobile-full", iso: "2026-07-20T00:00:00.000Z" });

    const mobile = page.locator("#mobile-full");
    await mobile.locator(".tab[data-view='graph']").click();
    await expect(mobile.locator(".graph-host .readout")).toHaveClass(/is-outside/);
    await expectNoCursor(mobile, 4);
  });

  test("the landscape rail draws no cursor or grab dot", async ({ page, isMobile }) => {
    // The landscape sheet needs a coarse, hover-less pointer: a phone, not a
    // desktop browser at a wide-and-short size.
    test.skip(!isMobile, "landscape layout needs a touch device");
    await page.setViewportSize({ width: 844, height: 390 });
    await openFixture(page, { id: "desktop-panel", iso: "2026-07-08T00:00:00.000Z" });

    const panel = page.locator("#desktop-panel");
    await expect(panel.locator(".page.is-fullscreen")).toBeVisible();
    await expect(panel.locator(".graph-host .readout")).toHaveClass(/is-outside/);
    // SVG line and dots, plus the rail's HTML cursor line and grab dot.
    await expectNoCursor(panel, 5);

    // Back inside, the rail's cursor and grab dot return. (The SVG line and
    // dots are never shown here: the landscape stylesheet hands the cursor to
    // the rail.)
    await setSelectedTime(page, "desktop-panel", "2026-07-08T15:00:00.000Z");
    await expect
      .poll(async () =>
        (await cursorParts(panel))
          .filter((p) => p.part.startsWith("div."))
          .map((p) => p.shown),
      )
      .toEqual([true, true]);
    await expectNowDot(panel, "visible");
  });
});

test.describe("selected-time in a non-UTC browser", () => {
  test.use({ timezoneId: "Europe/Warsaw" });

  test("selects the same absolute hour", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);

    const panel = page.locator("#desktop-panel");
    const slider = panel.locator(".chart-scroll[role='slider']");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(
      await page.evaluate(() => new Date("2026-07-09T15:00:00Z").getTimezoneOffset()),
    ).toBe(-120);
    await recordEvents(page, "desktop-panel");

    await setSelectedTime(page, "desktop-panel", "2026-07-09T15:00:00.000Z");
    await expect(slider).toHaveAttribute("aria-valuenow", "30");
    // The sample point's clock is UTC; the browser's +2 h must not shift it.
    await expect(panel.locator(".graph-host .ro-time")).toHaveText(/15:00/);
    await expect
      .poll(async () => (await timeEvents(page)).map((e) => e.time))
      .toEqual(["2026-07-09T15:00:00.000Z"]);

    // The same instant written with Warsaw's offset is the same hour.
    await setSelectedTime(page, "desktop-panel", "2026-07-09T17:00:00+02:00");
    await expect(slider).toHaveAttribute("aria-valuenow", "30");
    expect(await timeEvents(page)).toHaveLength(1);
  });
});
