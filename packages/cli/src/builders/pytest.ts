import type { CoverageBuilderPlugin } from "./types.js";
import { pythonSourceExtensions } from "./extensions.js";

export const pytestBuilder: CoverageBuilderPlugin = {
  id: "pytest",
  aliases: ["python", "coverage.py", "coverage-py"],
  label: "Pytest",
  description: "Run pytest with pytest-cov LCOV output and generate the static report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: pythonSourceExtensions,
  async prepareRun(options) {
    const lcov = options.lcov ?? pytestBuilder.defaultLcov ?? "coverage/lcov.info";
    return {
      command: "python",
      args: ["-m", "pytest", "--cov", `--cov-report=lcov:${lcov}`, ...options.builderArgs],
      lcov
    };
  }
};
