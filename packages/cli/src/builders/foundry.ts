import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { CoverageBuilderPlugin } from "./types.js";

export const foundryBuilder: CoverageBuilderPlugin = {
  id: "foundry",
  aliases: ["forge"],
  label: "Foundry",
  description: "Run forge coverage and generate the static LCOV report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: [".sol"],
  async prepareRun(options) {
    const lcov = options.lcov ?? foundryBuilder.defaultLcov!;
    await mkdir(path.dirname(lcov), { recursive: true });
    return {
      command: "forge",
      args: [
        "coverage",
        "--report",
        "lcov",
        "--report-file",
        lcov,
        ...options.builderArgs,
      ],
      lcov,
    };
  },
};
