import { expect, test, type Locator, type Page } from "@playwright/test";

// The chart's scrollbar on a pointer device (meteogram #37): 12px, with a thumb
// a reader can see. Playwright's Chromium hides scrollbars by default, so this
// file shows them; launch options apply per worker, hence a file of its own.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function open(page: Page, errors: string[]): Promise<Locator> {
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
  await expect(panel.locator(".graph-host svg.chart-plot")).toBeVisible();
  return panel;
}

/** The bar's thickness, and the colour drawn at the left end of the bar,
 *  where the thumb sits with the chart scrolled to its start. */
async function bar(page: Page, scroller: Locator): Promise<{ height: number; rgb: number[] }> {
  await scroller.evaluate((el) => (el.scrollLeft = 0));
  const height = await scroller.evaluate((el) => el.offsetHeight - el.clientHeight);
  const png = await scroller.screenshot();
  const rgb = await page.evaluate(
    async ({ b64, height }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      // Device pixels per CSS pixel: Desktop Safari renders at 2x.
      const k = devicePixelRatio;
      const d = ctx.getImageData(Math.round(20 * k), Math.round(img.height - (height / 2) * k), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    { b64: png.toString("base64"), height },
  );
  return { height, rgb };
}

function contrastOnWhite([r, g, b]: number[]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (l + 0.05);
}

// Runs in the chromium project and in desktop-webkit (see playwright.config.ts).
test("is 12px with a thumb at 3 : 1 or more, docked and expanded", async ({ page }) => {
  const errors: string[] = [];
  const panel = await open(page, errors);

  const docked = await bar(page, panel.locator(".graph-host .chart-scroll").first());
  expect(docked.height).toBe(12);
  expect(contrastOnWhite(docked.rgb)).toBeGreaterThanOrEqual(3);

  await panel.locator(".chart-fs-btn").click();
  await expect(panel.locator(".page.is-expanded")).toBeVisible();
  const expanded = await bar(page, panel.locator(".exp-right .chart-scroll").first());
  expect(expanded.height).toBe(12);
  expect(contrastOnWhite(expanded.rgb)).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});
