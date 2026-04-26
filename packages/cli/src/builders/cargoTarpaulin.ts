import type { CoverageBuilderPlugin } from "./types.js";
import { rustSourceExtensions } from "./extensions.js";
import { fixedLcovPath } from "./lcovPath.js";

export const cargoTarpaulinBuilder: CoverageBuilderPlugin = {
  id: "cargo-tarpaulin",
  aliases: ["tarpaulin"],
  label: "cargo-tarpaulin",
  description:
    "Run cargo-tarpaulin with LCOV output and generate the static report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: rustSourceExtensions,
  async prepareRun(options) {
    const { lcov, reportDir } = fixedLcovPath(
      options.lcov,
      cargoTarpaulinBuilder.defaultLcov!,
      cargoTarpaulinBuilder.label,
    );
    return {
      command: "cargo",
      args: [
        "tarpaulin",
        "--out",
        "Lcov",
        "--output-dir",
        reportDir,
        ...options.builderArgs,
      ],
      lcov,
    };
  },
};
