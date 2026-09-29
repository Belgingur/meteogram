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

async function openFixture(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_TIME });
  await page.addInitScript(() => localStorage.clear());
  await blockWebfonts(page);
  await page.goto("/e2e/fixture.html");
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
