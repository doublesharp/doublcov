import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageReport } from "@0xdoublesharp/doublcov-core";
import {
  cp,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReport,
  escapeHtmlRawText,
  escapeJsonForHtml,
  formatGeneratedReportMessage,
  isCiEnvironment,
  readReportConfig,
  replaceLiteralOnce,
  resolveBuildOptions,
  resolveAutoOpen,
  resolveReportMode,
  sanitizeCustomization,
  sanitizeHistory,
} from "../src/build.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/simple",
);

describe("sanitizeCustomization", () => {
  it("keeps valid declarative customization and strips unsafe hrefs or malformed entries", () => {
    expect(
      sanitizeCustomization({
        defaultTheme: " custom ",
        themes: [
          {
            id: "custom",
            label: "Custom",
            mode: "dark",
            tokens: {
              bg: "#000000",
              accent: "url(javascript:alert(1))",
              unknown: "#ffffff",
            },
          },
          { id: "bad" },
        ],
        hooks: [
          {
            id: "docs",
            hook: "report:header",
            label: "Docs",
            href: "https://example.test/docs",
          },
          {
            id: "bad-link",
            hook: "report:header",
            label: "Bad",
            href: "javascript:alert(1)",
          },
          {
            id: "label",
            hook: "report:header",
            label: "Label",
            content: "no link",
          },
          {
            id: "bad-hook",
            hook: "report:unknown",
            label: "Bad",
          },
        ],
        plugins: [
          {
            id: "ci",
            hooks: [
              {
                id: "run",
                hook: "file:toolbar",
                label: "Run",
                href: "/runs/1",
              },
            ],
          },
        ],
      }),
    ).toEqual({
      defaultTheme: "custom",
      themes: [
        {
          id: "custom",
          label: "Custom",
          mode: "dark",
          tokens: {
            bg: "#000000",
          },
        },
      ],
      hooks: [
        {
          id: "docs",
          hook: "report:header",
          label: "Docs",
          href: "https://example.test/docs",
        },
        {
          id: "bad-link",
          hook: "report:header",
          label: "Bad",
        },
        {
          id: "label",
          hook: "report:header",
          label: "Label",
          content: "no link",
        },
      ],
      plugins: [
        {
          id: "ci",
          hooks: [
            {
              id: "run",
              hook: "file:toolbar",
              label: "Run",
              href: "/runs/1",
            },
          ],
        },
      ],
    });
  });
});

describe("sanitizeHistory", () => {
  it("returns undefined for non-object inputs", () => {
    expect(sanitizeHistory(null)).toBeUndefined();
    expect(sanitizeHistory("not history")).toBeUndefined();
    expect(sanitizeHistory(42)).toBeUndefined();
    expect(sanitizeHistory([])).toBeUndefined();
  });

  it("returns undefined when runs is missing or not an array", () => {
    expect(sanitizeHistory({})).toBeUndefined();
    expect(sanitizeHistory({ runs: "nope" })).toBeUndefined();
    expect(sanitizeHistory({ schemaVersion: 1, runs: 7 })).toBeUndefined();
  });

  it("drops malformed run entries while keeping well-formed ones", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "abc",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 0, hit: 0, percent: 0 },
            branches: { found: 0, hit: 0, percent: 0 },
          },
          files: [],
        },
        { id: "missing-timestamp" },
        "not an object",
      ],
    });
    expect(result?.runs).toHaveLength(1);
    expect(result?.runs[0]?.id).toBe("abc");
  });
});

describe("escapeJsonForHtml", () => {
  it("keeps embedded JSON from closing its script tag", () => {
    const escaped = escapeJsonForHtml(
      JSON.stringify({ source: "</script><script>alert(1)</script>" }),
    );
    expect(escaped).not.toContain("</script>");
    expect(JSON.parse(escaped)).toEqual({
      source: "</script><script>alert(1)</script>",
    });
  });
});

describe("replaceLiteralOnce", () => {
  it("does not expand dollar tokens from inlined assets", () => {
    expect(
      replaceLiteralOnce(
        '<script src="app.js"></script>',
        '<script src="app.js"></script>',
        "x$&y$1",
      ),
    ).toBe("x$&y$1");
  });
});

describe("formatGeneratedReportMessage", () => {
  it("prints the absolute index.html path", () => {
    const report = {
      files: [{ id: "one" }, { id: "two" }],
      uncoveredItems: [{ id: "gap" }],
    } as CoverageReport;
    const message = formatGeneratedReportMessage(
      report,
      "/tmp/doublcov/report",
    );

    expect(message).toContain(
      "Generated 2 file report with 1 uncovered items at /tmp/doublcov/report",
    );
    expect(message).toContain("Open report: /tmp/doublcov/report/index.html");
    expect(message).not.toContain("file://");

    const staticMessage = formatGeneratedReportMessage(
      report,
      "/tmp/doublcov/report",
      "static",
    );
    expect(staticMessage).toContain(
      "Open report: doublcov open /tmp/doublcov/report",
    );
    expect(staticMessage).toContain(
      "Static index: /tmp/doublcov/report/index.html",
    );
  });
});

describe("report config", () => {
  it("reads auto-open without embedding it into report customization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-config-"));
    const configPath = path.join(root, "doublcov.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        open: true,
        defaultTheme: "dark",
        lcov: "custom/lcov.info",
        sources: ["contracts"],
        extensions: ["sol"],
        out: "custom/report",
        history: ".custom/history.json",
        name: "Configured",
        mode: "static",
      }),
      "utf8",
    );

    const config = await readReportConfig({ path: configPath, required: true });
    expect(config.open).toBe(true);
    expect(config).toMatchObject({
      lcov: "custom/lcov.info",
      sources: ["contracts"],
      sourceExtensions: [".sol"],
      out: "custom/report",
      history: ".custom/history.json",
      name: "Configured",
      mode: "static",
    });
    expect(config.customization).toEqual({ defaultTheme: "dark" });
  });

  it("lets CLI build options override doublcov config fields", () => {
    expect(
      resolveBuildOptions(
        {
          lcov: "cli/lcov.info",
          sources: ["src"],
          sourceExtensions: [".ts"],
          out: "coverage/report",
          history: ".doublcov/history.json",
          port: 0,
          timeoutMs: 30 * 60 * 1000,
          diagnostics: [],
          explicit: {
            lcov: true,
            sources: false,
            sourceExtensions: false,
            out: false,
            history: false,
          },
        },
        {
          lcov: "config/lcov.info",
          sources: ["contracts"],
          sourceExtensions: [".sol"],
          out: "config/report",
          history: "config/history.json",
        },
      ),
    ).toMatchObject({
      lcov: "cli/lcov.info",
      sources: ["contracts"],
      sourceExtensions: [".sol"],
      out: "config/report",
      history: "config/history.json",
    });
  });

  it("lets explicit CLI open settings override config", () => {
    expect(resolveAutoOpen(undefined, { open: false }, {})).toBe(false);
    expect(resolveAutoOpen(false, { open: true }, {})).toBe(false);
    expect(resolveAutoOpen(true, { open: false }, { CI: "true" })).toBe(true);
  });

  it("opens by default outside CI and stays closed by default in CI", () => {
    expect(resolveAutoOpen(undefined, {}, {})).toBe(true);
    expect(resolveAutoOpen(undefined, { open: true }, { CI: "true" })).toBe(
      false,
    );
    expect(
      resolveAutoOpen(undefined, { open: true }, { GITHUB_ACTIONS: "true" }),
    ).toBe(false);
    expect(isCiEnvironment({ CI: "1" })).toBe(true);
    expect(isCiEnvironment({ CI: "true" })).toBe(true);
    expect(isCiEnvironment({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(isCiEnvironment({ CI: "false" })).toBe(false);
    expect(isCiEnvironment({ CI: "0" })).toBe(false);
  });

  it("uses standalone mode locally and static mode in CI unless configured", () => {
    expect(resolveReportMode(undefined, {}, {})).toBe("standalone");
    expect(resolveReportMode(undefined, {}, { GITHUB_ACTIONS: "true" })).toBe(
      "static",
    );
    expect(
      resolveReportMode(undefined, { mode: "standalone" }, { CI: "1" }),
    ).toBe("standalone");
    expect(resolveReportMode("static", { mode: "standalone" }, {})).toBe(
      "static",
    );
  });
});

describe("readReportConfig customization handling", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-cust-")),
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("returns an empty config when no customization option is supplied", async () => {
    const config = await readReportConfig(undefined);
    expect(config).toEqual({});
  });

  it("returns an empty config when an optional customization file is missing", async () => {
    const config = await readReportConfig({
      path: path.join(tempRoot, "missing.json"),
      required: false,
    });
    expect(config).toEqual({});
  });

  it("throws an actionable error when a required customization file is missing", async () => {
    const missing = path.join(tempRoot, "absent.json");
    await expect(
      readReportConfig({ path: missing, required: true }),
    ).rejects.toThrow(missing);
  });

  it("emits a customization with just defaultTheme when JSON has no themes", async () => {
    const file = path.join(tempRoot, "config.json");
    await writeFile(file, JSON.stringify({ lcov: "x.info" }), "utf8");
    const config = await readReportConfig({
      path: file,
      defaultTheme: "midnight",
      required: false,
    });
    expect(config.customization).toEqual({ defaultTheme: "midnight" });
  });

  it("silently drops malformed customization fields rather than failing the build", async () => {
    const file = path.join(tempRoot, "garbage.json");
    await writeFile(
      file,
      JSON.stringify({ themes: "not-an-array", hooks: 42 }),
      "utf8",
    );
    const config = await readReportConfig({
      path: file,
      required: false,
    });
    // No themes/hooks left, but parse succeeds.
    expect(config.customization).toBeUndefined();
  });

  it("propagates a path-bearing error when the customization file is not valid JSON", async () => {
    const file = path.join(tempRoot, "broken.json");
    await writeFile(file, "{ not json", "utf8");
    await expect(
      readReportConfig({ path: file, required: false }),
    ).rejects.toThrow(file);
  });
});

describe("buildReport end-to-end", () => {
  let workspace: string;
  let originalCwd: string;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-build-")),
    );
    await cp(FIXTURE_DIR, workspace, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(workspace);
    writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  function baseOptions(overrides: Partial<Parameters<typeof buildReport>[0]> = {}) {
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
      await readFile(
        path.join(result.outDir, "data", "report.json"),
        "utf8",
      ),
    );
    expect(report.files.length).toBeGreaterThan(0);
    expect(report.projectName).toBeTruthy();
    // history file path was provided, so atomic-write must produce a file.
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
      await readFile(
        path.join(result.outDir, "data", "report.json"),
        "utf8",
      ),
    );
    expect(report.projectName).toBe(path.basename(workspace));
  });

  it("does not crash the build when package.json contains invalid JSON", async () => {
    await writeFile(
      path.join(workspace, "package.json"),
      "{ this is not json",
      "utf8",
    );
    // Either we infer a name from the directory or we throw a clear error
    // that mentions package.json. Anything else (a bare SyntaxError without
    // path context, an unhandled rejection, etc.) is a regression.
    let result;
    try {
      result = await buildReport(baseOptions());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/package\.json/);
      return;
    }
    const report = JSON.parse(
      await readFile(
        path.join(result.outDir, "data", "report.json"),
        "utf8",
      ),
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
      await readFile(
        path.join(result.outDir, "data", "report.json"),
        "utf8",
      ),
    );
    expect(report.projectName).toBe(path.basename(workspace));
  });

  it("emits a 'unknown diagnostic parser' warning into the report when the parser is unknown", async () => {
    const diagFile = path.join(workspace, "diag.txt");
    await writeFile(diagFile, "anything", "utf8");
    const result = await buildReport(
      baseOptions({
        diagnostics: [{ parser: "not-a-real-parser", path: diagFile }],
      }),
    );
    const report = JSON.parse(
      await readFile(
        path.join(result.outDir, "data", "report.json"),
        "utf8",
      ),
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

  it("inlines stylesheets and scripts in standalone mode without breaking the script tag", async () => {
    const result = await buildReport(
      baseOptions({ mode: "standalone" as const }),
    );
    const indexHtml = await readFile(
      path.join(result.outDir, "index.html"),
      "utf8",
    );
    // The original external <link rel=stylesheet> and <script src=...> must
    // have been replaced by inline tags.
    expect(indexHtml).not.toMatch(/<link[^>]*rel="stylesheet"/);
    expect(indexHtml).not.toMatch(/<script[^>]+type="module"[^>]+src=/);
    expect(indexHtml).toContain("<style>");
    expect(indexHtml).toContain('<script type="module">');
    expect(indexHtml).toContain('id="doublcov-report-data"');
  });

  it("escapes inline </style> and </script> sequences within inlined assets", async () => {
    const result = await buildReport(
      baseOptions({ mode: "standalone" as const }),
    );
    const indexHtml = await readFile(
      path.join(result.outDir, "index.html"),
      "utf8",
    );
    // Append a synthetic asset with </style> in its content into the inlined
    // HTML to verify our escaping helper survives those sequences. Easier:
    // assert the helper output never produces a literal </style> or </script>
    // outside of the closing <style>/<script> we emit ourselves.
    const closingStyle = (indexHtml.match(/<\/style>/g) ?? []).length;
    const openingStyle = (indexHtml.match(/<style>/g) ?? []).length;
    expect(closingStyle).toBe(openingStyle);
    // No premature closure of the inlined module script.
    const scriptOpens = (indexHtml.match(/<script\b[^>]*>/g) ?? []).length;
    const scriptCloses = (indexHtml.match(/<\/script>/g) ?? []).length;
    expect(scriptOpens).toBe(scriptCloses);
  });

});

describe("escapeHtmlRawText", () => {
  it("neutralizes a stray </style> in inlined CSS", () => {
    const escaped = escapeHtmlRawText(".x{}/*</style><script>alert(1)*/", "style");
    expect(escaped).not.toMatch(/<\/style/i);
    expect(escaped).toContain("<\\/style");
  });

  it("neutralizes a stray </script> in inlined JS, including weird casing", () => {
    const escaped = escapeHtmlRawText(
      'const s = "</ScRiPt>"; const t = "</script>";',
      "script",
    );
    expect(escaped).not.toMatch(/<\/script/i);
  });

  it("does not touch the other element name", () => {
    expect(escapeHtmlRawText("</style>", "script")).toBe("</style>");
  });
});
