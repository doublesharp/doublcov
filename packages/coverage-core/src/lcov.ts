import type { BranchDetail, FunctionDetail } from "./types.js";
import { makeTotals } from "./math.js";

export interface LcovRecord {
  sourceFile: string;
  lines: Map<number, number>;
  functions: FunctionDetail[];
  branches: BranchDetail[];
  totals: {
    lines: ReturnType<typeof makeTotals>;
    functions: ReturnType<typeof makeTotals>;
    branches: ReturnType<typeof makeTotals>;
  };
}

export function parseLcov(input: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let current = createRecord();
  const functionLines = new Map<string, number>();
  let pendingHits = new Map<string, number>();

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (line === "end_of_record") {
      flushPendingHits(current, pendingHits);
      if (current.sourceFile) records.push(finalizeRecord(current));
      current = createRecord();
      functionLines.clear();
      pendingHits = new Map();
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);

    switch (key) {
      case "SF":
        // If a new SF appears before end_of_record, flush the prior record.
        if (current.sourceFile && current.sourceFile !== value) {
          flushPendingHits(current, pendingHits);
          records.push(finalizeRecord(current));
          current = createRecord();
          functionLines.clear();
          pendingHits = new Map();
        }
        current.sourceFile = value;
        break;
      case "DA": {
        const [lineNumber, hits] = value.split(",");
        const parsedLine = Number(lineNumber);
        const parsedHits = Number(hits);
        if (
          Number.isInteger(parsedLine) &&
          parsedLine >= 1 &&
          Number.isInteger(parsedHits) &&
          parsedHits >= 0
        ) {
          current.lines.set(parsedLine, parsedHits);
        }
        break;
      }
      case "FN":
      case "FNA": {
        const [lineNumber, rawName] = splitOnce(value, ",");
        const parsedLine = Number(lineNumber);
        const name = rawName.trim();
        if (Number.isInteger(parsedLine) && parsedLine >= 1 && name) {
          functionLines.set(name, parsedLine);
          const existing = current.functions.find((fn) => fn.name === name);
          if (existing) {
            existing.line = parsedLine;
          } else {
            const hits = pendingHits.get(name) ?? 0;
            pendingHits.delete(name);
            current.functions.push({ name, line: parsedLine, hits });
          }
        }
        break;
      }
      case "FNDA": {
        const [hits, rawName] = splitOnce(value, ",");
        const name = rawName.trim();
        const parsedHits = Number(hits);
        if (!name || !Number.isInteger(parsedHits) || parsedHits < 0) break;
        const existing = current.functions.find((fn) => fn.name === name);
        if (existing) {
          existing.hits = parsedHits;
        } else {
          pendingHits.set(name, parsedHits);
        }
        break;
      }
      case "BRDA": {
        const [lineNumber, block, branch, taken] = value.split(",");
        const parsedLine = Number(lineNumber);
        if (
          Number.isInteger(parsedLine) &&
          parsedLine >= 1 &&
          block !== undefined &&
          branch !== undefined
        ) {
          const parsedTaken = parseBrdaTaken(taken);
          if (parsedTaken !== INVALID_TAKEN) {
            current.branches.push({
              id: `${current.branches.length}`,
              line: parsedLine,
              block,
              branch,
              taken: parsedTaken,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  flushPendingHits(current, pendingHits);
  if (current.sourceFile) records.push(finalizeRecord(current));
  return records;
}

function flushPendingHits(
  record: LcovRecord,
  pendingHits: Map<string, number>,
): void {
  for (const [name, hits] of pendingHits) {
    record.functions.push({ name, line: 1, hits });
  }
  pendingHits.clear();
}

function createRecord(): LcovRecord {
  return {
    sourceFile: "",
    lines: new Map(),
    functions: [],
    branches: [],
    totals: {
      lines: makeTotals(0, 0),
      functions: makeTotals(0, 0),
      branches: makeTotals(0, 0),
    },
  };
}

function finalizeRecord(record: LcovRecord): LcovRecord {
  const lineHits = [...record.lines.values()].filter((hits) => hits > 0).length;
  const functionHits = record.functions.filter((fn) => fn.hits > 0).length;
  const branchHits = record.branches.filter(
    (branch) => (branch.taken ?? 0) > 0,
  ).length;

  return {
    ...record,
    totals: {
      lines: makeTotals(record.lines.size, lineHits),
      functions: makeTotals(record.functions.length, functionHits),
      branches: makeTotals(record.branches.length, branchHits),
    },
  };
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, ""];
  return [value.slice(0, index), value.slice(index + 1)];
}

const INVALID_TAKEN = Symbol("invalid-taken");

function parseBrdaTaken(
  value: string | undefined,
): number | null | typeof INVALID_TAKEN {
  if (value === undefined || value === "-") return null;
  // An empty taken slot (BRDA:1,0,0,) is malformed — Number("") yields 0 which
  // would silently masquerade as a not-taken branch. Reject it instead.
  if (value === "") return INVALID_TAKEN;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : INVALID_TAKEN;
}
