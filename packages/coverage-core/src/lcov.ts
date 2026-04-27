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
        const parsedLine = parsePositiveInteger(lineNumber);
        const parsedHits = parseNonNegativeInteger(hits);
        if (parsedLine !== null && parsedHits !== null) {
          current.lines.set(parsedLine, parsedHits);
        }
        break;
      }
      case "FN":
      case "FNA": {
        const [lineNumber, rawName] = splitOnce(value, ",");
        const parsedLine = parsePositiveInteger(lineNumber);
        const name = rawName.trim();
        if (parsedLine !== null && name) {
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
        const parsedHits = parseNonNegativeInteger(hits);
        if (!name || parsedHits === null) break;
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
        const parsedLine = parsePositiveInteger(lineNumber);
        if (
          parsedLine !== null &&
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
  const functions = collapseDuplicateFunctions(record.functions);
  const lineHits = [...record.lines.values()].filter((hits) => hits > 0).length;
  const functionHits = functions.filter((fn) => fn.hits > 0).length;
  const branchHits = record.branches.filter(
    (branch) => (branch.taken ?? 0) > 0,
  ).length;

  return {
    ...record,
    functions,
    totals: {
      lines: makeTotals(record.lines.size, lineHits),
      functions: makeTotals(functions.length, functionHits),
      branches: makeTotals(record.branches.length, branchHits),
    },
  };
}

// `cargo-llvm-cov` (and any LCOV writer that emits one record per LLVM
// instantiation) can produce multiple FN entries that all describe the same
// source-level function. The Rust workspace case: when a crate is compiled
// twice — once as the library under test and once as a dependency of another
// workspace member's tests — both compilations emit a v0-mangled symbol that
// differs only in the leading `Cs<base62>_` crate disambiguator. The
// uninstrumented compilation reports zero hits and surfaces in the report as
// a phantom uncovered function on a fully-covered line.
//
// We collapse FN records that share `(line, identity)`, where identity is the
// symbol with its Rust v0 crate disambiguator stripped. Hits across collapsed
// records are summed so a non-zero hit in any monomorphization counts the
// function as covered. Distinct names on the same line (rare but possible
// with macro expansion) keep their own entries.
export function collapseDuplicateFunctions(
  functions: FunctionDetail[],
): FunctionDetail[] {
  const byKey = new Map<string, FunctionDetail>();
  for (const fn of functions) {
    const key = `${fn.line}\u0000${functionIdentity(fn.name)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.hits += fn.hits;
      // Prefer a name with non-zero hits so the rendered label reflects the
      // monomorphization that actually executed.
      if (existing.hits === fn.hits && fn.hits > 0) existing.name = fn.name;
    } else {
      byKey.set(key, { ...fn });
    }
  }
  return [...byKey.values()];
}

// Rust v0 symbols start with `_R`, optionally followed by encoding-version
// bytes, then an optional `Cs<base62>_` crate disambiguator. Stripping the
// disambiguator yields a stable identity across monomorphizations of the
// same source path.
const RUST_V0_DISAMBIGUATOR = /^(_R[a-zA-Z]*)Cs[0-9A-Za-z_]+_/;

function functionIdentity(name: string): string {
  const match = RUST_V0_DISAMBIGUATOR.exec(name);
  if (match) return name.replace(RUST_V0_DISAMBIGUATOR, `${match[1]}_`);
  return name;
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, ""];
  return [value.slice(0, index), value.slice(index + 1)];
}

function parsePositiveInteger(value: string | undefined): number | null {
  const parsed = parseNonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const INVALID_TAKEN = Symbol("invalid-taken");

function parseBrdaTaken(
  value: string | undefined,
): number | null | typeof INVALID_TAKEN {
  if (value === undefined || value === "-") return null;
  // An empty taken slot (BRDA:1,0,0,) is malformed — Number("") yields 0 which
  // would silently masquerade as a not-taken branch. Reject it instead.
  if (value === "") return INVALID_TAKEN;
  const parsed = parseNonNegativeInteger(value);
  return parsed ?? INVALID_TAKEN;
}
