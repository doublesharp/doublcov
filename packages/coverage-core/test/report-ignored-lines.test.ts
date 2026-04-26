import { afterEach, describe, expect, it } from "vitest";
import {
  LANGUAGE_DEFINITIONS,
  buildCoverageBundle,
  registerLanguageDefinition,
} from "../src/index.js";

const languageBaseline = LANGUAGE_DEFINITIONS.slice();

afterEach(() => {
  LANGUAGE_DEFINITIONS.splice(
    0,
    LANGUAGE_DEFINITIONS.length,
    ...languageBaseline,
  );
});

describe("buildCoverageBundle ignored-line interactions", () => {
  it("excludes inline assembly blocks from adjusted line coverage", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/Asm.sol
DA:1,1
DA:2,1
DA:3,0
DA:4,0
DA:5,0
DA:6,1
end_of_record`,
      sourceFiles: [
        {
          path: "src/Asm.sol",
          content: [
            "contract Asm {",
            "function key() external returns (bytes32 result) {",
            "assembly {",
            "mstore(0x00, caller())",
            "result := keccak256(0x00, 0x20)",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(bundle.report.totals.lines).toMatchObject({
      found: 2,
      hit: 2,
      percent: 100,
    });
    expect(bundle.report.uncoveredItems).toHaveLength(0);
    expect(bundle.report.ignored.assemblyLines).toBe(4);
    expect(bundle.report.ignored.lines).toBe(4);
    expect(bundle.report.ignored.byReason["solidity-assembly"]).toBe(4);
    expect(bundle.report.files[0]?.ignored.byReason["solidity-assembly"]).toBe(
      4,
    );
    expect(
      bundle.report.files[0]?.lines
        .filter((line) => line.status === "ignored")
        .map((line) => line.line),
    ).toEqual([3, 4, 5, 6]);
  });

  it("excludes functions and branches that land on ignored lines", () => {
    registerLanguageDefinition({
      id: "ignored-flow",
      label: "Ignored Flow",
      extensions: [".ignored-flow"],
      detectIgnoredLines: () => [
        { line: 2, reason: "generated", label: "Generated" },
      ],
    });

    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/generated.ignored-flow
FN:2,generated
FNDA:0,generated
DA:1,1
DA:2,0
BRDA:2,0,0,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/generated.ignored-flow",
          content: "real();\ngenerated();\n",
        },
      ],
    });

    expect(bundle.report.totals.lines).toMatchObject({
      found: 1,
      hit: 1,
      percent: 100,
    });
    expect(bundle.report.totals.functions).toMatchObject({
      found: 0,
      hit: 0,
      percent: 100,
    });
    expect(bundle.report.totals.branches).toMatchObject({
      found: 0,
      hit: 0,
      percent: 100,
    });
    expect(bundle.report.files[0]?.functions).toEqual([]);
    expect(bundle.report.files[0]?.lines).toEqual([
      expect.objectContaining({
        line: 1,
        hits: 1,
        branches: [],
        status: "covered",
      }),
      expect.objectContaining({
        line: 2,
        hits: 0,
        branches: [],
        status: "ignored",
      }),
    ]);
    expect(bundle.report.files[0]?.uncovered).toEqual({
      lines: [],
      functions: [],
      branches: [],
    });
    expect(bundle.report.files[0]?.ignored.lines).toEqual([
      { line: 2, reason: "generated", label: "Generated" },
    ]);
    expect(bundle.report.uncoveredItems).toHaveLength(0);
  });

  it("emits no uncovered items when every line is ignored", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/AllAsm.sol
DA:1,0
DA:2,0
DA:3,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/AllAsm.sol",
          content: "assembly {\n  let x := 1\n}\n",
        },
      ],
    });

    expect(bundle.report.uncoveredItems).toHaveLength(0);
    expect(bundle.report.totals.lines.found).toBe(0);
  });

  it("marks lines with partially taken branches as partial", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/partial.ts
DA:1,3
BRDA:1,0,0,3
BRDA:1,0,1,0
end_of_record`,
      sourceFiles: [{ path: "src/partial.ts", content: "if (x) y();\n" }],
    });

    expect(bundle.report.files[0]?.lines[0]?.status).toBe("partial");
  });

  it("keeps covered line entries sorted and classifies uncovered lines exactly", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/order.ts
DA:3,0
DA:1,2
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/order.ts",
          content: "first();\nsecond();\nthird();\n",
        },
      ],
    });

    expect(
      bundle.report.files[0]?.lines.map(({ line, hits, status }) => ({
        line,
        hits,
        status,
      })),
    ).toEqual([
      { line: 1, hits: 2, status: "covered" },
      { line: 2, hits: 0, status: "uncovered" },
      { line: 3, hits: 0, status: "uncovered" },
    ]);
    expect(bundle.report.files[0]?.uncovered.lines).toEqual([2, 3]);
    expect(bundle.report.uncoveredItems).toEqual([
      expect.objectContaining({
        id: "line:0001-src-order-ts:2",
        kind: "line",
        filePath: "src/order.ts",
        line: 2,
        label: "Line 2",
        detail: "Line was not executed",
      }),
      expect.objectContaining({
        id: "line:0001-src-order-ts:3",
        kind: "line",
        filePath: "src/order.ts",
        line: 3,
        label: "Line 3",
        detail: "Line was not executed",
      }),
    ]);
  });
});
