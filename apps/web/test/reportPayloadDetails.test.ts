import { describe, expect, it } from "vitest";
import { parseReportPayload } from "../src/reportPayload";
import { baseFile, baseReport } from "./reportPayloadTestHelpers";

describe("parseReportPayload branch detail sanitization", () => {
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
        fileWithBranch({ id: "b1", block: "0", branch: "0" }),
      ],
    });
    expect(r.files[0]?.lines[0]?.branches).toEqual([]);
  });
});

describe("parseReportPayload function detail sanitization", () => {
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

describe("parseReportPayload uncovered item sanitization", () => {
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
