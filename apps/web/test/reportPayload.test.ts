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
              unknown: "#000000",
            },
          },
        ],
        hooks: [
          {
            id: "bad",
            hook: "report:header",
            label: "Bad",
            href: "javascript:alert(1)",
          },
          {
            id: "good",
            hook: "report:header",
            label: "Good",
            href: "https://example.test/report",
          },
        ],
      },
    });

    expect(report.customization?.themes?.[0]?.tokens).toEqual({
      text: "#ffffff",
    });
    expect(report.customization?.hooks?.[0]).toEqual({
      id: "bad",
      hook: "report:header",
      label: "Bad",
    });
    expect(report.customization?.hooks?.[1]?.href).toBe(
      "https://example.test/report",
    );
  });

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
});

describe("parseSourcePayload", () => {
  it("rejects malformed source payloads", () => {
    expect(() =>
      parseSourcePayload(
        {
          id: "file",
          path: "src/index.ts",
          language: "typescript",
          lines: ["ok"],
        },
        "src/index.ts",
      ),
    ).not.toThrow();
    expect(() =>
      parseSourcePayload(
        {
          id: "file",
          path: "src/index.ts",
          language: "typescript",
          lines: [42],
        },
        "src/index.ts",
      ),
    ).toThrow(/malformed/);
  });

  it.each([null, undefined, "string", 42, true, [1, 2, 3]])(
    "throws when input is not a record (%s)",
    (input) => {
      expect(() => parseSourcePayload(input, "src/x.ts")).toThrow(/malformed/);
    },
  );

  it.each([
    { id: 0, path: "p", language: "ts", lines: [] }, // numeric id
    { id: "f", path: 0, language: "ts", lines: [] }, // numeric path
    { id: "f", path: "p", language: 0, lines: [] }, // numeric language
    { id: "f", path: "p", language: "ts", lines: "not-an-array" },
  ])("throws on missing/wrong-typed required fields", (input) => {
    expect(() => parseSourcePayload(input, "ctx")).toThrow(/malformed/);
  });
});

describe("parseReportPayload — top-level edge cases", () => {
  it.each([null, undefined, "string", 42, [], { files: "not-array" }])(
    "throws when input or files is malformed (%s)",
    (input) => {
      expect(() => parseReportPayload(input)).toThrow(/malformed/);
    },
  );

  it("falls back to epoch generatedAt when missing or wrong-typed", () => {
    const reports = [
      parseReportPayload({ ...baseReport(), generatedAt: undefined }),
      parseReportPayload({ ...baseReport(), generatedAt: 123 }),
    ];
    for (const r of reports)
      expect(r.generatedAt).toBe(new Date(0).toISOString());
  });

  it("omits projectName/projectRoot when not strings", () => {
    const r = parseReportPayload({
      ...baseReport(),
      projectName: 5,
      projectRoot: { nested: true },
    });
    expect(r.projectName).toBeUndefined();
    expect(r.projectRoot).toBeUndefined();
  });

  it("omits customization when sanitizer returns undefined for non-records", () => {
    const r = parseReportPayload({ ...baseReport(), customization: "nope" });
    expect(r.customization).toBeUndefined();
  });

  it("filters uncoveredItems whose fileId does not match any file", () => {
    const r = parseReportPayload({
      ...baseReport(),
      uncoveredItems: [
        {
          id: "u1",
          kind: "line",
          fileId: "ghost",
          filePath: "ghost.ts",
          line: 1,
          label: "L",
          detail: "d",
        },
        {
          id: "u2",
          kind: "line",
          fileId: "0001-src-index-ts",
          filePath: "src/index.ts",
          line: 1,
          label: "L",
          detail: "d",
        },
      ],
    });
    expect(r.uncoveredItems.map((i) => i.id)).toEqual(["u2"]);
  });
});

describe("file-level sanitizers", () => {
  it("drops files lacking required string fields", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        baseFile(),
        { ...baseFile(), id: 5 }, // wrong-typed id
        { ...baseFile(), language: undefined }, // missing
        null,
        "not-an-object",
      ],
    });
    expect(r.files).toHaveLength(1);
  });

  it("clamps coverage percent to [0, 100]", () => {
    const r = parseReportPayload({
      ...baseReport(),
      totals: {
        lines: { found: 1, hit: 1, percent: 999 },
        functions: { found: 1, hit: 1, percent: -50 },
        branches: { found: 1, hit: 1, percent: NaN },
      },
    });
    expect(r.totals.lines.percent).toBe(100);
    expect(r.totals.functions.percent).toBe(0);
    // NaN sanitizes to 0
    expect(r.totals.branches.percent).toBe(0);
  });

  it("falls back to defaults when totals is not a record", () => {
    const r = parseReportPayload({ ...baseReport(), totals: "garbage" });
    expect(r.totals.lines).toEqual({ found: 0, hit: 0, percent: 100 });
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
            { line: 2, hits: 1, branches: [], status: 42 }, // wrong type
          ],
        },
      ],
    });
    expect(r.files[0]?.lines[0]?.status).toBe("neutral");
    expect(r.files[0]?.lines[1]?.status).toBe("neutral");
  });
});

describe("branch detail sanitization", () => {
  function fileWithBranch(branch: unknown): Record<string, unknown> {
    return {
      ...baseFile(),
      lines: [{ line: 1, hits: 1, branches: [branch], status: "partial" }],
    };
  }

  it("preserves null taken (no execution data) but converts other non-numbers to 0", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        fileWithBranch({
          id: "b1",
          line: 1,
          block: "0",
          branch: "0",
          taken: null,
        }),
      ],
    });
    expect(r.files[0]?.lines[0]?.branches[0]?.taken).toBeNull();
  });

  it("treats undefined taken as 0 (sanitizeNumber fallback)", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        fileWithBranch({
          id: "b1",
          line: 1,
          block: "0",
          branch: "0",
          taken: undefined,
        }),
      ],
    });
    expect(r.files[0]?.lines[0]?.branches[0]?.taken).toBe(0);
  });

  it("rejects negative taken counts (clamps to 0 via sanitizeNumber)", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        fileWithBranch({
          id: "b1",
          line: 1,
          block: "0",
          branch: "0",
          taken: -5,
        }),
      ],
    });
    expect(r.files[0]?.lines[0]?.branches[0]?.taken).toBe(0);
  });

  it("drops branch entries missing required fields", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        fileWithBranch(null),
        fileWithBranch({ id: "b1", block: "0", branch: "0" }), // ok
      ],
    });
    // first file: branch was null and dropped; line still there
    expect(r.files[0]?.lines[0]?.branches).toEqual([]);
  });
});

describe("function detail sanitization", () => {
  it("retains endLine only when it is a positive integer", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        {
          ...baseFile(),
          functions: [
            { name: "ok", line: 1, endLine: 5, hits: 0 },
            { name: "no-end", line: 1, endLine: -3, hits: 0 },
            { name: "frac", line: 1, endLine: 2.5, hits: 0 },
            { name: "string", line: 1, endLine: "10", hits: 0 },
          ],
        },
      ],
    });
    const fns = r.files[0]?.functions ?? [];
    expect(fns[0]?.endLine).toBe(5);
    expect(fns[1]?.endLine).toBeUndefined();
    expect(fns[2]?.endLine).toBeUndefined();
    expect(fns[3]?.endLine).toBeUndefined();
  });

  it("drops function entries missing 'name'", () => {
    const r = parseReportPayload({
      ...baseReport(),
      files: [
        { ...baseFile(), functions: [null, { line: 1, hits: 0 }, "string"] },
      ],
    });
    expect(r.files[0]?.functions).toHaveLength(0);
  });
});

describe("uncovered item sanitization", () => {
  it("rejects items with invalid kind", () => {
    const r = parseReportPayload({
      ...baseReport(),
      uncoveredItems: [
        {
          id: "x",
          kind: "evil",
          fileId: "0001-src-index-ts",
          filePath: "src/index.ts",
          line: 1,
          label: "L",
          detail: "d",
        },
      ],
    });
    expect(r.uncoveredItems).toHaveLength(0);
  });
});

describe("diagnostic rejection branch", () => {
  it("drops malformed diagnostic records (missing required fields)", () => {
    const r = parseReportPayload({
      ...baseReport(),
      diagnostics: [
        null,
        "not an object",
        { id: 5 }, // wrong type id
        { id: "ok", source: "s", message: 0 }, // wrong type message
      ],
    });
    expect(r.diagnostics).toHaveLength(0);
  });
});

describe("number-record sanitization", () => {
  it("preserves keys but coerces values via sanitizeNumber", () => {
    const r = parseReportPayload({
      ...baseReport(),
      ignored: {
        lines: 5,
        byReason: { "user-comment": 3, "string-val": "10", neg: -1 },
        assemblyLines: 0,
      },
    });
    expect(r.ignored.byReason["user-comment"]).toBe(3);
    expect(r.ignored.byReason["string-val"]).toBe(0);
    expect(r.ignored.byReason["neg"]).toBe(0);
  });
});

describe("diagnostic sanitization", () => {
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

describe("history & run sanitization", () => {
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

describe("file-uncovered & file-ignored sanitization", () => {
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

  it("returns default report-ignored totals when input is not a record", () => {
    const r = parseReportPayload({ ...baseReport(), ignored: false });
    expect(r.ignored).toEqual({ lines: 0, byReason: {}, assemblyLines: 0 });
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
    history: { schemaVersion: 1, runs: [] },
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
    sourceDataPath: "data/files/0001-src-index-ts.json",
  };
}

function baseTotals(): Record<string, unknown> {
  return {
    lines: { found: 1, hit: 1, percent: 100 },
    functions: { found: 0, hit: 0, percent: 100 },
    branches: { found: 0, hit: 0, percent: 100 },
  };
}
