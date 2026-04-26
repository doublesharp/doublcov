import type { CoverageBuilderPlugin } from "./types.js";

export const hardhatBuilder: CoverageBuilderPlugin = {
  id: "hardhat",
  aliases: [],
  label: "Hardhat",
  description: "Run Hardhat coverage and generate the static LCOV report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["contracts"],
  defaultExtensions: [".sol"],
  async prepareRun(options) {
    if (options.lcov && options.lcov !== hardhatBuilder.defaultLcov) {
      throw new Error(
        "Hardhat coverage writes coverage/lcov.info; custom --lcov paths are not supported for the hardhat builder.",
      );
    }
    return {
      command: "npx",
      args: ["hardhat", "coverage", ...options.builderArgs],
      lcov: options.lcov ?? hardhatBuilder.defaultLcov ?? "coverage/lcov.info",
    };
  },
};
