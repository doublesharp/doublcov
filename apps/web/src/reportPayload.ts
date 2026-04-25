import {
  sanitizeCoverageReportCustomization,
  type BranchDetail,
  type CoverageDiagnostic,
  type CoverageHistory,
  type CoverageReport,
  type CoverageStatus,
  type CoverageTotals,
  type FunctionDetail,
  type IgnoredLine,
  type LineCoverage,
  type SourceFileCoverage,
  type SourceFilePayload,
  type SourceLanguage,
  type UncoveredItem,
  type UncoveredKind,
} from "@0xdoublesharp/doublcov-core";

const validCoverageStatuses = new Set<CoverageStatus>([
  "covered",
  "partial",
  "uncovered",
  "ignored",
  "neutral",
]);
const validUncoveredKinds = new Set<UncoveredKind>([
  "line",
  "function",
  "branch",
]);
const validDiagnosticSeverities = new Set<CoverageDiagnostic["severity"]>([
  "info",
  "warning",
]);
const safeSourceDataPath = /^data\/files\/[A-Za-z0-9._-]+\.json$/;

export function parseReportPayload(input: unknown): CoverageReport {
  if (!isRecord(input) || !Array.isArray(input.files)) {
    throw new Error(
      "Coverage report data/report.json is malformed: missing files.",
    );
  }

  const files = input.files
    .map(sanitizeSourceFileCoverage)
    .filter((file) => file !== null);
  const fileIds = new Set(files.map((file) => file.id));
  const customization = sanitizeCoverageReportCustomization(
    input.customization,
  );
  const report: CoverageReport = {
    schemaVersion: 1,
    generatedAt:
      typeof input.generatedAt === "string"
        ? input.generatedAt
        : new Date(0).toISOString(),
    totals: sanitizeReportTotals(input.totals),
    files,
    uncoveredItems: sanitizeArray(
      input.uncoveredItems,
      sanitizeUncoveredItem,
    ).filter((item) => fileIds.has(item.fileId)),
    ignored: sanitizeReportIgnored(input.ignored),
    diagnostics: sanitizeArray(input.diagnostics, sanitizeDiagnostic),
    history: sanitizeHistory(input.history),
    ...(typeof input.projectName === "string"
      ? { projectName: input.projectName }
      : {}),
    ...(typeof input.projectRoot === "string"
      ? { projectRoot: input.projectRoot }
      : {}),
    ...(customization ? { customization } : {}),
  };

  return report;
}

export function parseSourcePayload(
  input: unknown,
  filePath: string,
): SourceFilePayload {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.path !== "string" ||
    typeof input.language !== "string" ||
    !Array.isArray(input.lines) ||
    !input.lines.every((line) => typeof line === "string")
  ) {
    throw new Error(
      `Source payload for ${filePath} is malformed: missing id, path, language, or lines.`,
    );
  }
  return {
    id: input.id,
    path: input.path,
    language: input.language as SourceLanguage,
    lines: input.lines,
  };
}

function sanitizeSourceFileCoverage(input: unknown): SourceFileCoverage | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.path !== "string" ||
    typeof input.displayPath !== "string" ||
    typeof input.language !== "string"
  ) {
    return null;
  }

  return {
    id: input.id,
    path: input.path,
    displayPath: input.displayPath,
    language: input.language as SourceLanguage,
    lineCount: sanitizeNumber(input.lineCount),
    lines: sanitizeArray(input.lines, sanitizeLineCoverage),
    functions: sanitizeArray(input.functions, sanitizeFunctionDetail),
    totals: sanitizeReportTotals(input.totals),
    uncovered: sanitizeFileUncovered(input.uncovered),
    ignored: sanitizeFileIgnored(input.ignored),
    searchText:
      typeof input.searchText === "string"
        ? input.searchText
        : input.path.toLowerCase(),
    sourceDataPath: sanitizeSourceDataPath(input.sourceDataPath, input.id),
  };
}

function sanitizeSourceDataPath(value: unknown, fileId: string): string {
  if (typeof value === "string" && safeSourceDataPath.test(value)) return value;
  return `data/files/${fileId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}

function sanitizeLineCoverage(input: unknown): LineCoverage | null {
  if (!isRecord(input)) return null;
  const status =
    typeof input.status === "string" &&
    validCoverageStatuses.has(input.status as CoverageStatus)
      ? (input.status as CoverageStatus)
      : "neutral";
  return {
    line: sanitizePositiveInteger(input.line),
    hits: sanitizeNumber(input.hits),
    branches: sanitizeArray(input.branches, sanitizeBranchDetail),
    status,
  };
}

function sanitizeFunctionDetail(input: unknown): FunctionDetail | null {
  if (!isRecord(input) || typeof input.name !== "string") return null;
  return {
    name: input.name,
    line: sanitizePositiveInteger(input.line),
    ...(typeof input.endLine === "number" &&
    Number.isInteger(input.endLine) &&
    input.endLine > 0
      ? { endLine: input.endLine }
      : {}),
    hits: sanitizeNumber(input.hits),
  };
}

function sanitizeBranchDetail(input: unknown): BranchDetail | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.block !== "string" ||
    typeof input.branch !== "string"
  ) {
    return null;
  }
  return {
    id: input.id,
    line: sanitizePositiveInteger(input.line),
    block: input.block,
    branch: input.branch,
    taken: input.taken === null ? null : sanitizeNumber(input.taken),
  };
}

function sanitizeUncoveredItem(input: unknown): UncoveredItem | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.kind !== "string" ||
    !validUncoveredKinds.has(input.kind as UncoveredKind) ||
    typeof input.fileId !== "string" ||
    typeof input.filePath !== "string" ||
    typeof input.label !== "string" ||
    typeof input.detail !== "string"
  ) {
    return null;
  }
  return {
    id: input.id,
    kind: input.kind as UncoveredKind,
    fileId: input.fileId,
    filePath: input.filePath,
    line: sanitizePositiveInteger(input.line),
    label: input.label,
    detail: input.detail,
  };
}

function sanitizeDiagnostic(input: unknown): CoverageDiagnostic | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.source !== "string" ||
    typeof input.message !== "string"
  ) {
    return null;
  }
  return {
    id: input.id,
    source: input.source,
    severity:
      typeof input.severity === "string" &&
      validDiagnosticSeverities.has(
        input.severity as CoverageDiagnostic["severity"],
      )
        ? (input.severity as CoverageDiagnostic["severity"])
        : "info",
    ...(typeof input.filePath === "string" ? { filePath: input.filePath } : {}),
    ...(typeof input.line === "number" &&
    Number.isInteger(input.line) &&
    input.line > 0
      ? { line: input.line }
      : {}),
    message: input.message,
  };
}

function sanitizeHistory(input: unknown): CoverageHistory {
  if (!isRecord(input)) return { schemaVersion: 1, runs: [] };
  return {
    schemaVersion: 1,
    runs: sanitizeArray(input.runs, sanitizeRun),
  };
}

function sanitizeRun(input: unknown): CoverageHistory["runs"][number] | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.timestamp !== "string"
  )
    return null;
  return {
    id: input.id,
    timestamp: input.timestamp,
    totals: sanitizeReportTotals(input.totals),
    files: sanitizeArray(input.files, sanitizeRunFile),
    ...(typeof input.commit === "string" ? { commit: input.commit } : {}),
    ...(typeof input.branch === "string" ? { branch: input.branch } : {}),
  };
}

function sanitizeRunFile(
  input: unknown,
): CoverageHistory["runs"][number]["files"][number] | null {
  if (!isRecord(input) || typeof input.path !== "string") return null;
  const uncovered = isRecord(input.uncovered) ? input.uncovered : {};
  return {
    path: input.path,
    lines: sanitizeTotals(input.lines),
    functions: sanitizeTotals(input.functions),
    branches: sanitizeTotals(input.branches),
    uncovered: {
      lines: sanitizeNumber(uncovered.lines),
      functions: sanitizeNumber(uncovered.functions),
      branches: sanitizeNumber(uncovered.branches),
    },
  };
}

function sanitizeFileUncovered(
  input: unknown,
): SourceFileCoverage["uncovered"] {
  if (!isRecord(input)) return { lines: [], functions: [], branches: [] };
  return {
    lines: sanitizeNumberArray(input.lines),
    functions: sanitizeArray(input.functions, sanitizeFunctionDetail),
    branches: sanitizeArray(input.branches, sanitizeBranchDetail),
  };
}

function sanitizeFileIgnored(input: unknown): SourceFileCoverage["ignored"] {
  if (!isRecord(input)) return { lines: [], byReason: {}, assemblyLines: [] };
  return {
    lines: sanitizeArray(input.lines, sanitizeIgnoredLine),
    byReason: sanitizeNumberRecord(input.byReason),
    assemblyLines: sanitizeNumberArray(input.assemblyLines),
  };
}

function sanitizeIgnoredLine(input: unknown): IgnoredLine | null {
  if (
    !isRecord(input) ||
    typeof input.reason !== "string" ||
    typeof input.label !== "string"
  )
    return null;
  return {
    line: sanitizePositiveInteger(input.line),
    reason: input.reason,
    label: input.label,
  };
}

function sanitizeReportIgnored(input: unknown): CoverageReport["ignored"] {
  if (!isRecord(input)) return { lines: 0, byReason: {}, assemblyLines: 0 };
  return {
    lines: sanitizeNumber(input.lines),
    byReason: sanitizeNumberRecord(input.byReason),
    assemblyLines: sanitizeNumber(input.assemblyLines),
  };
}

function sanitizeReportTotals(input: unknown): CoverageReport["totals"] {
  if (!isRecord(input)) {
    const empty = sanitizeTotals(undefined);
    return { lines: empty, functions: empty, branches: empty };
  }
  return {
    lines: sanitizeTotals(input.lines),
    functions: sanitizeTotals(input.functions),
    branches: sanitizeTotals(input.branches),
  };
}

function sanitizeTotals(input: unknown): CoverageTotals {
  if (!isRecord(input)) return { found: 0, hit: 0, percent: 100 };
  return {
    found: sanitizeNumber(input.found),
    hit: sanitizeNumber(input.hit),
    percent: Math.min(Math.max(sanitizeNumber(input.percent), 0), 100),
  };
}

function sanitizeNumberArray(input: unknown): number[] {
  return Array.isArray(input)
    ? input.map(sanitizePositiveInteger).filter((value) => value > 0)
    : [];
}

function sanitizeNumberRecord(input: unknown): Record<string, number> {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, sanitizeNumber(value)]),
  );
}

function sanitizeArray<T>(
  input: unknown,
  sanitize: (value: unknown) => T | null,
): T[] {
  return Array.isArray(input)
    ? input.map(sanitize).filter((value): value is T => value !== null)
    : [];
}

function sanitizeNumber(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) && input >= 0
    ? input
    : 0;
}

function sanitizePositiveInteger(input: unknown): number {
  return typeof input === "number" && Number.isInteger(input) && input > 0
    ? input
    : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
