import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { parseReportPayload, parseSourcePayload } from "../src/reportPayload";

const fuzzRuns = Number(process.env.DOUBLCOV_FUZZ_RUNS ?? 500);
const fuzzTimeoutMs = Math.max(5_000, fuzzRuns * 2);
const safeSourceDataPath = /^data\/files\/[A-Za-z0-9._-]+\.json$/;

const totalsArbitrary = fc.record({
  found: fc.integer({ min: -10, max: 10_000 }),
  hit: fc.integer({ min: -10, max: 10_000 }),
  percent: fc.double({ min: -1_000, max: 1_000, noNaN: true }),
});

const fileArbitrary = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 48 }),
    fc.string({ minLength: 1, maxLength: 160 }),
    fc.string({ minLength: 1, maxLength: 160 }),
    fc.string({ maxLength: 24 }),
    fc.string({ maxLength: 160 }),
    fc.string({ maxLength: 120 }),
  )
  .map(([id, filePath, displayPath, language, searchText, sourceDataPath]) => ({
    id,
    path: filePath,
    displayPath,
    language,
    lineCount: 3,
    lines: [
      { line: 1, hits: 1, status: "covered", branches: [] },
      { line: 2, hits: 0, status: "uncovered", branches: [] },
      { line: 3, hits: 0, status: "invalid-status", branches: [] },
    ],
    functions: [{ name: "fn", line: 2, hits: 0 }],
    totals: {
      lines: { found: 3, hit: 1, percent: 33.333 },
      functions: { found: 1, hit: 0, percent: 0 },
      branches: { found: 0, hit: 0, percent: 100 },
    },
    uncovered: {
      lines: [2, -1, 0, 1.5],
      functions: [{ name: "fn", line: 2, hits: 0 }],
      branches: [{ id: "b", line: 2, block: "0", branch: "0", taken: 0 }],
    },
    ignored: { lines: [], byReason: {}, assemblyLines: [] },
    searchText,
    sourceDataPath,
  }));

describe("web payload fuzz properties", () => {
  it(
    "parseReportPayload rejects arbitrary non-reports with controlled errors",
    () => {
      fc.assert(
        fc.property(fc.jsonValue({ maxDepth: 5 }), (value) => {
          try {
            parseReportPayload(value);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
          }
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "parseReportPayload sanitizes report-shaped payloads before rendering",
    () => {
      fc.assert(
        fc.property(
          fc.array(fileArbitrary, { minLength: 1, maxLength: 12 }),
          totalsArbitrary,
          fc.string({ maxLength: 160 }),
          (files, totals, projectName) => {
            const report = parseReportPayload({
              generatedAt: "2026-04-25T00:00:00.000Z",
              projectName,
              totals: {
                lines: totals,
                functions: totals,
                branches: totals,
              },
              files,
              uncoveredItems: [
                {
                  id: "external-file",
                  kind: "line",
                  fileId: "not-present",
                  filePath: "missing.ts",
                  line: 1,
                  label: "Line 1",
                  detail: "missing file should be dropped",
                },
                {
                  id: "first-file",
                  kind: "function",
                  fileId: files[0]?.id,
                  filePath: files[0]?.displayPath,
                  line: 2,
                  label: "fn",
                  detail: "kept",
                },
              ],
              ignored: {},
              diagnostics: [],
              history: { schemaVersion: 1, runs: [] },
            });

            expect(report.files.length).toBeGreaterThan(0);
            const fileIds = new Set(report.files.map((file) => file.id));
            for (const file of report.files) {
              expect(file.sourceDataPath).toMatch(safeSourceDataPath);
              expect(file.searchText).toBe(file.searchText.toLowerCase());
              expect(file.totals.lines.percent).toBeGreaterThanOrEqual(0);
              expect(file.totals.lines.percent).toBeLessThanOrEqual(100);
              expect(file.uncovered.lines).toEqual([2]);
              for (const line of file.lines) {
                expect(Number.isInteger(line.line)).toBe(true);
                expect(line.line).toBeGreaterThanOrEqual(1);
              }
            }
            for (const item of report.uncoveredItems) {
              expect(fileIds.has(item.fileId)).toBe(true);
              expect(["line", "function", "branch"]).toContain(item.kind);
              expect(Number.isInteger(item.line)).toBe(true);
              expect(item.line).toBeGreaterThanOrEqual(1);
            }
          },
        ),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "parseSourcePayload only accepts source line arrays of strings",
    () => {
      fc.assert(
        fc.property(fc.jsonValue({ maxDepth: 4 }), (value) => {
          try {
            const payload = parseSourcePayload(value, "src/input.ts");
            expect(Array.isArray(payload.lines)).toBe(true);
            expect(
              payload.lines.every((line) => typeof line === "string"),
            ).toBe(true);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
          }
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );
});
