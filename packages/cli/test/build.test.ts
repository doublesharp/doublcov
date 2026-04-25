import { describe, expect, it } from "vitest";
import type { CoverageReport } from "@0xdoublesharp/doublcov-core";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  escapeJsonForHtml,
  formatGeneratedReportMessage,
  isCiEnvironment,
  readReportConfig,
  replaceLiteralOnce,
  resolveBuildOptions,
  resolveAutoOpen,
  sanitizeCustomization,
  sanitizeHistory,
} from "../src/build.js";

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
});
