import { defineConfig, devices } from "@playwright/test";

// Needs `pnpm dev:chain` (Anvil :8645, seeded), the indexer on :42169 and the app on :3100;
// `e2e/run.sh` starts all three. Each project runs the same flows at the two design widths.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
