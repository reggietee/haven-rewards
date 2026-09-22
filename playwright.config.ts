import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4287",
    viewport: { width: 1112, height: 834 },
    deviceScaleFactor: 1,
    hasTouch: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command:
      "node_modules/.bin/node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4287 --strictPort",
    port: 4287,
    reuseExistingServer: true,
  },
});
