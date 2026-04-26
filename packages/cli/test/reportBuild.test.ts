import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildReport } from "../src/build.js";
import { FIXTURE_DIR, writeMinimalWebAssets } from "./buildTestHelpers.js";

describe("buildReport end-to-end", () => {
  let workspace: string;
  let originalCwd: string;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let originalWebAssetsDir: string | undefined;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-build-")),
    );
    await cp(FIXTURE_DIR, workspace, { recursive: true });
    await writeMinimalWebAssets(path.join(workspace, "web-assets"));
    originalWebAssetsDir = process.env.DOUBLCOV_WEB_ASSETS_DIR;
    process.env.DOUBLCOV_WEB_ASSETS_DIR = path.join(workspace, "web-assets");
    originalCwd = process.cwd();
    process.chdir(workspace);
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    if (originalWebAssetsDir === undefined) {
      delete process.env.DOUBLCOV_WEB_ASSETS_DIR;
    } else {
      process.env.DOUBLCOV_WEB_ASSETS_DIR = originalWebAssetsDir;
    }
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  function baseOptions(
    overrides: Partial<Parameters<typeof buildReport>[0]> = {},
  ) {
    return {
      lcov: path.join(workspace, "lcov.info"),
      sources: ["src"],
      sourceExtensions: [".sol"],
      out: path.join(workspace, "coverage", "report"),
      history: path.join(workspace, ".doublcov", "history.json"),
      port: 0,
      timeoutMs: 60_000,
      diagnostics: [],
      mode: "static" as const,
      open: false,
      ...overrides,
    };
  }

  it("writes report.json, history.json, and per-file payloads", async () => {
    const result = await buildReport(baseOptions());
    expect(result.outDir).toBe(path.join(workspace, "coverage", "report"));

    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.files.length).toBeGreaterThan(0);
    expect(report.projectName).toBeTruthy();
    const firstFile = report.files[0];
    const filePayload = JSON.parse(
      await readFile(
        path.join(result.outDir, "data", "files", `${firstFile.id}.json`),
        "utf8",
      ),
    );
    expect(filePayload).toMatchObject({
      id: firstFile.id,
      path: firstFile.path,
    });
    const historyText = await readFile(
      path.join(workspace, ".doublcov", "history.json"),
      "utf8",
    );
    expect(JSON.parse(historyText).runs.length).toBeGreaterThan(0);
  });

  it("error message for a missing LCOV file mentions the path", async () => {
    const missingLcov = path.join(workspace, "does-not-exist.info");
    await expect(
      buildReport(baseOptions({ lcov: missingLcov })),
    ).rejects.toThrow(missingLcov);
  });

  it("infers the project name from package.json (and ignores whitespace-only names)", async () => {
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "   " }),
      "utf8",
    );
    const result = await buildReport(baseOptions());
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.projectName).toBe(path.basename(workspace));
  });

  it("uses a valid package.json name as the report project name", async () => {
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "branch-coverage-test-project" }),
      "utf8",
    );
    const result = await buildReport(baseOptions());
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.projectName).toBe("branch-coverage-test-project");
  });

  it("propagates non-ENOENT errors when reading package.json", async () => {
    await mkdir(path.join(workspace, "package.json"), { recursive: true });
    await expect(buildReport(baseOptions())).rejects.toMatchObject({
      code: expect.stringMatching(/EISDIR|EACCES/),
    });
  });

  it("does not crash the build when package.json contains invalid JSON", async () => {
    await writeFile(
      path.join(workspace, "package.json"),
      "{ this is not json",
      "utf8",
    );
    let result;
    try {
      result = await buildReport(baseOptions());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/package\.json/);
      return;
    }
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.projectName).toBe(path.basename(workspace));
  });

  it("ignores non-string and array name fields in package.json", async () => {
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: ["array", "name"] }),
      "utf8",
    );
    const result = await buildReport(baseOptions());
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.projectName).toBe(path.basename(workspace));
  });

  it("emits a warning into the report when the diagnostic parser is unknown", async () => {
    const diagFile = path.join(workspace, "diag.txt");
    await writeFile(diagFile, "anything", "utf8");
    const result = await buildReport(
      baseOptions({
        diagnostics: [{ parser: "not-a-real-parser", path: diagFile }],
      }),
    );
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    const warnings: Array<{ severity?: string; message?: string }> =
      report.diagnostics ?? [];
    expect(
      warnings.some(
        (warning) =>
          warning.severity === "warning" &&
          typeof warning.message === "string" &&
          warning.message.includes("not-a-real-parser"),
      ),
    ).toBe(true);
  });

  it("ignores diagnostic inputs whose files are missing", async () => {
    const result = await buildReport(
      baseOptions({
        diagnostics: [
          {
            parser: "foundry-debug",
            path: path.join(workspace, "missing.txt"),
          },
        ],
      }),
    );
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.diagnostics).toEqual([]);
  });

  it("preserves existing history runs in the generated report", async () => {
    const historyPath = path.join(workspace, ".doublcov", "history.json");
    await mkdir(path.dirname(historyPath), { recursive: true });
    await writeFile(
      historyPath,
      JSON.stringify({
        schemaVersion: 1,
        runs: [
          {
            id: "previous-run",
            timestamp: "2025-01-01T00:00:00.000Z",
            totals: {
              lines: { found: 10, hit: 5, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
              branches: { found: 0, hit: 0, percent: 0 },
            },
            files: [],
          },
        ],
      }),
      "utf8",
    );
    const result = await buildReport(baseOptions({ history: historyPath }));
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.history.runs.map((run: { id: string }) => run.id)).toContain(
      "previous-run",
    );
  });

  it("preserves social preview metadata and preview assets in standalone output", async () => {
    const webAssetsDir = path.join(workspace, "web-assets");
    const previewImageBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await writeFile(
      path.join(webAssetsDir, "index.html"),
      [
        "<!doctype html>",
        "<html>",
        "<head>",
        '<meta property="og:title" content="Doublcov">',
        '<meta property="og:image" content="./doublcov-full.png">',
        '<meta name="twitter:card" content="summary_large_image">',
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
    await writeFile(
      path.join(webAssetsDir, "doublcov-full.png"),
      previewImageBytes,
    );

    const result = await buildReport(baseOptions({ mode: "standalone" }));
    const indexHtml = await readFile(
      path.join(result.outDir, "index.html"),
      "utf8",
    );

    expect(indexHtml).toContain('property="og:title" content="Doublcov"');
    expect(indexHtml).toContain(
      'property="og:image" content="./doublcov-full.png"',
    );
    expect(indexHtml).toContain(
      'name="twitter:card" content="summary_large_image"',
    );
    expect(
      await readFile(path.join(result.outDir, "doublcov-full.png")),
    ).toEqual(previewImageBytes);
  });

  it("skips writing history when the resolved history path is empty", async () => {
    const result = await buildReport(
      baseOptions({
        history: "",
        explicit: {
          lcov: true,
          sources: true,
          sourceExtensions: true,
          out: true,
          history: true,
        },
      }),
    );
    expect(result.outDir).toBe(path.join(workspace, "coverage", "report"));
    await expect(
      readFile(path.join(workspace, ".doublcov", "history.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
