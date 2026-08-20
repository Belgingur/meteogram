import { expect, test, type Page } from "@playwright/test";

const FIXED_TIME = new Date("2026-07-08T12:00:00Z");

async function openFixture(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_TIME });
  await page.addInitScript(() => localStorage.clear());
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.goto("/e2e/fixture.html");
}

test("renders the sample graph card", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openFixture(page);

  const graph = page.locator("#graph-card");
  await expect(graph.locator(".card")).toBeVisible();
  await expect(graph.locator("svg.mg-plot")).toBeVisible();
  await expect(graph.locator(".error")).toHaveCount(0);
});

test("renders mobile full mode and switches to the graph", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);

  const mobile = page.locator("#mobile-full");
  await expect(mobile.locator(".page.narrow")).toBeVisible();
  await expect(mobile.locator(".tab[data-view='table']")).toHaveClass(/on/);
  await expect(mobile.locator(".tab[data-view='table']")).toHaveAttribute("aria-pressed", "true");
  await expect(mobile.locator(".tab[data-view='graph']")).toHaveAttribute("aria-pressed", "false");
  await expect(mobile.locator(".day-chip")).not.toHaveCount(0);

  await mobile.locator(".tab[data-view='graph']").click();

  await expect(mobile.locator(".tab[data-view='graph']")).toHaveClass(/on/);
  await expect(mobile.locator(".tab[data-view='graph']")).toHaveAttribute("aria-pressed", "true");
  await expect(mobile.locator(".tab[data-view='table']")).toHaveAttribute("aria-pressed", "false");
  await expect(mobile.locator(".graph-host svg.mg-plot")).toBeVisible();
});

test("renders the desktop panel and switches to the table", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFixture(page);

  const panel = page.locator("#desktop-panel");
  await expect(panel.locator(".page.wide-2a")).toBeVisible();
  await expect(panel.locator(".graph-host svg.chart-plot")).toBeVisible();
  await expect(panel.locator(".tab[data-view='graph']")).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".tab[data-view='table']")).toHaveAttribute("aria-pressed", "false");

  await panel.locator(".tab[data-view='table']").click();

  await expect(panel.locator(".tab[data-view='table']")).toHaveClass(/on/);
  await expect(panel.locator(".tab[data-view='table']")).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".tab[data-view='graph']")).toHaveAttribute("aria-pressed", "false");
  await expect(panel.locator(".panel-table")).toBeVisible();
});
