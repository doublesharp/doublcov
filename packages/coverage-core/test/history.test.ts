import { describe, expect, it } from "vitest";
import { appendHistoryRun, HISTORY_SCHEMA_VERSION } from "../src/history.js";
import type { CoverageReport } from "../src/types.js";

const baseReport: Pick<CoverageReport, "generatedAt" | "totals" | "files"> = {
  generatedAt: "2026-04-24T00:00:00.000Z",
  totals: {
    lines: { found: 1, hit: 1, percent: 100 },
    functions: { found: 0, hit: 0, percent: 0 },
    branches: { found: 0, hit: 0, percent: 0 },
  },
  files: [],
};

describe("appendHistoryRun", () => {
  it("stamps the current schema version on a brand new history", () => {
    const result = appendHistoryRun(undefined, baseReport);
    expect(result.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    expect(result.runs).toHaveLength(1);
  });

  it("migrates a legacy history (no schemaVersion) to the current version", () => {
    const legacy = { runs: [] };
    const result = appendHistoryRun(legacy, baseReport);
    expect(result.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    expect(result.runs).toHaveLength(1);
  });

  it("preserves existing runs when appending", () => {
    const existing = appendHistoryRun(undefined, baseReport);
    const next = appendHistoryRun(existing, {
      ...baseReport,
      generatedAt: "2026-04-25T00:00:00.000Z",
    });
    expect(next.runs).toHaveLength(2);
    expect(next.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
  });

  it("dedupes runs with the same id (commit + timestamp)", () => {
    const first = appendHistoryRun(undefined, baseReport, {
      commit: "abc123def456",
    });
    const second = appendHistoryRun(first, baseReport, {
      commit: "abc123def456",
    });
    expect(second.runs).toHaveLength(1);
  });

  it("uses the short commit and timestamp for the run id while preserving metadata", () => {
    const result = appendHistoryRun(undefined, baseReport, {
      commit: "abc123def4567890",
      branch: "main",
    });
    expect(result.runs[0]).toMatchObject({
      id: "abc123def456-2026-04-24T00:00:00.000Z",
      timestamp: "2026-04-24T00:00:00.000Z",
      commit: "abc123def4567890",
      branch: "main",
    });
  });

  it("records per-file totals and uncovered counts", () => {
    const result = appendHistoryRun(undefined, {
      ...baseReport,
      files: [
        {
          id: "src/foo.ts",
          path: "src/foo.ts",
          language: "typescript",
          totals: {
            lines: { found: 5, hit: 3, percent: 60 },
            functions: { found: 2, hit: 1, percent: 50 },
            branches: { found: 4, hit: 1, percent: 25 },
          },
          uncovered: {
            lines: [1, 5],
            functions: [{ name: "miss", line: 3, hits: 0 }],
            branches: [
              { id: "b0", line: 4, block: "0", branch: "0", taken: 0 },
              { id: "b1", line: 5, block: "0", branch: "1", taken: null },
            ],
          },
          ignoredLines: [],
          diagnostics: [],
        },
      ],
    });

    expect(result.runs[0]?.files).toEqual([
      {
        path: "src/foo.ts",
        lines: { found: 5, hit: 3, percent: 60 },
        functions: { found: 2, hit: 1, percent: 50 },
        branches: { found: 4, hit: 1, percent: 25 },
        uncovered: { lines: 2, functions: 1, branches: 2 },
      },
    ]);
  });

  it("keeps only the latest 100 runs", () => {
    const history = {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      runs: Array.from({ length: 100 }, (_, index) => ({
        id: `old-${index}`,
        timestamp: `2026-01-${String(index + 1).padStart(2, "0")}`,
        totals: baseReport.totals,
        files: [],
      })),
    };
    const result = appendHistoryRun(history, baseReport);
    expect(result.runs).toHaveLength(100);
    expect(result.runs[0]?.id).toBe("old-1");
    expect(result.runs.at(-1)?.id).toBe("run-2026-04-24T00:00:00.000Z");
  });
});
