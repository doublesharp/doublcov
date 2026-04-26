import type {
  CoverageHookContribution,
  CoverageStatus,
  CoverageTheme,
  SourceFileCoverage,
  UncoveredItem,
  UncoveredKind,
} from "@0xdoublesharp/doublcov-core";

export function mergeThemes(
  baseThemes: CoverageTheme[],
  customThemes: CoverageTheme[],
): CoverageTheme[] {
  const themesById = new Map<string, CoverageTheme>();
  for (const candidate of [...baseThemes, ...customThemes]) {
    if (!candidate.id || !candidate.label) continue;
    const existing = themesById.get(candidate.id);
    themesById.set(candidate.id, {
      ...existing,
      ...candidate,
      tokens: {
        ...(existing?.tokens ?? {}),
        ...candidate.tokens,
      },
    });
  }
  return [...themesById.values()];
}

export function sortHooks(
  hooks: CoverageHookContribution[],
): CoverageHookContribution[] {
  return [...hooks].sort(
    (a, b) =>
      (a.priority ?? 100) - (b.priority ?? 100) ||
      a.label.localeCompare(b.label),
  );
}

export function hookMatchesFile(
  hook: CoverageHookContribution,
  file: Pick<SourceFileCoverage, "path" | "displayPath" | "language"> | null,
): boolean {
  if (!file) return false;
  if (
    hook.filePath &&
    hook.filePath !== file.path &&
    hook.filePath !== file.displayPath
  )
    return false;
  if (hook.language && hook.language !== file.language) return false;
  return true;
}

const coverageClassByStatus: Record<CoverageStatus, string> = {
  covered: "bg-[var(--covered)]",
  partial: "bg-[var(--partial)]",
  uncovered: "bg-[var(--uncovered)]",
  ignored: "ignored-line",
  neutral: "",
};

export function coverageClass(status: CoverageStatus | undefined): string {
  return coverageClassByStatus[status ?? "neutral"];
}

export function selectionClass(
  lineNumber: number,
  selectedLine: number | null,
  range: { start: number; end: number } | null,
): string {
  if (!range) return selectedLine === lineNumber ? "selected-line" : "";
  if (lineNumber < range.start || lineNumber > range.end) return "";
  return [
    "selected-uncovered-section",
    lineNumber === range.start ? "selected-uncovered-section-start" : "",
    lineNumber === range.end ? "selected-uncovered-section-end" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function isLikelyMangledSymbol(value: string): boolean {
  return (
    /^_R[A-Za-z0-9_.$]+$/.test(value) ||
    /^_Z[A-Za-z0-9_.$]+/.test(value) ||
    /^__Z[A-Za-z0-9_.$]+/.test(value) ||
    /^\?[A-Za-z_@$?][A-Za-z0-9_@$?]*@@/.test(value) ||
    /^_?\$[sS][A-Za-z0-9_.$]+/.test(value)
  );
}

export function displayUncoveredItemLabel(item: UncoveredItem): string {
  if (item.kind !== "function" || !isLikelyMangledSymbol(item.label)) {
    return item.label;
  }
  return `Function at line ${item.line}`;
}

export function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseBoundedInteger(
  value: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function parseUncoveredKind(
  value: string | null,
): UncoveredKind | "all" {
  if (value === "line" || value === "branch" || value === "function")
    return value;
  return "all";
}

export interface HashState {
  selectedFileId: string;
  selectedLine: number | null;
  selectedKind: UncoveredKind | "all";
  search: string;
  uncoveredOnly: boolean;
  navigatorCurrentFileOnly: boolean;
}

export function parseHashState(hash: string): HashState {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    selectedFileId: params.get("file") ?? "",
    selectedLine: parsePositiveInteger(params.get("line")),
    selectedKind: parseUncoveredKind(params.get("kind")),
    search: params.get("q") ?? "",
    uncoveredOnly: params.get("uncovered") !== "0",
    navigatorCurrentFileOnly: params.get("navFile") !== "0",
  };
}

export function buildHashFragment(state: HashState): string {
  const params = new URLSearchParams();
  if (state.selectedFileId) params.set("file", state.selectedFileId);
  if (state.selectedLine) params.set("line", String(state.selectedLine));
  if (state.selectedKind !== "all") params.set("kind", state.selectedKind);
  if (state.search) params.set("q", state.search);
  if (!state.uncoveredOnly) params.set("uncovered", "0");
  if (!state.navigatorCurrentFileOnly) params.set("navFile", "0");
  return params.toString();
}
