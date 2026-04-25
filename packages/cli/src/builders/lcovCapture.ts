import type { CoverageBuilderPlugin } from "./types.js";
import { cFamilySourceExtensions } from "./extensions.js";

export const lcovCaptureBuilder: CoverageBuilderPlugin = {
  id: "lcov-capture",
  aliases: ["lcov", "gcov", "c", "cpp"],
  label: "LCOV/gcov",
  description: "Capture gcov data with lcov and generate the static report.",
  defaultLcov: "lcov.info",
  defaultSources: ["src", "include"],
  defaultExtensions: cFamilySourceExtensions,
  async prepareRun(options) {
    const lcov = options.lcov ?? lcovCaptureBuilder.defaultLcov ?? "lcov.info";
    return {
      command: "lcov",
      args: ["--capture", "--directory", ".", "--output-file", lcov, ...options.builderArgs],
      lcov
    };
  }
};
