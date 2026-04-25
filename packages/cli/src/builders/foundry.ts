import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CoverageBuilderPlugin } from "./types.js";

export const foundryBuilder: CoverageBuilderPlugin = {
  id: "foundry",
  aliases: ["forge"],
  label: "Foundry",
  description: "Run forge coverage and generate the static LCOV report.",
  defaultSources: ["src"],
  defaultExtensions: [".sol"],
  async prepareRun(options) {
    const tempDir = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-"));
    const lcov = options.lcov ?? path.join(tempDir, "lcov.info");
    return {
      command: "forge",
      args: ["coverage", "--report", "lcov", "--report-file", lcov, ...options.builderArgs],
      lcov,
      cleanup: () => rm(tempDir, { recursive: true, force: true })
    };
  }
};
