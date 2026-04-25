import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      include: ["test/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["src/**"],
        exclude: ["src/env.d.ts", "src/main.ts"],
        reporter: ["text-summary", "lcov"],
        reportsDirectory: "coverage",
      },
      root: fileURLToPath(new URL("./", import.meta.url)),
    },
  }),
);
