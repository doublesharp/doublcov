import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuilderOptions } from "../src/args.js";
import { coverageBuilders } from "../src/builders/registry.js";

export function builderOptions(
  overrides: Partial<BuilderOptions> = {},
): BuilderOptions {
  return {
    sources: ["src"],
    sourceExtensions: [".ts"],
    out: "coverage/report",
    history: ".doublcov/history.json",
    diagnostics: [],
    open: false,
    port: 60732,
    timeoutMs: 60_000,
    builderArgs: [],
    ...overrides,
  };
}

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

export function unregisterCoverageBuilder(id: string): void {
  const index = coverageBuilders.findIndex((candidate) => candidate.id === id);
  if (index !== -1) coverageBuilders.splice(index, 1);
}
