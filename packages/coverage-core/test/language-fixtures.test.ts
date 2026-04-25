import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCoverageBundle,
  DEFAULT_SOURCE_EXTENSIONS,
} from "../src/index.js";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const fixtureDir = path.join(root, "fixtures", "languages");
const fixtureSourceDir = path.join(fixtureDir, "src");

describe("multi-language LCOV fixture", () => {
  it("builds a generic report for TypeScript, JavaScript, Rust, C, C++, and Python", () => {
    const bundle = buildCoverageBundle({
      lcov: readFileSync(path.join(fixtureDir, "lcov.info"), "utf8"),
      sourceFiles: readFixtureSources(fixtureSourceDir, fixtureDir),
      history: { runs: [] },
      projectName: "Multi-Language Fixture",
    });

    expect(bundle.report.projectName).toBe("Multi-Language Fixture");
    expect(
      bundle.report.files.map((file) => [file.path, file.language]),
    ).toEqual([
      ["src/math.ts", "typescript"],
      ["src/server.js", "javascript"],
      ["src/lib.rs", "rust"],
      ["src/native.c", "c"],
      ["src/native.cpp", "cpp"],
      ["src/tool.py", "python"],
    ]);
    expect(bundle.report.totals.lines).toMatchObject({
      found: 24,
      hit: 17,
      percent: 70.83,
    });
    expect(bundle.report.totals.functions).toMatchObject({
      found: 7,
      hit: 6,
      percent: 85.71,
    });
    expect(bundle.report.totals.branches).toMatchObject({
      found: 12,
      hit: 5,
      percent: 41.67,
    });
    expect(bundle.report.uncoveredItems).toHaveLength(15);
    expect(bundle.report.ignored).toMatchObject({
      lines: 0,
      byReason: {},
      assemblyLines: 0,
    });
    expect(bundle.sourcePayloads.map((payload) => payload.path)).toEqual([
      "src/math.ts",
      "src/server.js",
      "src/lib.rs",
      "src/native.c",
      "src/native.cpp",
      "src/tool.py",
    ]);
  });

  it("keeps uncovered navigation language-neutral", () => {
    const bundle = buildCoverageBundle({
      lcov: readFileSync(path.join(fixtureDir, "lcov.info"), "utf8"),
      sourceFiles: readFixtureSources(fixtureSourceDir, fixtureDir),
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function",
          filePath: "src/math.ts",
          label: "maybeDouble",
        }),
        expect.objectContaining({
          kind: "branch",
          filePath: "src/server.js",
          line: 2,
        }),
        expect.objectContaining({
          kind: "branch",
          filePath: "src/lib.rs",
          line: 2,
        }),
        expect.objectContaining({
          kind: "branch",
          filePath: "src/native.c",
          line: 2,
        }),
        expect.objectContaining({
          kind: "branch",
          filePath: "src/native.cpp",
          line: 4,
        }),
        expect.objectContaining({
          kind: "branch",
          filePath: "src/tool.py",
          line: 2,
        }),
      ]),
    );
  });
});

function readFixtureSources(
  dir: string,
  repoRoot: string,
): Array<{ path: string; content: string }> {
  if (!existsSync(dir)) return [];
  const extensions = new Set(DEFAULT_SOURCE_EXTENSIONS);
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return readFixtureSources(filePath, repoRoot);
    if (!entry.isFile() || !extensions.has(path.extname(entry.name))) return [];
    return [
      {
        path: path.relative(repoRoot, filePath).replaceAll(path.sep, "/"),
        content: readFileSync(filePath, "utf8"),
      },
    ];
  });
}
