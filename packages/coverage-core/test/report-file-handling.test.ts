import { describe, expect, it } from "vitest";
import { buildCoverageBundle, normalizePath } from "../src/report.js";

describe("buildCoverageBundle source file matching", () => {
  it("matches on suffix when the LCOV path is absolute and the source path is repo-relative", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:/abs/work/repo/src/foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "src/foo.ts", content: "console.log('hi');\n" }],
    });

    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
    expect(bundle.sourcePayloads[0]?.lines).toEqual(["console.log('hi');", ""]);
    expect(bundle.report.files[0]).toMatchObject({
      path: "/abs/work/repo/src/foo.ts",
      displayPath: "src/foo.ts",
      lineCount: 2,
    });
  });

  it("matches on basename when no path or suffix match exists and the basename is unique", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:obj/output/Foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "totally/different/dir/Foo.ts", content: "x;\n" }],
    });

    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
    expect(bundle.sourcePayloads[0]?.lines).toEqual(["x;", ""]);
  });

  it("does not match by basename when multiple files share a name", () => {
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

  it("does not pick an arbitrary source when suffix matches are ambiguous", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/Foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "packages/a/src/Foo.ts", content: "first;\n" },
        { path: "packages/b/src/Foo.ts", content: "second;\n" },
      ],
    });

    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(1);
    expect(bundle.sourcePayloads[0]?.lines).toEqual([""]);
  });

  it("emits a missing-source diagnostic when no match is possible", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/Missing.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "src/Other.ts", content: "x;\n" }],
    });

    expect(
      bundle.report.diagnostics.find(
        (diagnostic) =>
          diagnostic.source === "doublcov" &&
          diagnostic.filePath === "src/Missing.ts",
      ),
    ).toBeDefined();
  });

  it("emits a warning when no source files are available for an LCOV record", () => {
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

  it("normalizes leading './' in LCOV paths to match repo-relative source paths", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:./src/foo.ts
DA:1,1
end_of_record`,
      sourceFiles: [{ path: "src/foo.ts", content: "x;\n" }],
    });

    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });
});

describe("buildCoverageBundle path normalization", () => {
  it("normalizes Windows separators and only strips leading dot-slash prefixes", () => {
    expect(normalizePath(".\\src\\foo.ts")).toBe("src/foo.ts");
    expect(normalizePath("./src\\foo.ts")).toBe("src/foo.ts");
    expect(normalizePath("src/./foo.ts")).toBe("src/./foo.ts");
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
      filePath: "src/lib.rs",
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });

  it("normalizes project-rooted source paths before matching LCOV records", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:/work/repo/src/rooted.ts
DA:1,1
end_of_record`,
      sourceFiles: [
        { path: "/work/repo/src/rooted.ts", content: "rooted();\n" },
      ],
      projectRoot: "/work/repo",
    });

    expect(bundle.report.files[0]).toMatchObject({
      path: "src/rooted.ts",
      displayPath: "src/rooted.ts",
    });
    expect(bundle.sourcePayloads[0]).toMatchObject({
      path: "src/rooted.ts",
      lines: ["rooted();", ""],
    });
    expect(
      bundle.report.diagnostics.filter(
        (diagnostic) => diagnostic.source === "doublcov",
      ),
    ).toHaveLength(0);
  });

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

  it("collapses repeated separators when producing source payload slugs", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src////nested---file.ts
DA:1,1
end_of_record`,
      sourceFiles: [],
    });

    expect(bundle.report.files[0]?.id).toBe("0001-src-nested-file-ts");
    expect(bundle.report.files[0]?.sourceDataPath).toBe(
      "data/files/0001-src-nested-file-ts.json",
    );
  });

  it("produces a stable file id slug even for paths with only special characters", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:///
DA:1,1
end_of_record`,
      sourceFiles: [],
    });

    expect(bundle.report.files[0]?.id).toBe("0001-file");
    expect(bundle.report.files[0]?.sourceDataPath).toBe(
      "data/files/0001-file.json",
    );
  });
});
