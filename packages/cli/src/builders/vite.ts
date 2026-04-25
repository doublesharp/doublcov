import type { CoverageBuilderPlugin } from "./types.js";
import { javascriptSourceExtensions } from "./extensions.js";
import { fixedLcovPath } from "./lcovPath.js";

export const viteBuilder: CoverageBuilderPlugin = {
  id: "vite",
  aliases: ["vitest"],
  label: "Vite/Vitest",
  description: "Run Vitest coverage and generate the static LCOV report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: javascriptSourceExtensions,
  async prepareRun(options) {
    const { lcov, reportDir } = fixedLcovPath(
      options.lcov,
      viteBuilder.defaultLcov ?? "coverage/lcov.info",
      viteBuilder.label,
    );
    return {
      command: "npx",
      args: [
        "vitest",
        "run",
        "--coverage",
        "--coverage.reporter=lcov",
        `--coverage.reportsDirectory=${reportDir}`,
        ...options.builderArgs,
      ],
      lcov,
    };
  },
};
