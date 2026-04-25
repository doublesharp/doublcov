import { parseDiagnostics } from "./diagnostics.js";
import { appendHistoryRun } from "./history.js";
import { detectIgnoredLines, detectSourceLanguage } from "./languages.js";
import { parseLcov, type LcovRecord } from "./lcov.js";
import { addTotals, makeTotals } from "./math.js";
import type {
  BranchDetail,
  BuildReportInput,
  CoverageDiagnostic,
  CoverageReport,
  CoverageStatus,
  FunctionDetail,
  LineCoverage,
  SourceFileCoverage,
  SourceFilePayload,
  UncoveredItem,
} from "./types.js";

export interface BuiltCoverageBundle {
  report: CoverageReport;
  sourcePayloads: SourceFilePayload[];
}

export function buildCoverageBundle(
  input: BuildReportInput,
): BuiltCoverageBundle {
  const generatedAt = new Date().toISOString();
  const sourcesByPath = new Map(
    input.sourceFiles.map((file) => [normalizePath(file.path), file.content]),
  );
  const lcovRecords = mergeLcovRecords(parseLcov(input.lcov));

  const sourcePayloads: SourceFilePayload[] = [];
  const missingSourceDiagnostics: CoverageDiagnostic[] = [];
  const files: SourceFileCoverage[] = lcovRecords.map((record, index) => {
    const normalizedPath = normalizePath(record.sourceFile);
    const language = detectSourceLanguage(normalizedPath);
    const sourceMatch = findSourceContent(sourcesByPath, normalizedPath);
    if (!sourceMatch.found) {
      missingSourceDiagnostics.push({
        id: `missing-source:${normalizedPath}`,
        source: "doublcov",
        severity: "warning",
        filePath: normalizedPath,
        message: `Source file not found for LCOV path "${normalizedPath}". The report will not display its source.`,
      });
    }
    const content = sourceMatch.content;
    const lines = content.split(/\r?\n/);
    const ignoredLines = detectIgnoredLines(lines, language);
    const ignoredLineNumbers = new Set(ignoredLines.map((line) => line.line));
    const ignoredByReason = countIgnoredLineReasons(ignoredLines);
    const assemblyLines = ignoredLines
      .filter((line) => line.reason === "solidity-assembly")
      .map((line) => line.line);
    const id = stableFileId(index, normalizedPath);
    const includedFunctions = record.functions.filter(
      (fn) => !ignoredLineNumbers.has(fn.line),
    );
    const includedBranches = record.branches.filter(
      (branch) => !ignoredLineNumbers.has(branch.line),
    );
    const branchesByLine = groupBranches(includedBranches);
    const coveredLines: LineCoverage[] = [...record.lines.entries()]
      .sort(([a], [b]) => a - b)
      .map(([line, hits]) => {
        const branches = branchesByLine.get(line) ?? [];
        return {
          line,
          hits,
          branches,
          status: ignoredLineNumbers.has(line)
            ? "ignored"
            : lineStatus(hits, branches),
        };
      });
    const adjustedLineTotals = makeTotals(
      coveredLines.filter((line) => line.status !== "ignored").length,
      coveredLines.filter((line) => line.status !== "ignored" && line.hits > 0)
        .length,
    );
    const adjustedFunctionTotals = makeTotals(
      includedFunctions.length,
      includedFunctions.filter((fn) => fn.hits > 0).length,
    );
    const adjustedBranchTotals = makeTotals(
      includedBranches.length,
      includedBranches.filter((branch) => (branch.taken ?? 0) > 0).length,
    );
    const uncoveredBranches = includedBranches.filter(
      (branch) => (branch.taken ?? 0) <= 0,
    );
    const uncoveredFunctions = includedFunctions.filter((fn) => fn.hits <= 0);
    const uncoveredLines = coveredLines
      .filter((line) => line.status === "uncovered")
      .map((line) => line.line);

    sourcePayloads.push({
      id,
      path: normalizedPath,
      language,
      lines,
    });

    return {
      id,
      path: normalizedPath,
      displayPath: trimCommonSourcePrefix(normalizedPath),
      language,
      lineCount: lines.length,
      lines: coveredLines,
      functions: includedFunctions,
      totals: {
        ...record.totals,
        lines: adjustedLineTotals,
        functions: adjustedFunctionTotals,
        branches: adjustedBranchTotals,
      },
      uncovered: {
        lines: uncoveredLines,
        functions: uncoveredFunctions,
        branches: uncoveredBranches,
      },
      ignored: {
        lines: ignoredLines,
        byReason: ignoredByReason,
        assemblyLines,
      },
      searchText:
        `${normalizedPath}\n${includedFunctions.map((fn) => fn.name).join("\n")}\n${content}`.toLowerCase(),
      sourceDataPath: `data/files/${id}.json`,
    };
  });

  const totals = {
    lines: addTotals(files.map((file) => file.totals.lines)),
    functions: addTotals(files.map((file) => file.totals.functions)),
    branches: addTotals(files.map((file) => file.totals.branches)),
  };
  const diagnostics = [
    ...missingSourceDiagnostics,
    ...parseDiagnostics(input.diagnostics),
  ];
  const uncoveredItems = buildUncoveredItems(files);
  const ignored = {
    lines: files.reduce((sum, file) => sum + file.ignored.lines.length, 0),
    byReason: addIgnoredLineReasons(files.map((file) => file.ignored.byReason)),
    assemblyLines: files.reduce(
      (sum, file) => sum + file.ignored.assemblyLines.length,
      0,
    ),
  };
  const reportWithoutHistory = {
    schemaVersion: 1 as const,
    generatedAt,
    totals,
    files,
    uncoveredItems,
    ignored,
    diagnostics,
    ...(input.customization ? { customization: input.customization } : {}),
    history: input.history ?? { schemaVersion: 1, runs: [] },
    ...(input.projectName ? { projectName: input.projectName } : {}),
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
  };

  const metadata = {
    ...(input.commit ? { commit: input.commit } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
  };

  return {
    report: {
      ...reportWithoutHistory,
      history: appendHistoryRun(input.history, reportWithoutHistory, metadata),
    },
    sourcePayloads,
  };
}

function countIgnoredLineReasons(
  lines: Array<{ reason: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of lines)
    counts[line.reason] = (counts[line.reason] ?? 0) + 1;
  return counts;
}

function addIgnoredLineReasons(
  reasonCounts: Array<Record<string, number>>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const counts of reasonCounts) {
    for (const [reason, count] of Object.entries(counts))
      totals[reason] = (totals[reason] ?? 0) + count;
  }
  return totals;
}

function mergeLcovRecords(records: LcovRecord[]): LcovRecord[] {
  const byPath = new Map<string, LcovRecord>();
  for (const record of records) {
    const normalizedPath = normalizePath(record.sourceFile);
    const existing = byPath.get(normalizedPath);
    if (!existing) {
      byPath.set(normalizedPath, {
        ...record,
        sourceFile: normalizedPath,
        lines: new Map(record.lines),
        functions: record.functions.map((fn) => ({ ...fn })),
        branches: record.branches.map((branch) => ({ ...branch })),
      });
      continue;
    }

    for (const [line, hits] of record.lines) {
      existing.lines.set(line, (existing.lines.get(line) ?? 0) + hits);
    }
    existing.functions = mergeFunctions(existing.functions, record.functions);
    existing.branches = mergeBranches(existing.branches, record.branches);
  }

  return [...byPath.values()].map((record) => ({
    ...record,
    branches: record.branches.map((branch, index) => ({
      ...branch,
      id: String(index),
    })),
    totals: {
      lines: makeTotals(
        record.lines.size,
        [...record.lines.values()].filter((hits) => hits > 0).length,
      ),
      functions: makeTotals(
        record.functions.length,
        record.functions.filter((fn) => fn.hits > 0).length,
      ),
      branches: makeTotals(
        record.branches.length,
        record.branches.filter((branch) => (branch.taken ?? 0) > 0).length,
      ),
    },
  }));
}

function mergeFunctions(
  existing: FunctionDetail[],
  incoming: FunctionDetail[],
): FunctionDetail[] {
  const byKey = new Map<string, FunctionDetail>();
  for (const fn of existing) byKey.set(functionKey(fn), { ...fn });
  for (const fn of incoming) {
    const key = functionKey(fn);
    const current = byKey.get(key);
    if (current) {
      current.hits += fn.hits;
    } else {
      byKey.set(key, { ...fn });
    }
  }
  return [...byKey.values()];
}

function mergeBranches(
  existing: BranchDetail[],
  incoming: BranchDetail[],
): BranchDetail[] {
  const byKey = new Map<string, BranchDetail>();
  for (const branch of existing) byKey.set(branchKey(branch), { ...branch });
  for (const branch of incoming) {
    const key = branchKey(branch);
    const current = byKey.get(key);
    if (current) {
      current.taken = mergeTaken(current.taken, branch.taken);
    } else {
      byKey.set(key, { ...branch });
    }
  }
  return [...byKey.values()];
}

function functionKey(fn: FunctionDetail): string {
  return `${fn.name}\u0000${fn.line}`;
}

function branchKey(branch: BranchDetail): string {
  return `${branch.line}\u0000${branch.block}\u0000${branch.branch}`;
}

function mergeTaken(left: number | null, right: number | null): number | null {
  if (left === null && right === null) return null;
  return (left ?? 0) + (right ?? 0);
}

function buildUncoveredItems(files: SourceFileCoverage[]): UncoveredItem[] {
  return files.flatMap((file) => [
    ...file.uncovered.lines.map((line) => ({
      id: `line:${file.id}:${line}`,
      kind: "line" as const,
      fileId: file.id,
      filePath: file.path,
      line,
      label: `Line ${line}`,
      detail: "Line was not executed",
    })),
    ...file.uncovered.functions.map((fn) => ({
      id: `function:${file.id}:${fn.name}:${fn.line}`,
      kind: "function" as const,
      fileId: file.id,
      filePath: file.path,
      line: fn.line,
      label: fn.name,
      detail: "Function was not called",
    })),
    ...file.uncovered.branches.map((branch) => ({
      id: `branch:${file.id}:${branch.line}:${branch.block}:${branch.branch}`,
      kind: "branch" as const,
      fileId: file.id,
      filePath: file.path,
      line: branch.line,
      label: `Branch ${branch.block}.${branch.branch}`,
      detail: "Branch path was not taken",
    })),
  ]);
}

function groupBranches(branches: BranchDetail[]): Map<number, BranchDetail[]> {
  const byLine = new Map<number, BranchDetail[]>();
  for (const branch of branches) {
    const current = byLine.get(branch.line) ?? [];
    current.push(branch);
    byLine.set(branch.line, current);
  }
  return byLine;
}

function lineStatus(hits: number, branches: BranchDetail[]): CoverageStatus {
  if (hits <= 0) return "uncovered";
  if (branches.some((branch) => (branch.taken ?? 0) <= 0)) return "partial";
  return "covered";
}

function stableFileId(index: number, filePath: string): string {
  const slug = filePath
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${String(index + 1).padStart(4, "0")}-${slug || "file"}`;
}

export function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function stripLeadingDot(filePath: string): string {
  return filePath.replace(/^\.\//, "");
}

function findSourceContent(
  sourcesByPath: Map<string, string>,
  lcovPath: string,
): { content: string; found: boolean } {
  const stripped = stripLeadingDot(lcovPath);
  const exact = sourcesByPath.get(lcovPath) ?? sourcesByPath.get(stripped);
  if (exact !== undefined) return { content: exact, found: true };

  for (const [sourcePath, content] of sourcesByPath) {
    if (
      lcovPath.endsWith(`/${sourcePath}`) ||
      sourcePath.endsWith(`/${stripped}`)
    ) {
      return { content, found: true };
    }
  }

  const lcovFileName = stripped.split("/").at(-1);
  const basenameMatches = [...sourcesByPath.entries()].filter(
    ([sourcePath]) => sourcePath.split("/").at(-1) === lcovFileName,
  );
  if (basenameMatches.length === 1) {
    return { content: basenameMatches[0]?.[1] ?? "", found: true };
  }
  return { content: "", found: false };
}

function trimCommonSourcePrefix(filePath: string): string {
  return filePath.replace(
    /^.*?(src|lib|app|packages|contracts|test|tests)\//,
    "$1/",
  );
}
