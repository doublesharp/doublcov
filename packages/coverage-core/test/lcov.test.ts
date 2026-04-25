import { describe, expect, it } from "vitest";
import {
  buildCoverageBundle,
  parseFoundryDebugReport,
  parseLcov,
  registerDiagnosticParser,
  registerLanguageDefinition,
} from "../src/index.js";

const lcov = `TN:
SF:src/Counter.sol
FN:6,setNumber
FN:14,increment
FNDA:1,setNumber
FNDA:0,increment
DA:6,1
DA:7,1
DA:10,0
DA:14,0
BRDA:7,0,0,1
BRDA:7,0,1,0
end_of_record`;

describe("parseLcov", () => {
  it("parses line, function, and branch coverage", () => {
    const [record] = parseLcov(lcov);

    expect(record?.sourceFile).toBe("src/Counter.sol");
    expect(record?.totals.lines).toMatchObject({
      found: 4,
      hit: 2,
      percent: 50,
    });
    expect(record?.totals.functions).toMatchObject({
      found: 2,
      hit: 1,
      percent: 50,
    });
    expect(record?.totals.branches).toMatchObject({
      found: 2,
      hit: 1,
      percent: 50,
    });
  });

  it("treats BRDA records with the '-' sentinel as not taken", () => {
    const [record] = parseLcov(`TN:
SF:src/Foo.sol
DA:1,1
BRDA:1,0,0,-
end_of_record`);

    expect(record?.branches).toHaveLength(1);
    expect(record?.branches[0]).toMatchObject({ line: 1, taken: null });
  });

  it("drops BRDA records whose taken value is not numeric", () => {
    const [record] = parseLcov(`TN:
SF:src/Foo.sol
DA:1,1
BRDA:1,0,0,abc
BRDA:1,0,1,4
end_of_record`);

    expect(record?.branches).toHaveLength(1);
    expect(record?.branches[0]).toMatchObject({ line: 1, taken: 4 });
    expect(record?.branches[0]?.taken).not.toBeNaN();
  });

  it("attaches FNDA hits to the matching FN even when FNDA appears first", () => {
    const [record] = parseLcov(`TN:
SF:src/Foo.sol
FNDA:3,doStuff
DA:10,3
FN:10,doStuff
end_of_record`);

    expect(record?.functions).toHaveLength(1);
    expect(record?.functions[0]).toMatchObject({
      name: "doStuff",
      line: 10,
      hits: 3,
    });
    expect(record?.totals.functions).toMatchObject({ found: 1, hit: 1 });
  });

  it("materializes orphan FNDA records when no FN follows", () => {
    const [record] = parseLcov(`TN:
SF:src/Foo.sol
FNDA:0,orphan
end_of_record`);

    expect(record?.functions).toHaveLength(1);
    expect(record?.functions[0]).toMatchObject({
      name: "orphan",
      line: 1,
      hits: 0,
    });
  });

  it("keeps malformed LCOV-like fuzz input bounded and finite", () => {
    let seed = 0xdecafbad;
    for (let caseIndex = 0; caseIndex < 200; caseIndex += 1) {
      const input = makeFuzzLcovInput(() => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      });

      const records = parseLcov(input);
      for (const record of records) {
        expect(record.sourceFile).toBeTruthy();
        expect(Number.isFinite(record.totals.lines.percent)).toBe(true);
        expect(Number.isFinite(record.totals.functions.percent)).toBe(true);
        expect(Number.isFinite(record.totals.branches.percent)).toBe(true);
        for (const [line, hits] of record.lines) {
          expect(Number.isFinite(line)).toBe(true);
          expect(Number.isFinite(hits)).toBe(true);
        }
        for (const branch of record.branches) {
          expect(Number.isFinite(branch.line)).toBe(true);
          expect(branch.taken === null || Number.isFinite(branch.taken)).toBe(
            true,
          );
        }
      }
    }
  });
});

function makeFuzzLcovInput(next: () => number): string {
  const chunks = ["TN:", `SF:src/fuzz-${Math.floor(next() * 20)}.ts`];
  const keys = ["DA", "FN", "FNDA", "BRDA", "LH", "random", "", "SF"];
  for (let index = 0; index < 80; index += 1) {
    const key = keys[Math.floor(next() * keys.length)] ?? "DA";
    const line = Math.floor(next() * 50) - 5;
    const hits = Math.floor(next() * 20) - 3;
    const name = `fn_${Math.floor(next() * 8)}`;
    if (key === "DA") chunks.push(`DA:${line},${hits}`);
    else if (key === "FN") chunks.push(`FN:${line},${name}`);
    else if (key === "FNDA") chunks.push(`FNDA:${hits},${name}`);
    else if (key === "BRDA")
      chunks.push(
        `BRDA:${line},${Math.floor(next() * 4)},${Math.floor(next() * 4)},${next() > 0.2 ? hits : "-"}`,
      );
    else if (key === "SF")
      chunks.push(`SF:src/fuzz-${Math.floor(next() * 20)}.ts`);
    else chunks.push(`${key}:${name},${line},${hits}`);
  }
  chunks.push("end_of_record");
  return chunks.join("\n");
}

describe("buildCoverageBundle", () => {
  it("creates uncovered navigation items and history", () => {
    const bundle = buildCoverageBundle({
      lcov,
      sourceFiles: [
        {
          path: "src/Counter.sol",
          content: "contract Counter {\nfunction setNumber() public {}\n}",
        },
      ],
      diagnostics: [
        { parser: "foundry-debug", content: "src/Counter.sol:10: uncovered" },
      ],
      history: { runs: [] },
      projectName: "Counter Suite",
      commit: "abc123",
    });

    expect(bundle.report.projectName).toBe("Counter Suite");
    expect(bundle.report.files).toHaveLength(1);
    expect(bundle.report.uncoveredItems.map((item) => item.kind)).toContain(
      "line",
    );
    expect(bundle.report.uncoveredItems.map((item) => item.kind)).toContain(
      "function",
    );
    expect(bundle.report.uncoveredItems.map((item) => item.kind)).toContain(
      "branch",
    );
    expect(bundle.report.history.runs).toHaveLength(1);
    expect(bundle.report.diagnostics[0]).toMatchObject({
      source: "foundry-debug",
      filePath: "src/Counter.sol",
      line: 10,
    });
  });

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

  it("builds language-aware reports from generic LCOV", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/math.ts
FN:1,add
FNDA:0,add
DA:1,0
DA:2,0
end_of_record
TN:
SF:src/native.cpp
FN:3,main
FNDA:1,main
DA:3,1
DA:4,0
end_of_record
TN:
SF:src/tool.py
DA:1,1
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/math.ts",
          content:
            "export function add(a: number, b: number) {\n  return a + b;\n}",
        },
        {
          path: "src/native.cpp",
          content: "#include <iostream>\n\nint main() {\n  return 0;\n}",
        },
        { path: "src/tool.py", content: "def run():\n    return False\n" },
      ],
      history: { runs: [] },
    });

    expect(bundle.report.files.map((file) => file.language)).toEqual([
      "typescript",
      "cpp",
      "python",
    ]);
    expect(bundle.report.totals.lines).toMatchObject({ found: 6, hit: 2 });
    expect(bundle.report.ignored.lines).toBe(0);
    expect(bundle.report.uncoveredItems.map((item) => item.filePath)).toEqual(
      expect.arrayContaining(["src/math.ts", "src/native.cpp", "src/tool.py"]),
    );
    expect(bundle.sourcePayloads.map((payload) => payload.language)).toEqual([
      "typescript",
      "cpp",
      "python",
    ]);
  });

  it("supports registered language and diagnostic extensions", () => {
    registerLanguageDefinition({
      id: "example-lang",
      label: "Example Language",
      extensions: [".example"],
      detectIgnoredLines: () => [
        {
          line: 2,
          reason: "example-generated",
          label: "Generated example line",
        },
      ],
    });
    registerDiagnosticParser({
      id: "example-diagnostics",
      label: "Example diagnostics",
      parse: (content) =>
        content
          .split(/\r?\n/)
          .filter(Boolean)
          .map((message, index) => ({
            id: `example-${index + 1}`,
            source: "example-diagnostics",
            severity: "info",
            message,
          })),
    });

    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/generated.example
DA:1,1
DA:2,0
end_of_record`,
      sourceFiles: [
        { path: "src/generated.example", content: "real();\ngenerated();\n" },
      ],
      diagnostics: [
        { parser: "example-diagnostics", content: "custom analyzer note" },
      ],
    });

    expect(bundle.report.files[0]?.language).toBe("example-lang");
    expect(bundle.report.ignored.byReason["example-generated"]).toBe(1);
    expect(bundle.report.totals.lines).toMatchObject({
      found: 1,
      hit: 1,
      percent: 100,
    });
    expect(bundle.report.diagnostics[0]).toMatchObject({
      source: "example-diagnostics",
      message: "custom analyzer note",
    });
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
    expect(bundle.report.uncoveredItems).toHaveLength(0);
  });

  it("merges duplicate LCOV records for the same source path", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/merge.ts
FN:1,work
FNDA:0,work
DA:1,0
BRDA:1,0,0,0
end_of_record
TN:
SF:src/merge.ts
FN:1,work
FNDA:1,work
DA:1,1
BRDA:1,0,0,1
end_of_record`,
      sourceFiles: [{ path: "src/merge.ts", content: "work();\n" }],
    });

    expect(bundle.report.files).toHaveLength(1);
    expect(bundle.report.totals.lines).toMatchObject({
      found: 1,
      hit: 1,
      percent: 100,
    });
    expect(bundle.report.totals.functions).toMatchObject({
      found: 1,
      hit: 1,
      percent: 100,
    });
    expect(bundle.report.totals.branches).toMatchObject({
      found: 1,
      hit: 1,
      percent: 100,
    });
  });

  it("emits a doublcov diagnostic when a source file cannot be matched to LCOV", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/Missing.sol
DA:1,1
end_of_record`,
      sourceFiles: [],
    });

    expect(bundle.report.diagnostics).toContainEqual(
      expect.objectContaining({
        source: "doublcov",
        severity: "warning",
        filePath: "src/Missing.sol",
      }),
    );
  });

  it("does not emit a missing-source diagnostic when the source is matched", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/Found.sol
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "src/Found.sol", content: "x" }],
    });

    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) =>
          diagnostic.source === "doublcov" &&
          diagnostic.filePath === "src/Found.sol",
      ),
    ).toHaveLength(0);
  });

  it("stores LCOV paths inside the project root as repo-relative paths", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:/home/runner/work/abi-typegen/abi-typegen/crates/abi/src/lib.rs
FN:2,parse
FNDA:0,parse
DA:1,1
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "crates/abi/src/lib.rs",
          content: "pub fn parse() {\n    todo!()\n}\n",
        },
      ],
      projectRoot: "/home/runner/work/abi-typegen/abi-typegen",
    });

    expect(bundle.report.files[0]).toMatchObject({
      path: "crates/abi/src/lib.rs",
      sourceDataPath: "data/files/0001-crates-abi-src-lib-rs.json",
    });
    expect(bundle.sourcePayloads[0]).toMatchObject({
      path: "crates/abi/src/lib.rs",
    });
    expect(bundle.report.uncoveredItems[0]).toMatchObject({
      filePath: "crates/abi/src/lib.rs",
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });

  it("carries report customization metadata through the generic bundle", () => {
    const bundle = buildCoverageBundle({
      lcov,
      sourceFiles: [
        { path: "src/Counter.sol", content: "contract Counter {}" },
      ],
      customization: {
        defaultTheme: "contrast",
        themes: [
          {
            id: "contrast",
            label: "Contrast",
            mode: "dark",
            tokens: {
              bg: "#050505",
              text: "#ffffff",
              accent: "#facc15",
            },
          },
        ],
        plugins: [
          {
            id: "ci",
            label: "CI",
            hooks: [
              {
                id: "run-link",
                hook: "report:header",
                label: "CI run",
                href: "https://example.test/runs/1",
              },
            ],
          },
        ],
      },
    });

    expect(bundle.report.customization?.defaultTheme).toBe("contrast");
    expect(bundle.report.customization?.themes?.[0]).toMatchObject({
      id: "contrast",
      mode: "dark",
    });
    expect(bundle.report.customization?.plugins?.[0]?.hooks?.[0]).toMatchObject(
      {
        hook: "report:header",
        label: "CI run",
      },
    );
  });
});

describe("parseFoundryDebugReport", () => {
  it("extracts file and line locations", () => {
    expect(
      parseFoundryDebugReport("src/Foo.sol:42: missed path")[0],
    ).toMatchObject({
      source: "foundry-debug",
      filePath: "src/Foo.sol",
      line: 42,
    });
  });
});
