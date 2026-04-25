import { describe, expect, it } from "vitest";
import { parseLcov } from "../src/lcov.js";

describe("parseLcov edge cases", () => {
  it("rejects DA records with negative line numbers", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
DA:-1,1
DA:5,1
end_of_record`);
    expect(record?.lines.has(-1)).toBe(false);
    expect(record?.lines.get(5)).toBe(1);
  });

  it("rejects DA records with non-integer line numbers", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
DA:1.5,1
DA:5,1
end_of_record`);
    expect(record?.lines.has(1.5)).toBe(false);
    expect(record?.lines.get(5)).toBe(1);
  });

  it("rejects DA records with negative hit counts", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
DA:1,-5
DA:2,3
end_of_record`);
    expect(record?.lines.has(1)).toBe(false);
    expect(record?.lines.get(2)).toBe(3);
  });

  it("rejects DA records with non-integer hit counts", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
DA:1,1.5
DA:2,3
end_of_record`);
    expect(record?.lines.has(1)).toBe(false);
    expect(record?.lines.get(2)).toBe(3);
  });

  it("flushes a record when SF appears again before end_of_record", () => {
    // Two SF records inside one block: should be treated as separate records.
    const records = parseLcov(`SF:src/a.ts
DA:1,1
SF:src/b.ts
DA:2,2
end_of_record`);
    const a = records.find((r) => r.sourceFile === "src/a.ts");
    const b = records.find((r) => r.sourceFile === "src/b.ts");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.lines.get(1)).toBe(1);
    expect(a?.lines.has(2)).toBe(false);
    expect(b?.lines.get(2)).toBe(2);
    expect(b?.lines.has(1)).toBe(false);
  });

  it("emits a record even when end_of_record is missing", () => {
    const records = parseLcov(`SF:src/a.ts
DA:1,1
DA:2,0`);
    expect(records).toHaveLength(1);
    expect(records[0]?.sourceFile).toBe("src/a.ts");
    expect(records[0]?.lines.get(1)).toBe(1);
    expect(records[0]?.totals.lines).toMatchObject({ found: 2, hit: 1 });
  });

  it("rejects BRDA records with empty taken value", () => {
    // Empty string should not silently parse as 0 (not-taken).
    const [record] = parseLcov(`SF:src/Foo.ts
BRDA:1,0,0,
BRDA:1,0,1,3
end_of_record`);
    expect(record?.branches).toHaveLength(1);
    expect(record?.branches[0]?.taken).toBe(3);
  });

  it("treats BRDA with the '-' sentinel as the never-taken null marker", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
BRDA:1,0,0,-
BRDA:1,0,1,0
end_of_record`);
    expect(record?.branches).toHaveLength(2);
    expect(record?.branches[0]?.taken).toBeNull();
    expect(record?.branches[1]?.taken).toBe(0);
    // Per LCOV spec, '-' branches should NOT count as hit.
    expect(record?.totals.branches.hit).toBe(0);
  });

  it("preserves unicode and arbitrary characters in source paths", () => {
    const path = "src/日本/ファイル ☃.ts";
    const [record] = parseLcov(`SF:${path}
DA:1,1
end_of_record`);
    expect(record?.sourceFile).toBe(path);
  });

  it("parses Windows CRLF line endings", () => {
    const text = ["SF:src/a.ts", "DA:1,1", "DA:2,0", "end_of_record"].join(
      "\r\n",
    );
    const [record] = parseLcov(text);
    expect(record?.sourceFile).toBe("src/a.ts");
    expect(record?.totals.lines).toMatchObject({ found: 2, hit: 1 });
  });

  it("ignores blank lines and trailing whitespace between records", () => {
    const text = `\n\nSF:src/a.ts   \n\nDA:1,1\n  \nend_of_record  \n\n\nSF:src/b.ts\nDA:2,1\nend_of_record\n\n`;
    const records = parseLcov(text);
    expect(records.map((r) => r.sourceFile)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  it("attaches an orphan FN with no FNDA as zero hits", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
FN:10,foo
end_of_record`);
    expect(record?.functions).toHaveLength(1);
    expect(record?.functions[0]).toMatchObject({
      name: "foo",
      line: 10,
      hits: 0,
    });
  });

  it("silently drops FN records that lack the comma-separated name", () => {
    // FN:10 (no name) is malformed; splitOnce returns ['10', ''] and the
    // empty name should be filtered out.
    const [record] = parseLcov(`SF:src/Foo.ts
FN:10
FN:20,real
FNDA:1,real
DA:20,1
end_of_record`);
    expect(record?.functions).toHaveLength(1);
    expect(record?.functions[0]).toMatchObject({ name: "real", line: 20 });
  });

  it("silently drops FNDA records that lack the comma-separated name", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
FN:10,real
FNDA:7
FNDA:1,real
DA:10,1
end_of_record`);
    expect(record?.functions).toHaveLength(1);
    expect(record?.functions[0]).toMatchObject({
      name: "real",
      line: 10,
      hits: 1,
    });
  });

  it("skips lines that have no colon separator", () => {
    // 'DA1,1' is missing the colon — should be ignored, not crash.
    const [record] = parseLcov(`SF:src/Foo.ts
DA1,1
DA:2,1
end_of_record`);
    expect(record?.lines.has(1)).toBe(false);
    expect(record?.lines.get(2)).toBe(1);
  });

  it("tolerates leading whitespace before tags", () => {
    // The parser trims each line; indented LCOV emitters should still parse.
    const [record] = parseLcov(`  SF:src/Foo.ts
   DA:1,1
   DA:2,0
end_of_record`);
    expect(record?.sourceFile).toBe("src/Foo.ts");
    expect(record?.lines.get(1)).toBe(1);
    expect(record?.totals.lines.found).toBe(2);
  });
});
