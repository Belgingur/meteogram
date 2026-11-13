import { expect, test } from "@playwright/test";

// Playwright's Chromium hides scrollbars, and on macOS a native bar is an
// overlay that takes no room. This file shows scrollbars, and sets the
// widget's ::-webkit-scrollbar rule to 14px, so
// the chart's bar takes room as a classic (e.g. Windows) scrollbar does, at a
// thickness the widget must measure rather than assume. It is a file of its own
// because launch options apply per worker.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("the expanded chart keeps its horizontal scrollbar inside the column, with no vertical scroll", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "::-webkit-scrollbar sizing is Chromium's");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.clock.install({ time: new Date("2026-07-08T12:00:00Z") });
  await page.addInitScript(() => localStorage.clear());
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/e2e/fixture.html");

  const panel = page.locator("#desktop-panel");
  await expect(panel.locator(".chart-fs-btn")).toBeVisible();
  await panel.evaluate((el) => {
    const style = document.createElement("style");
    style.textContent = `
      .chart-scroll { scrollbar-width: auto !important; scrollbar-color: auto !important; }
      .chart-scroll::-webkit-scrollbar { height: 14px !important; }`;
    el.shadowRoot!.appendChild(style);
  });
  await panel.locator(".chart-fs-btn").click();
  await expect(panel.locator(".page.is-expanded")).toBeVisible();

  const fit = await panel.locator(".exp-right .chart-fit").evaluate((box) => {
    const scroller = box.querySelector<HTMLElement>(".chart-scroll")!;
    const b = box.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return {
      bar: scroller.offsetHeight - scroller.clientHeight,
      clientHeight: box.clientHeight,
      scrollHeight: box.scrollHeight,
      overflowY: getComputedStyle(box).overflowY,
      barBottom: s.bottom,
      boxBottom: b.bottom,
    };
  });
  expect(fit.bar).toBe(14);
  expect(fit.overflowY).toBe("hidden");
  expect(fit.scrollHeight).toBe(fit.clientHeight);
  expect(fit.barBottom).toBeLessThanOrEqual(fit.boxBottom + 0.5);
  expect(errors).toEqual([]);
});

// #32: the column can get shorter after the chart was drawn for it, with nothing
// resized. On a page's first expand, the panel's web font can finish loading
// only then and re-flow the text above the chart. The fixture stubs the font,
// so this grows the readout above the chart instead, after the first paint.
test("the expanded chart is drawn again when its column shrinks after the first paint", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "::-webkit-scrollbar sizing is Chromium's");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.clock.install({ time: new Date("2026-07-08T12:00:00Z") });
  await page.addInitScript(() => localStorage.clear());
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/e2e/fixture.html");

  const panel = page.locator("#desktop-panel");
  await expect(panel.locator(".chart-fs-btn")).toBeVisible();
  await panel.evaluate((el) => {
    const style = document.createElement("style");
    style.textContent = `
      .chart-scroll { scrollbar-width: auto !important; scrollbar-color: auto !important; }
      .chart-scroll::-webkit-scrollbar { height: 14px !important; }`;
    el.shadowRoot!.appendChild(style);
  });
  await panel.locator(".chart-fs-btn").click();
  await expect(panel.locator(".page.is-expanded")).toBeVisible();

  const measure = () =>
    panel.locator(".exp-right .chart-fit").evaluate((box) => {
      const scroller = box.querySelector<HTMLElement>(".chart-scroll")!;
      return {
        clientHeight: box.clientHeight,
        scrollHeight: box.scrollHeight,
        barBottom: scroller.getBoundingClientRect().bottom,
        boxBottom: box.getBoundingClientRect().bottom,
        scrollLeft: scroller.scrollLeft,
      };
    });
  const before = await measure();
  expect(before.scrollHeight).toBe(before.clientHeight);

  // The reader has scrolled the chart along; the redraw keeps that.
  await panel.locator(".exp-right .chart-scroll").evaluate((s) => {
    s.scrollLeft = 300;
  });
  const left = await panel
    .locator(".exp-right .chart-scroll")
    .evaluate((s) => s.scrollLeft);
  expect(left).toBeGreaterThan(0);

  // The readout above the chart gets taller, as a late font can make the text
  // above the chart, so the column gets shorter.
  await panel.evaluate((el) => {
    const style = document.createElement("style");
    style.textContent = `.exp-right .readout { padding-bottom: 20px !important; }`;
    el.shadowRoot!.appendChild(style);
  });

  await expect
    .poll(async () => (await measure()).clientHeight)
    .toBeLessThan(before.clientHeight - 2);
  await expect
    .poll(async () => {
      const m = await measure();
      return m.scrollHeight === m.clientHeight && m.barBottom <= m.boxBottom + 0.5;
    })
    .toBe(true);
  expect((await measure()).scrollLeft).toBe(left);

  // A second, 2px shrink: small, but the column doesn't scroll, so it would
  // still push the bottom of the scrollbar out of view.
  const shrunk = await measure();
  await panel.evaluate((el) => {
    const style = document.createElement("style");
    style.textContent = `.exp-right .readout { padding-bottom: 22px !important; }`;
    el.shadowRoot!.appendChild(style);
  });
  await expect.poll(async () => (await measure()).clientHeight).toBe(shrunk.clientHeight - 2);
  await expect
    .poll(async () => {
      const m = await measure();
      return m.scrollHeight === m.clientHeight && m.barBottom <= m.boxBottom + 0.5;
    })
    .toBe(true);
  expect(errors).toEqual([]);
});
