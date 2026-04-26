import { describe, expect, it } from "vitest";
import { parseFoundryDebugReport, parseLcov } from "../src/index.js";

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
