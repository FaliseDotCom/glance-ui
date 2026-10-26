// ADR-0030: the live check of every community widget (test/community-live.sh), one at a time against one container.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "check.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: process.env.CW_OUT ? `${process.env.CW_OUT}/playwright` : undefined,
  reporter: [["line"]],
  use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } },
});
