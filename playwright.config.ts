import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // The public app is mostly read on phones, and iOS browsers are all
    // WebKit: run the phone smoke tests there too, with touch.
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
      grep: /@mobile/,
    },
    // Desktop WebKit, for the styled chart scrollbar only: the phone project
    // has a coarse pointer, where the widget keeps the native overlay bar.
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: /chart-scrollbar\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/e2e/fixture.html",
    reuseExistingServer: !process.env.CI,
  },
});
