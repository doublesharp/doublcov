import { afterEach, describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_PARSERS,
  LANGUAGE_DEFINITIONS,
  buildCoverageBundle,
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

const languageBaseline = LANGUAGE_DEFINITIONS.slice();
const diagnosticBaseline = DIAGNOSTIC_PARSERS.slice();

afterEach(() => {
  LANGUAGE_DEFINITIONS.splice(
    0,
    LANGUAGE_DEFINITIONS.length,
    ...languageBaseline,
  );
  DIAGNOSTIC_PARSERS.splice(
    0,
    DIAGNOSTIC_PARSERS.length,
    ...diagnosticBaseline,
  );
});

describe("buildCoverageBundle report integration", () => {
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
    expect(bundle.report.uncoveredItems.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["line", "function", "branch"]),
    );
    expect(bundle.report.files[0]?.searchText).toContain("increment");
    expect(bundle.report.files[0]?.searchText).toContain("contract counter");
    expect(bundle.report.files[0]?.sourceDataPath).toBe(
      "data/files/0001-src-counter-sol.json",
    );
    expect(bundle.report.history.runs).toHaveLength(1);
    expect(bundle.report.diagnostics[0]).toMatchObject({
      source: "foundry-debug",
      filePath: "src/Counter.sol",
      line: 10,
    });
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

  it("deduplicates Rust crate-disambiguator variants across LCOV records for the same file", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/lib.rs
FN:31,_RNvCs3S5nXkB8W4T_19abi_typegen_codegen23generate_contract_files
FNDA:73,_RNvCs3S5nXkB8W4T_19abi_typegen_codegen23generate_contract_files
DA:31,73
end_of_record
TN:
SF:src/lib.rs
FN:31,_RNvCsjmirnLhxYZ2_19abi_typegen_codegen23generate_contract_files
FNDA:0,_RNvCsjmirnLhxYZ2_19abi_typegen_codegen23generate_contract_files
DA:31,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/lib.rs",
          content: "pub fn generate_contract_files() {}\n",
        },
      ],
      history: { runs: [] },
    });

    expect(bundle.report.files).toHaveLength(1);
    expect(bundle.report.files[0]?.functions).toHaveLength(1);
    expect(bundle.report.files[0]?.totals.functions).toMatchObject({
      found: 1,
      hit: 1,
    });
    expect(bundle.report.files[0]?.uncovered.functions).toEqual([]);
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

  it("includes branch metadata in generated history entries", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "src/foo.ts", content: "x;\n" }],
      branch: "main",
      commit: "abc123",
    });

    expect(bundle.report.history.runs[0]).toMatchObject({
      branch: "main",
      commit: "abc123",
    });
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
    expect(bundle.report.history).toMatchObject({
      schemaVersion: 1,
      runs: [
        expect.objectContaining({
          totals: expect.objectContaining({
            lines: expect.objectContaining({ found: 4, hit: 2 }),
          }),
        }),
      ],
    });
  });
});
