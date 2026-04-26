import { describe, expect, it } from "vitest";
import { parseReportPayload, parseSourcePayload } from "../src/reportPayload";
import { baseReport } from "./reportPayloadTestHelpers";

describe("parseReportPayload top-level sanitization", () => {
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
    expect(r.totals.branches.percent).toBe(0);
  });

  it("falls back to defaults when totals is not a record", () => {
    const r = parseReportPayload({ ...baseReport(), totals: "garbage" });
    expect(r.totals.lines).toEqual({ found: 0, hit: 0, percent: 100 });
  });

  it("preserves number-record keys but coerces values via sanitizeNumber", () => {
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

  it("returns default report-ignored totals when input is not a record", () => {
    const r = parseReportPayload({ ...baseReport(), ignored: false });
    expect(r.ignored).toEqual({ lines: 0, byReason: {}, assemblyLines: 0 });
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

  it("rejects source payloads that do not match the selected report file", () => {
    expect(() =>
      parseSourcePayload(
        {
          id: "other",
          path: "src/other.ts",
          language: "typescript",
          lines: ["ok"],
        },
        "src/index.ts",
        { id: "file", path: "src/index.ts" },
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
    { id: 0, path: "p", language: "ts", lines: [] },
    { id: "f", path: 0, language: "ts", lines: [] },
    { id: "f", path: "p", language: 0, lines: [] },
    { id: "f", path: "p", language: "ts", lines: "not-an-array" },
  ])("throws on missing/wrong-typed required fields", (input) => {
    expect(() => parseSourcePayload(input, "ctx")).toThrow(/malformed/);
  });
});
