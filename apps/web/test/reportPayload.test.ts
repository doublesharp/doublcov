import { describe, expect, it } from "vitest";
import { parseReportPayload, parseSourcePayload } from "../src/reportPayload";

describe("parseReportPayload", () => {
  it("sanitizes customization from fetched report JSON before rendering", () => {
    const report = parseReportPayload({
      ...baseReport(),
      customization: {
        themes: [
          {
            id: "unsafe",
            label: "Unsafe",
            tokens: {
              bg: "url(javascript:alert(1))",
              text: "#ffffff",
              unknown: "#000000"
            }
          }
        ],
        hooks: [
          {
            id: "bad",
            hook: "report:header",
            label: "Bad",
            href: "javascript:alert(1)"
          },
          {
            id: "good",
            hook: "report:header",
            label: "Good",
            href: "https://example.test/report"
          }
        ]
      }
    });

    expect(report.customization?.themes?.[0]?.tokens).toEqual({ text: "#ffffff" });
    expect(report.customization?.hooks?.[0]).toEqual({
      id: "bad",
      hook: "report:header",
      label: "Bad"
    });
    expect(report.customization?.hooks?.[1]?.href).toBe("https://example.test/report");
  });

  it("keeps source payload fetches inside the generated data/files directory", () => {
    const report = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          sourceDataPath: "https://example.test/exfiltrate.json"
        }
      ]
    });

    expect(report.files[0]?.sourceDataPath).toBe("data/files/0001-src-index-ts.json");
  });
});

describe("parseSourcePayload", () => {
  it("rejects malformed source payloads", () => {
    expect(() => parseSourcePayload({ id: "file", path: "src/index.ts", language: "typescript", lines: ["ok"] }, "src/index.ts")).not.toThrow();
    expect(() => parseSourcePayload({ id: "file", path: "src/index.ts", language: "typescript", lines: [42] }, "src/index.ts")).toThrow(
      /malformed/
    );
  });
});

function baseReport(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: "2026-04-24T00:00:00.000Z",
    totals: baseTotals(),
    files: [baseFile()],
    uncoveredItems: [],
    ignored: { lines: 0, byReason: {}, assemblyLines: 0 },
    diagnostics: [],
    history: { schemaVersion: 1, runs: [] }
  };
}

function baseFile(): Record<string, unknown> {
  return {
    id: "0001-src-index-ts",
    path: "src/index.ts",
    displayPath: "src/index.ts",
    language: "typescript",
    lineCount: 1,
    lines: [],
    functions: [],
    totals: baseTotals(),
    uncovered: { lines: [], functions: [], branches: [] },
    ignored: { lines: [], byReason: {}, assemblyLines: [] },
    searchText: "src/index.ts",
    sourceDataPath: "data/files/0001-src-index-ts.json"
  };
}

function baseTotals(): Record<string, unknown> {
  return {
    lines: { found: 1, hit: 1, percent: 100 },
    functions: { found: 0, hit: 0, percent: 100 },
    branches: { found: 0, hit: 0, percent: 100 }
  };
}
