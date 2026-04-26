import { defineConfig } from "vitest/config";

// Stryker runs tests in an isolated sandbox that doesn't include the
// workspace-level `fixtures/` directory at <repo>/fixtures. Skip the two
// tests that depend on those external fixtures (their assertions are
// already covered by the unit-level lcov / report tests).
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "test/language-fixtures.test.ts",
      "test/external-fixtures.test.ts",
    ],
  },
});
