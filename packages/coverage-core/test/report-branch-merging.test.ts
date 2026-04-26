import { describe, expect, it } from "vitest";
import { buildCoverageBundle } from "../src/report.js";

describe("buildCoverageBundle duplicate LCOV records", () => {
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
});

describe("buildCoverageBundle branch merge semantics", () => {
  it("adds branch hits when one run has null and the other has a number", () => {
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

    expect(bundle.report.files[0]?.totals.branches).toMatchObject({
      found: 1,
      hit: 1,
    });
  });

  it("adds branch hits when the first run has a number and the second run is null", () => {
    const bundle = buildCoverageBundle({
      lcov: `SF:src/merge.ts
DA:1,1
BRDA:1,0,0,5
end_of_record
SF:src/merge.ts
DA:1,1
BRDA:1,0,0,-
end_of_record`,
      sourceFiles: [{ path: "src/merge.ts", content: "x;\n" }],
    });

    expect(bundle.report.files[0]?.totals.branches).toMatchObject({
      found: 1,
      hit: 1,
    });
    expect(bundle.report.files[0]?.lines[0]?.branches[0]?.taken).toBe(5);
  });

  it("includes branches that appear in only the second run", () => {
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

  it("preserves null when both runs report taken as null for the same branch", () => {
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
    expect(bundle.report.files[0]?.lines[0]?.branches[0]?.taken).toBeNull();
  });
});
