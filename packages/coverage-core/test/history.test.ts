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
});
