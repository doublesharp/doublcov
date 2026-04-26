import { describe, expect, it } from "vitest";
import { parseReportPayload } from "../src/reportPayload";
import { baseReport } from "./reportPayloadTestHelpers";

describe("parseReportPayload diagnostic sanitization", () => {
  it("drops malformed diagnostic records (missing required fields)", () => {
    const r = parseReportPayload({
      ...baseReport(),
      diagnostics: [
        null,
        "not an object",
        { id: 5 },
        { id: "ok", source: "s", message: 0 },
      ],
    });
    expect(r.diagnostics).toHaveLength(0);
  });

  it("falls back to severity 'info' for unknown severities", () => {
    const r = parseReportPayload({
      ...baseReport(),
      diagnostics: [
        { id: "d1", source: "s", message: "m", severity: "critical" },
        { id: "d2", source: "s", message: "m" },
      ],
    });
    expect(r.diagnostics[0]?.severity).toBe("info");
    expect(r.diagnostics[1]?.severity).toBe("info");
  });

  it("only keeps optional filePath when string and line when positive int", () => {
    const r = parseReportPayload({
      ...baseReport(),
      diagnostics: [
        { id: "d1", source: "s", message: "m", filePath: 42, line: -1 },
        { id: "d2", source: "s", message: "m", filePath: "src/x.ts", line: 5 },
      ],
    });
    expect(r.diagnostics[0]).toEqual({
      id: "d1",
      source: "s",
      severity: "info",
      message: "m",
    });
    expect(r.diagnostics[1]?.filePath).toBe("src/x.ts");
    expect(r.diagnostics[1]?.line).toBe(5);
  });
});

describe("parseReportPayload history and run sanitization", () => {
  it("returns empty runs when history is missing", () => {
    const r = parseReportPayload({ ...baseReport(), history: null });
    expect(r.history.runs).toEqual([]);
  });

  it("drops runs lacking id/timestamp", () => {
    const r = parseReportPayload({
      ...baseReport(),
      history: {
        schemaVersion: 1,
        runs: [
          { id: "r1", timestamp: "2026-01-01T00:00:00.000Z" },
          { id: 42, timestamp: "x" },
          null,
        ],
      },
    });
    expect(r.history.runs).toHaveLength(1);
    expect(r.history.runs[0]?.id).toBe("r1");
  });

  it("preserves optional commit/branch on runs only when string", () => {
    const r = parseReportPayload({
      ...baseReport(),
      history: {
        schemaVersion: 1,
        runs: [
          {
            id: "r1",
            timestamp: "t",
            commit: "abc",
            branch: 5,
            files: [
              {
                path: "src/x.ts",
                lines: { found: 10, hit: 5, percent: 50 },
                functions: { found: 2, hit: 1, percent: 50 },
                branches: { found: 4, hit: 2, percent: 50 },
                uncovered: { lines: 5, functions: 1, branches: 2 },
              },
            ],
          },
        ],
      },
    });
    const run = r.history.runs[0];
    expect(run?.commit).toBe("abc");
    expect(run?.branch).toBeUndefined();
    expect(run?.files[0]?.path).toBe("src/x.ts");
  });

  it("drops run files missing path", () => {
    const r = parseReportPayload({
      ...baseReport(),
      history: {
        schemaVersion: 1,
        runs: [
          {
            id: "r1",
            timestamp: "t",
            files: [{ lines: {} }, { path: "ok" }, null],
          },
        ],
      },
    });
    expect(r.history.runs[0]?.files).toHaveLength(1);
  });

  it("treats malformed run-file totals as zero-totals", () => {
    const r = parseReportPayload({
      ...baseReport(),
      history: {
        schemaVersion: 1,
        runs: [
          {
            id: "r1",
            timestamp: "t",
            files: [
              {
                path: "src/x.ts",
                lines: "garbage",
                functions: null,
                branches: undefined,
                uncovered: "string",
              },
            ],
          },
        ],
      },
    });
    const file = r.history.runs[0]?.files[0];
    expect(file?.lines).toEqual({ found: 0, hit: 0, percent: 100 });
    expect(file?.uncovered).toEqual({ lines: 0, functions: 0, branches: 0 });
  });
});
