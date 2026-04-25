import type { CoverageBuilderPlugin } from "./types.js";
import { javascriptSourceExtensions } from "./extensions.js";
import { fixedLcovPath } from "./lcovPath.js";

export const c8Builder: CoverageBuilderPlugin = {
  id: "c8",
  aliases: ["v8", "node", "node-test"],
  label: "Node/V8",
  description:
    "Run the Node test runner through c8's V8 coverage and generate the static report.",
  defaultLcov: "coverage/lcov.info",
  defaultSources: ["src"],
  defaultExtensions: javascriptSourceExtensions,
  async prepareRun(options) {
    const { lcov, reportDir } = fixedLcovPath(
      options.lcov,
      c8Builder.defaultLcov ?? "coverage/lcov.info",
      c8Builder.label,
    );
    return {
      command: "npx",
      args: [
        "c8",
        "--reporter=lcov",
        "--report-dir",
        reportDir,
        "node",
        "--test",
        ...options.builderArgs,
      ],
      lcov,
    };
  },
};
