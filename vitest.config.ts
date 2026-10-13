import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    globalSetup: ["./vitest.setup.ts"],
    testTimeout: 30_000,
  },
});
