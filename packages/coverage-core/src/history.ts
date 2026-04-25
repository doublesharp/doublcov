import type { CoverageHistory, CoverageReport, CoverageRun } from "./types.js";

export const HISTORY_SCHEMA_VERSION = 1;

export function appendHistoryRun(
  history: { schemaVersion?: number; runs: CoverageRun[] } | undefined,
  report: Pick<CoverageReport, "generatedAt" | "totals" | "files">,
  metadata: { commit?: string; branch?: string } = {}
): CoverageHistory {
  const previousRuns = history?.runs ?? [];
  const run: CoverageRun = {
    id: metadata.commit
      ? `${metadata.commit.slice(0, 12)}-${report.generatedAt}`
      : `run-${report.generatedAt}`,
    timestamp: report.generatedAt,
    totals: report.totals,
    files: report.files.map((file) => ({
      path: file.path,
      lines: file.totals.lines,
      functions: file.totals.functions,
      branches: file.totals.branches,
      uncovered: {
        lines: file.uncovered.lines.length,
        functions: file.uncovered.functions.length,
        branches: file.uncovered.branches.length
      }
    })),
    ...(metadata.commit ? { commit: metadata.commit } : {}),
    ...(metadata.branch ? { branch: metadata.branch } : {})
  };

  const deduped = previousRuns.filter((existing) => existing.id !== run.id);
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    runs: [...deduped, run].slice(-100)
  };
}
