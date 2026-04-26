import { describe, expect, it } from "vitest";
import { parseReportPayload } from "../src/reportPayload";
import { baseFile, baseReport } from "./reportPayloadTestHelpers";

describe("parseReportPayload file sanitization", () => {
  it("lowercases the per-file searchText so case-folded UI search stays consistent", () => {
    const report = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          path: "Src/Foo.ts",
          searchText: "Src/Foo.ts\nSomeFunction",
        },
      ],
    });
    expect(report.files[0]?.searchText).toBe("src/foo.ts\nsomefunction");
  });

  it("falls back to a lowercased path when searchText is missing or wrong-typed", () => {
    const report = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          path: "Src/Foo.ts",
          searchText: 42,
        },
      ],
    });
    expect(report.files[0]?.searchText).toBe("src/foo.ts");
  });

  it("keeps source payload fetches inside the generated data/files directory", () => {
    const report = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          sourceDataPath: "https://example.test/exfiltrate.json",
        },
      ],
    });

    expect(report.files[0]?.sourceDataPath).toBe(
      "data/files/0001-src-index-ts.json",
    );
  });

  it("drops duplicate file ids so app caches and keyed rows stay stable", () => {
    const report = parseReportPayload({
      ...baseReport(),
      files: [
        baseFile(),
        {
          ...baseFile(),
          path: "src/duplicate.ts",
          displayPath: "src/duplicate.ts",
        },
      ],
      uncoveredItems: [
        {
          id: "u1",
          kind: "line",
          fileId: "0001-src-index-ts",
          filePath: "src/index.ts",
          line: 1,
          label: "Line 1",
          detail: "line",
        },
      ],
    });

    expect(report.files.map((file) => file.path)).toEqual(["src/index.ts"]);
    expect(report.uncoveredItems).toHaveLength(1);
  });

  it("drops files lacking required string fields", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        baseFile(),
        { ...baseFile(), id: 5 },
        { ...baseFile(), language: undefined },
        null,
        "not-an-object",
      ],
    });
    expect(r.files).toHaveLength(1);
  });

  it("normalizes negative/non-finite hits and lineCount to 0", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          lineCount: -10,
          lines: [
            { line: 1, hits: -5, branches: [], status: "covered" },
            { line: 2, hits: Infinity, branches: [], status: "ignored" },
          ],
        },
      ],
    });
    expect(r.files[0]?.lineCount).toBe(0);
    expect(r.files[0]?.lines[0]?.hits).toBe(0);
    expect(r.files[0]?.lines[1]?.hits).toBe(0);
  });

  it("rejects line entries that are not records", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          lines: [
            null,
            "x",
            5,
            { line: 7, hits: 1, branches: [], status: "covered" },
          ],
        },
      ],
    });
    expect(r.files[0]?.lines).toHaveLength(1);
    expect(r.files[0]?.lines[0]?.line).toBe(7);
  });

  it("falls back line numbers to 1 for non-positive-integer values", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          lines: [
            { line: "abc", hits: 1, branches: [], status: "covered" },
            { line: 0, hits: 1, branches: [], status: "covered" },
            { line: 2.5, hits: 1, branches: [], status: "covered" },
          ],
        },
      ],
    });
    for (const line of r.files[0]?.lines ?? []) expect(line.line).toBe(1);
  });

  it("falls back to 'neutral' status for unknown coverage status strings", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          lines: [
            { line: 1, hits: 1, branches: [], status: "weird" },
            { line: 2, hits: 1, branches: [], status: 42 },
          ],
        },
      ],
    });
    expect(r.files[0]?.lines[0]?.status).toBe("neutral");
    expect(r.files[0]?.lines[1]?.status).toBe("neutral");
  });
});

describe("parseReportPayload file uncovered and ignored sanitization", () => {
  it("drops invalid line numbers from uncovered.lines", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          uncovered: {
            lines: [0, -1, 2.5, 5, "abc"],
            functions: [],
            branches: [],
          },
        },
      ],
    });
    expect(r.files[0]?.uncovered.lines).toEqual([5]);
  });

  it("returns empty file-uncovered when input is not a record", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [{ ...baseFile(), uncovered: "garbage" }],
    });
    expect(r.files[0]?.uncovered).toEqual({
      lines: [],
      functions: [],
      branches: [],
    });
  });

  it("returns default file-ignored when input is not a record", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [{ ...baseFile(), ignored: 5 }],
    });
    expect(r.files[0]?.ignored).toEqual({
      lines: [],
      byReason: {},
      assemblyLines: [],
    });
  });

  it("drops ignored line entries missing reason or label", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          ignored: {
            lines: [
              { line: 1, reason: "x" },
              { line: 1, label: "y" },
              { line: 1, reason: "x", label: "y" },
            ],
            byReason: {},
            assemblyLines: [],
          },
        },
      ],
    });
    expect(r.files[0]?.ignored.lines).toHaveLength(1);
  });
});
