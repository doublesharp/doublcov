import type { CoverageBuilderPlugin } from "./types.js";
import { rustSourceExtensions } from "./extensions.js";

export const cargoLlvmCovBuilder: CoverageBuilderPlugin = {
  id: "cargo-llvm-cov",
  aliases: ["llvm-cov", "rust"],
  label: "cargo-llvm-cov",
  description: "Run cargo-llvm-cov with LCOV output and generate the static report.",
  defaultLcov: "lcov.info",
  defaultSources: ["src"],
  defaultExtensions: rustSourceExtensions,
  async prepareRun(options) {
    const lcov = options.lcov ?? cargoLlvmCovBuilder.defaultLcov ?? "lcov.info";
    return {
      command: "cargo",
      args: ["llvm-cov", "--lcov", "--output-path", lcov, ...options.builderArgs],
      lcov
    };
  }
};
