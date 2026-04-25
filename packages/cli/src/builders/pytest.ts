import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { CoverageBuilderPlugin } from "./types.js";
import { pythonSourceExtensions } from "./extensions.js";

export const pytestBuilder: CoverageBuilderPlugin = {
  id: "pytest",
  aliases: ["python", "coverage.py", "coverage-py"],
  label: "Pytest",
  description:
    "Run pytest with pytest-cov LCOV output and generate the static report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: pythonSourceExtensions,
  async prepareRun(options) {
    const lcov =
      options.lcov ?? pytestBuilder.defaultLcov ?? "coverage/lcov.info";
    await mkdir(path.dirname(lcov), { recursive: true });
    return {
      command: "python",
      args: [
        "-m",
        "pytest",
        "--cov",
        `--cov-report=lcov:${lcov}`,
        ...options.builderArgs,
      ],
      lcov,
    };
  },
};
