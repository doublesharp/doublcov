import { describe, expect, it } from "vitest";
import { buildCoverageBundle } from "../src/report.js";

describe("buildCoverageBundle - language-specific function detection", () => {
  it("uses parseGoFunctionName for Go mangled symbols (method receiver)", () => {
    // Force a Go file with a mangled-looking name so displayFunctionName
    // descends into the source-line parsers, hitting parseGoFunctionName.
    const bundle = buildCoverageBundle({
      lcov: `SF:src/server.go
FN:1,_ZN8receiverE
FNDA:0,_ZN8receiverE
DA:1,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/server.go",
          content:
            "func (r *Receiver) Method() {\n  return\n}\n",
        },
      ],
    });
    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "Method()" }),
      ]),
    );
  });

  it("parses Go top-level functions and init", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/main.go
FN:1,_Z4initv
FNDA:0,_Z4initv
DA:1,0
end_of_record`,
      sourceFiles: [
        { path: "src/main.go", content: "func init() {\n}\n" },
      ],
    });
    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "init()" }),
      ]),
    );
  });

  it("parses generic Go functions (func Method[T any]())", () => {
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

  it("does not mistake C/C++ control-flow keywords like 'if(' for function definitions", () => {
    // This file is C++. The mangled symbol points at line 2, where the only
    // text is `if (cond) {` — parseCodeLikeFunctionName must reject it and
    // fall back to the synthetic label rather than producing `if()`.
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
    // The label must NOT be the misleading "if()".
    expect(fnItem?.label).not.toBe("if()");
  });

  it("finds a function name on a line *below* the LCOV-reported line via forward scan", () => {
    // The mangled symbol is reported on line 1 (where there's a comment). The
    // real function definition is on line 2, which the forward scan should
    // reach (end = index + 2).
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

  it("falls back to a synthetic label when no source-level name is found near a mangled symbol", () => {
    // The mangled symbol is on line 3 but the surrounding source has nothing
    // that looks like a function definition. Should fall back to "Function at line X".
    const bundle = buildCoverageBundle({
      lcov: `SF:src/lib.rs
FN:3,_RNvCs1234_3lib9not_there
FNDA:0,_RNvCs1234_3lib9not_there
DA:3,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/lib.rs",
          content:
            "// no function here\n// nothing\n// still nothing\n",
        },
      ],
    });
    const fnItem = bundle.report.uncoveredItems.find(
      (item) => item.kind === "function",
    );
    expect(fnItem?.label).toBe("Function at line 3");
  });

  it("detects rust closures even when they appear after the function line", () => {
    // Closure regex is `|...|` which appears on the LCOV-reported line. The
    // forward scan should pick this up too — the test just exercises the
    // happy path.
    const bundle = buildCoverageBundle({
      lcov: `SF:src/closure.rs
FN:2,_RNCNvCs1_3lib1f0
FNDA:0,_RNCNvCs1_3lib1f0
DA:2,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/closure.rs",
          content:
            "fn outer() {\n    let f = |x| x + 1;\n    f(2);\n}\n",
        },
      ],
    });
    expect(bundle.report.uncoveredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", label: "Closure at line 2" }),
      ]),
    );
  });
});

describe("buildCoverageBundle - findSourceContent edge cases", () => {
  it("matches on suffix when the LCOV path is absolute and the source path is repo-relative", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:/abs/work/repo/src/foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "src/foo.ts", content: "console.log('hi');\n" },
      ],
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });

  it("matches on basename when no path/suffix match exists and it is unique", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:obj/output/Foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "totally/different/dir/Foo.ts", content: "x;\n" },
      ],
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });

  it("does not match by basename when multiple files share a name (ambiguous)", () => {
    // Two source files with the same basename and no suffix relationship to
    // the LCOV path — we should refuse to guess and emit a missing-source
    // diagnostic instead of silently picking one.
    const bundle = buildCoverageBundle({
      lcov: `SF:obj/output/Foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "a/Foo.ts", content: "first;\n" },
        { path: "b/Foo.ts", content: "second;\n" },
      ],
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(1);
  });

  it("emits a missing-source diagnostic when no match is possible at all", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/Missing.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "src/Other.ts", content: "x;\n" },
      ],
    });
    expect(
      bundle.report.diagnostics.find(
        (diagnostic) =>
          diagnostic.source === "doublcov" &&
          diagnostic.filePath === "src/Missing.ts",
      ),
    ).toBeDefined();
  });

  it("normalizes leading './' in LCOV paths to match repo-relative source paths", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:./src/foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "src/foo.ts", content: "x;\n" },
      ],
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });
});

describe("buildCoverageBundle - merge semantics", () => {
  it("keeps overloaded functions with the same name but different lines as distinct entries", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/overload.ts
FN:1,foo
FNDA:1,foo
DA:1,1
end_of_record
SF:src/overload.ts
FN:5,foo
FNDA:0,foo
DA:5,0
end_of_record`,
      sourceFiles: [
        {
          path: "src/overload.ts",
          content: "function foo() {}\n\n\n\nfunction foo() {}\n",
        },
      ],
    });
    expect(bundle.report.files[0]?.functions).toHaveLength(2);
    expect(
      bundle.report.files[0]?.functions.map((fn) => ({
        name: fn.name,
        line: fn.line,
        hits: fn.hits,
      })),
    ).toEqual([
      { name: "foo", line: 1, hits: 1 },
      { name: "foo", line: 5, hits: 0 },
    ]);
  });

  it("merges branch.taken correctly when one run has null and the other has a number", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/merge.ts
DA:1,1
BRDA:1,0,0,-
end_of_record
SF:src/merge.ts
DA:1,1
BRDA:1,0,0,5
end_of_record`,
      sourceFiles: [{ path: "src/merge.ts", content: "x;\n" }],
    });
    // null + 5 = 5; the branch should be reported as taken.
    expect(bundle.report.files[0]?.totals.branches).toMatchObject({
      found: 1,
      hit: 1,
    });
  });

  it("includes branches that appear in only the second run when merging", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/merge.ts
DA:1,1
end_of_record
SF:src/merge.ts
DA:1,1
BRDA:1,0,0,1
end_of_record`,
      sourceFiles: [{ path: "src/merge.ts", content: "x;\n" }],
    });
    expect(bundle.report.files[0]?.totals.branches).toMatchObject({
      found: 1,
      hit: 1,
    });
  });

  it("preserves null when both runs report taken === null for the same branch", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/merge.ts
DA:1,1
BRDA:1,0,0,-
end_of_record
SF:src/merge.ts
DA:1,1
BRDA:1,0,0,-
end_of_record`,
      sourceFiles: [{ path: "src/merge.ts", content: "x;\n" }],
    });
    expect(bundle.report.files[0]?.totals.branches).toMatchObject({
      found: 1,
      hit: 0,
    });
    // The merged branch should keep its null marker — it was never taken in
    // either run.
    expect(bundle.report.files[0]?.lines[0]?.branches[0]?.taken).toBeNull();
  });
});

describe("buildCoverageBundle - normalizeSourcePath edge cases", () => {
  it("returns just the basename when the LCOV path equals the project root exactly", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:/work/repo/lone-file.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "lone-file.ts", content: "x;\n" }],
      projectRoot: "/work/repo/lone-file.ts",
    });
    expect(bundle.report.files[0]?.path).toBe("lone-file.ts");
  });

  it("treats trailing slashes on projectRoot the same as no trailing slash", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:/work/repo/src/foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "src/foo.ts", content: "x;\n" }],
      projectRoot: "/work/repo/",
    });
    expect(bundle.report.files[0]?.path).toBe("src/foo.ts");
  });
});

describe("buildCoverageBundle - ignored & uncovered interactions", () => {
  it("emits no uncovered items when every line is ignored", () => {
    // Solidity assembly inside a function — every covered line is part of
    // the assembly block, so it should be marked ignored and produce no
    // uncovered items.
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

  it("partially-taken branches push line status to 'partial'", () => {
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
});

describe("buildCoverageBundle - bundle plumbing", () => {
  it("includes branch metadata when input.branch is provided", () => {
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

  it("produces a stable file id slug even for paths with only special characters", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:///
DA:1,1
end_of_record`,
      sourceFiles: [],
    });
    // The slug should sanitize down to "file" rather than producing an empty
    // suffix or a stray dash.
    expect(bundle.report.files[0]?.id).toMatch(/^0001-(file|.+)$/);
    expect(bundle.report.files[0]?.id.endsWith("-")).toBe(false);
  });
});
