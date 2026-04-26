import { describe, expect, it } from "vitest";
import { parseLcov } from "../src/lcov.js";

describe("parseLcov edge cases", () => {
  it("returns no records for empty input or records without a source file", () => {
    expect(parseLcov("")).toEqual([]);
    expect(parseLcov("DA:1,1\nend_of_record")).toEqual([]);
  });

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

  it("rejects DA records with empty, exponent, decimal, or hex numeric fields", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
DA:1,
DA:2,1e1
DA:3,1.0
DA:0x10,1
DA:4,7
end_of_record`);
    expect(record?.lines.has(1)).toBe(false);
    expect(record?.lines.has(2)).toBe(false);
    expect(record?.lines.has(3)).toBe(false);
    expect(record?.lines.has(16)).toBe(false);
    expect(record?.lines.get(4)).toBe(7);
  });

  it("accepts zero hit counts but rejects zero line numbers", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
DA:0,1
DA:1,0
end_of_record`);
    expect(record?.lines.has(0)).toBe(false);
    expect(record?.lines.get(1)).toBe(0);
    expect(record?.totals.lines).toMatchObject({ found: 1, hit: 0 });
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

  it("does not emit a blank record before the first source file", () => {
    const records = parseLcov(`SF:src/a.ts
DA:1,1
end_of_record`);
    expect(records.map((record) => record.sourceFile)).toEqual(["src/a.ts"]);
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

  it("rejects BRDA records with malformed line or taken numeric fields", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
BRDA:1.0,0,0,1
BRDA:2,0,0,1e1
BRDA:0x10,0,0,1
BRDA:3,0,0,1
end_of_record`);
    expect(record?.branches).toHaveLength(1);
    expect(record?.branches[0]).toMatchObject({ line: 3, taken: 1 });
  });

  it("rejects BRDA records that are missing block or branch ids", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
BRDA:1,0
BRDA:2,0,1,1
end_of_record`);
    expect(record?.branches).toEqual([
      { id: "0", line: 2, block: "0", branch: "1", taken: 1 },
    ]);
    expect(record?.totals.branches).toMatchObject({ found: 1, hit: 1 });
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
    expect(records.map((r) => r.sourceFile)).toEqual(["src/a.ts", "src/b.ts"]);
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

  it("trims FN names and updates duplicate function declarations in place", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
FN:10,  spaced  
FN:20,spaced
FNDA:2,spaced
end_of_record`);
    expect(record?.functions).toEqual([{ name: "spaced", line: 20, hits: 2 }]);
    expect(record?.totals.functions).toMatchObject({ found: 1, hit: 1 });
  });

  it("trims FNDA names before matching an existing FN", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
FN:10,spaced
FNDA:3,  spaced  
end_of_record`);
    expect(record?.functions).toEqual([{ name: "spaced", line: 10, hits: 3 }]);
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

  it("rejects FN/FNDA records with malformed numeric fields", () => {
    const [record] = parseLcov(`SF:src/Foo.ts
FN:1.0,fractionalLine
FN:0x10,hexLine
FN:20,real
FNDA:,real
FNDA:1e1,real
FNDA:3,real
DA:20,1
end_of_record`);
    expect(record?.functions).toHaveLength(1);
    expect(record?.functions[0]).toMatchObject({
      name: "real",
      line: 20,
      hits: 3,
    });
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

  it("rejects DA hit counts that exceed Number.MAX_SAFE_INTEGER", () => {
    // The regex in parseNonNegativeInteger admits any non-negative integer
    // string, but values beyond 2^53-1 lose precision when converted via
    // Number(). The parser should reject them rather than silently store a
    // rounded value. 9007199254740993 == MAX_SAFE_INTEGER + 2, which JavaScript
    // rounds to 9007199254740992 — both fail Number.isSafeInteger.
    const [record] = parseLcov(`SF:src/Foo.ts
DA:1,9007199254740993
DA:2,42
end_of_record`);
    expect(record?.lines.has(1)).toBe(false);
    expect(record?.lines.get(2)).toBe(42);
  });
});
