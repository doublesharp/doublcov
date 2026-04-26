import type { CoverageBuilderPlugin } from "./types.js";
import { javascriptSourceExtensions } from "./extensions.js";
import { fixedLcovPath } from "./lcovPath.js";

export const jestBuilder: CoverageBuilderPlugin = {
  id: "jest",
  aliases: [],
  label: "Jest",
  description:
    "Run Jest coverage with LCOV output and generate the static report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: javascriptSourceExtensions,
  async prepareRun(options) {
    const { lcov, reportDir } = fixedLcovPath(
      options.lcov,
      jestBuilder.defaultLcov!,
      jestBuilder.label,
    );
    return {
      command: "npx",
      args: [
        "jest",
        "--coverage",
        "--coverageReporters=lcov",
        "--coverageDirectory",
        reportDir,
        ...options.builderArgs,
      ],
      lcov,
    };
  },
};
