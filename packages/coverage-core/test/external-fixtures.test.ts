import { buildCoverageBundle } from "../src/index.js";
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const generatedDir = path.join(root, "fixtures", "generated");

describe("external Solidity fixtures", () => {
  const fixtureNames = existsSync(generatedDir)
    ? readdirSync(generatedDir)
    : [];

  it.skipIf(fixtureNames.length === 0)(
    "builds reports from cloned real-world Solidity repositories",
    () => {
      for (const fixtureName of fixtureNames) {
        const fixtureDir = path.join(generatedDir, fixtureName);
        const metadata = JSON.parse(
          readFileSync(path.join(fixtureDir, "metadata.json"), "utf8"),
        ) as {
          sourceRoot: string;
          sourceDirs: string[];
          files: number;
        };
        const sourceFiles = metadata.sourceDirs.flatMap((sourceDir) =>
          readSources(
            path.join(root, metadata.sourceRoot, sourceDir),
            path.join(root, metadata.sourceRoot),
          ),
        );

        const bundle = buildCoverageBundle({
          lcov: readFileSync(path.join(fixtureDir, "lcov.info"), "utf8"),
          diagnostics: [
            {
              parser: "foundry-debug",
              content: readFileSync(
                path.join(fixtureDir, "coverage.debug"),
                "utf8",
              ),
            },
            {
              parser: "foundry-bytecode",
              content: readFileSync(
                path.join(fixtureDir, "coverage.bytecode"),
                "utf8",
              ),
            },
          ],
          sourceFiles,
          history: { runs: [] },
        });

        expect(bundle.report.files.length).toBeGreaterThanOrEqual(
          Math.min(metadata.files, 1),
        );
        expect(bundle.report.totals.lines.found).toBeGreaterThan(0);
        expect(bundle.report.uncoveredItems.length).toBeGreaterThan(0);
        expect(bundle.sourcePayloads.length).toBe(bundle.report.files.length);
        expect(bundle.report.diagnostics.length).toBeGreaterThan(0);
      }
    },
  );
});

function readSources(
  dir: string,
  repoRoot: string,
): Array<{ path: string; content: string }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return readSources(filePath, repoRoot);
    if (!entry.isFile() || !entry.name.endsWith(".sol")) return [];
    return [
      {
        path: path.relative(repoRoot, filePath).replaceAll(path.sep, "/"),
        content: readFileSync(filePath, "utf8"),
      },
    ];
  });
}
