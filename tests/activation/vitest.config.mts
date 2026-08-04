import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/activation/**/*.spec.ts"],
    reporters: ["default", "json"],
    outputFile: {
      json: "test-results/g1-foundation.json"
    },
    testTimeout: 30_000
  }
});
