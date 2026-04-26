import type { CoverageReport } from "@0xdoublesharp/doublcov-core";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/simple",
);

export const EMPTY_REPORT: CoverageReport = {
  schemaVersion: 1,
  projectName: "x",
  summary: {
    lines: { found: 0, hit: 0, percent: 0 },
    functions: { found: 0, hit: 0, percent: 0 },
    branches: { found: 0, hit: 0, percent: 0 },
  },
  files: [],
  history: { schemaVersion: 1, runs: [] },
  uncoveredItems: [],
  diagnostics: [],
} as unknown as CoverageReport;

export async function writeMinimalWebAssets(root: string): Promise<void> {
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(
    path.join(root, "index.html"),
    [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<link rel="stylesheet" href="./assets/index.css">',
      "</head>",
      "<body>",
      '<div id="app"></div>',
      '<script type="module" src="./assets/index.js"></script>',
      "</body>",
      "</html>",
    ].join("\n"),
    "utf8",
  );
  await writeFile(path.join(root, "assets", "index.css"), ".app{}\n", "utf8");
  await writeFile(
    path.join(root, "assets", "index.js"),
    'console.log("doublcov test asset");\n',
    "utf8",
  );
}
