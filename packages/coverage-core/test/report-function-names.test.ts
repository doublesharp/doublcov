import { describe, expect, it } from "vitest";
import { buildCoverageBundle } from "../src/report.js";

describe("buildCoverageBundle source-level function names", () => {
  it("uses readable display paths and labels for Rust mangled function symbols", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:crates/abi-typegen-codegen/src/renderers/wagmi.rs
FN:3,_RNvCsfdPHj7id2zQ_19abi_typegen_codegen9renderers5wagmi6render
FN:6,_RNCNvNtNtCsfdPHj7id2zQ_19abi_typegen_codegen9renderers5wagmi6render0
FNDA:0,_RNvCsfdPHj7id2zQ_19abi_typegen_codegen9renderers5wagmi6render
FNDA:0,_RNCNvNtNtCsfdPHj7id2zQ_19abi_typegen_codegen9renderers5wagmi6render0
DA:3,0
DA:6,0
end_of_record`,
      sourceFiles: [
        {
          path: "crates/abi-typegen-codegen/src/renderers/wagmi.rs",
          content: [
            "pub fn render() {",
            '    let fields = vec!["name"];',
            "    fields",
            "        .iter()",
            "        .map(|field| field.to_string())",
            "        .collect::<Vec<_>>();",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(bundle.report.files[0]?.displayPath).toBe("src/renderers/wagmi.rs");
    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function",
          filePath: "src/renderers/wagmi.rs",
          label: "render()",
        }),
        expect.objectContaining({
          kind: "function",
          filePath: "src/renderers/wagmi.rs",
          label: "Closure at line 6",
        }),
      ]),
    );
  });

  it("uses source-level names for C++ and Swift mangled function symbols", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/native.cpp
FN:1,_Z3foov
FNDA:0,_Z3foov
DA:1,0
end_of_record
TN:
SF:src/renderer.swift
FN:1,_$s8Renderer6renderSiyF
FNDA:0,_$s8Renderer6renderSiyF
DA:1,0
end_of_record`,
      sourceFiles: [
        { path: "src/native.cpp", content: "int foo() {\n  return 1;\n}" },
        {
          path: "src/renderer.swift",
          content: "func render() -> Int {\n  1\n}",
        },
      ],
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function",
          filePath: "src/native.cpp",
          label: "foo()",
        }),
        expect.objectContaining({
          kind: "function",
          filePath: "src/renderer.swift",
          label: "render()",
        }),
      ]),
    );
  });

  it("uses Go method receiver names for mangled symbols", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/server.go
FN:1,_ZN8receiverE
FNDA:0,_ZN8receiverE
DA:1,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/server.go",
          content: "func (r *Receiver) Method() {\n  return\n}\n",
        },
      ],
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "Method()" }),
      ]),
    );
  });

  it("parses Go init functions", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/main.go
FN:1,_Z4initv
FNDA:0,_Z4initv
DA:1,0
end_of_record`,
      sourceFiles: [{ path: "src/main.go", content: "func init() {\n}\n" }],
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "init()" }),
      ]),
    );
  });

  it("parses generic Go functions", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/generic.go
FN:1,_Z6methodv
FNDA:0,_Z6methodv
DA:1,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/generic.go",
          content: "func Method[T any](v T) T {\n  return v\n}\n",
        },
      ],
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "Method()" }),
      ]),
    );
  });

  it("parses Python async def, dunder, and decorated functions", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/svc.py
FN:1,_Z8asyncfoov
FN:5,_Z6init__v
FN:10,_Z3foo_v
FNDA:0,_Z8asyncfoov
FNDA:0,_Z6init__v
FNDA:0,_Z3foo_v
DA:1,0
DA:5,0
DA:10,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/svc.py",
          content: [
            "async def fetch_user():",
            "    return None",
            "",
            "class Foo:",
            "    def __init__(self):",
            "        pass",
            "",
            "",
            "    @property",
            "    def name(self):",
            "        return 'a'",
            "",
          ].join("\n"),
        },
      ],
    });
    const labels = bundle.report.uncoveredItems
      .filter((item) => item.kind === "function")
      .map((item) => item.label);

    expect(labels).toContain("fetch_user()");
    expect(labels).toContain("__init__()");
    expect(labels).toContain("name()");
  });

  it("does not mistake C/C++ control-flow keywords for function definitions", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/native.cpp
FN:2,_Z9branchingv
FNDA:0,_Z9branchingv
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/native.cpp",
          content: "void g();\nif (cond) {\n  g();\n}\n",
        },
      ],
    });
    const fnItem = bundle.report.uncoveredItems.find(
      (item) => item.kind === "function",
    );

    expect(fnItem?.label).not.toBe("if()");
  });

  it("finds a function name on a line below the LCOV-reported line", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/native.cpp
FN:1,_Z9forwardfn
FNDA:0,_Z9forwardfn
DA:1,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/native.cpp",
          content: "// banner comment\nint forwardFn() { return 0; }\n",
        },
      ],
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "forwardFn()" }),
      ]),
    );
  });

  it("detects rust closures on the LCOV-reported line", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/closure.rs
FN:2,_RNCNvCs1_3lib1f0
FNDA:0,_RNCNvCs1_3lib1f0
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/closure.rs",
          content: "fn outer() {\n    let f = |x| x + 1;\n    f(2);\n}\n",
        },
      ],
    });

    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function",
          label: "Closure at line 2",
        }),
      ]),
    );
  });

  it("parses complex Rust, Swift, Go, Python, and C++ declarations near mangled symbols", () => {
    const bundle = buildCoverageBundle({
      lcov: `TN:
SF:src/native.rs
FN:2,_RNvCs123_6native10run_native
FNDA:0,_RNvCs123_6native10run_native
DA:2,0
end_of_record
TN:
SF:src/View.swift
FN:1,_$s4View6renderSiyF
FNDA:0,_$s4View6renderSiyF
DA:1,0
end_of_record
TN:
SF:src/worker.go
FN:1,_Z8Registerv
FNDA:0,_Z8Registerv
DA:1,0
end_of_record
TN:
SF:src/tasks.py
FN:2,_Z8run_taskv
FNDA:0,_Z8run_taskv
DA:2,0
end_of_record
TN:
SF:src/widget.cpp
FN:2,_Z7computev
FNDA:0,_Z7computev
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/native.rs",
          content: [
            "#[no_mangle]",
            'pub(crate) async unsafe extern "C" fn run_native() {}',
            "",
          ].join("\n"),
        },
        {
          path: "src/View.swift",
          content: "public static final func renderThing() -> Int { 1 }\n",
        },
        {
          path: "src/worker.go",
          content: "func (w *Worker[T]) Register(v T) {}\n",
        },
        {
          path: "src/tasks.py",
          content: "@decorator\nasync def run_task():\n    return None\n",
        },
        {
          path: "src/widget.cpp",
          content:
            "namespace ui {\nWidget::Result Widget::compute(int value) const noexcept {\nreturn {};\n}\n}\n",
        },
      ],
    });
    const labelsByPath = new Map(
      bundle.report.uncoveredItems
        .filter((item) => item.kind === "function")
        .map((item) => [item.filePath, item.label]),
    );

    expect(labelsByPath.get("src/native.rs")).toBe("run_native()");
    expect(labelsByPath.get("src/View.swift")).toBe("renderThing()");
    expect(labelsByPath.get("src/worker.go")).toBe("Register()");
    expect(labelsByPath.get("src/tasks.py")).toBe("run_task()");
    expect(labelsByPath.get("src/widget.cpp")).toBe("compute()");
  });
});

describe("buildCoverageBundle function label fallbacks", () => {
  it("falls back to a synthetic label when no source-level name is found near a mangled symbol", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/lib.rs
FN:3,_RNvCs1234_3lib9not_there
FNDA:0,_RNvCs1234_3lib9not_there
DA:3,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/lib.rs",
          content: "// no function here\n// nothing\n// still nothing\n",
        },
      ],
    });
    const fnItem = bundle.report.uncoveredItems.find(
      (item) => item.kind === "function",
    );

    expect(fnItem?.label).toBe("Function at line 3");
  });

  it("falls back for rust mangled symbols when the FN line is past the end of the source", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/oob.rs
FN:50,_RNvCs1234_3lib9not_there
FNDA:0,_RNvCs1234_3lib9not_there
DA:50,0
end_of_record`,
      sourceFiles: [
        { path: "src/oob.rs", content: "// only two lines\n// of source\n" },
      ],
    });
    const fnItem = bundle.report.uncoveredItems.find(
      (item) => item.kind === "function",
    );

    expect(fnItem?.label).toBe("Function at line 50");
  });

  it("falls back for non-rust mangled symbols when the FN line is past the end of the source", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/oob.cpp
FN:50,_Z9branchingv
FNDA:0,_Z9branchingv
DA:50,0
end_of_record`,
      sourceFiles: [
        { path: "src/oob.cpp", content: "// only two lines\n// of source\n" },
      ],
    });
    const fnItem = bundle.report.uncoveredItems.find(
      (item) => item.kind === "function",
    );

    expect(fnItem?.label).toBe("Function at line 50");
  });
});
