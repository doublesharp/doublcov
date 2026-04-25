export type CoverageStatus =
  | "covered"
  | "partial"
  | "uncovered"
  | "ignored"
  | "neutral";

export interface CoverageTotals {
  found: number;
  hit: number;
  percent: number;
}

export interface BranchDetail {
  id: string;
  line: number;
  block: string;
  branch: string;
  taken: number | null;
}

export interface FunctionDetail {
  name: string;
  line: number;
  endLine?: number;
  hits: number;
}

export interface LineCoverage {
  line: number;
  hits: number;
  branches: BranchDetail[];
  status: CoverageStatus;
}

export type KnownSourceLanguage =
  | "solidity"
  | "cpp"
  | "c"
  | "typescript"
  | "javascript"
  | "rust"
  | "python"
  | "go"
  | "java"
  | "csharp"
  | "kotlin"
  | "php"
  | "ruby"
  | "swift"
  | "scala"
  | "dart"
  | "lua"
  | "r"
  | "shell"
  | "css"
  | "html"
  | "xml"
  | "vue"
  | "json"
  | "yaml"
  | "toml"
  | "markdown"
  | "plain";

export type SourceLanguage = KnownSourceLanguage | (string & {});

export type KnownIgnoredLineReason = "solidity-assembly";

export type IgnoredLineReason = KnownIgnoredLineReason | (string & {});

export interface IgnoredLine {
  line: number;
  reason: IgnoredLineReason;
  label: string;
}

export interface SourceFileCoverage {
  id: string;
  path: string;
  displayPath: string;
  language: SourceLanguage;
  lineCount: number;
  lines: LineCoverage[];
  functions: FunctionDetail[];
  totals: {
    lines: CoverageTotals;
    functions: CoverageTotals;
    branches: CoverageTotals;
  };
  uncovered: {
    lines: number[];
    functions: FunctionDetail[];
    branches: BranchDetail[];
  };
  ignored: {
    lines: IgnoredLine[];
    byReason: Record<string, number>;
    assemblyLines: number[];
  };
  searchText: string;
  sourceDataPath: string;
}

export interface SourceFilePayload {
  id: string;
  path: string;
  language: SourceLanguage;
  lines: string[];
}

export type UncoveredKind = "line" | "function" | "branch";

export interface UncoveredItem {
  id: string;
  kind: UncoveredKind;
  fileId: string;
  filePath: string;
  line: number;
  label: string;
  detail: string;
}

export interface CoverageDiagnostic {
  id: string;
  source: string;
  severity: "info" | "warning";
  filePath?: string;
  line?: number;
  message: string;
}

export interface DiagnosticInput {
  parser: string;
  content: string;
}

export type CoverageThemeMode = "light" | "dark";

export interface CoverageTheme {
  id: string;
  label: string;
  mode?: CoverageThemeMode;
  tokens: Partial<Record<CoverageThemeToken, string>>;
}

export type CoverageThemeToken =
  | "bg"
  | "panel"
  | "panel-soft"
  | "text"
  | "muted"
  | "border"
  | "accent"
  | "accent-strong"
  | "covered"
  | "partial"
  | "uncovered"
  | "ignored"
  | "code-bg"
  | "syn-keyword"
  | "syn-type"
  | "syn-builtin"
  | "syn-function"
  | "syn-string"
  | "syn-number"
  | "syn-comment"
  | "syn-literal"
  | "syn-key"
  | "syn-operator"
  | "syn-punctuation";

export type CoverageUiHook =
  | "report:header"
  | "report:summary"
  | "file:toolbar"
  | "sidebar:panel";

export interface CoverageHookContribution {
  id: string;
  hook: CoverageUiHook;
  label: string;
  content?: string;
  href?: string;
  filePath?: string;
  language?: string;
  priority?: number;
}

export interface CoveragePluginCustomization {
  id: string;
  label?: string;
  hooks?: CoverageHookContribution[];
}

export interface CoverageReportCustomization {
  defaultTheme?: string;
  themes?: CoverageTheme[];
  hooks?: CoverageHookContribution[];
  plugins?: CoveragePluginCustomization[];
}

export interface CoverageRun {
  id: string;
  timestamp: string;
  commit?: string;
  branch?: string;
  totals: CoverageReport["totals"];
  files: Array<{
    path: string;
    lines: CoverageTotals;
    functions: CoverageTotals;
    branches: CoverageTotals;
    uncovered: {
      lines: number;
      functions: number;
      branches: number;
    };
  }>;
}

export interface CoverageHistory {
  schemaVersion: 1;
  runs: CoverageRun[];
}

export interface CoverageReport {
  schemaVersion: 1;
  generatedAt: string;
  projectName?: string;
  projectRoot?: string;
  totals: {
    lines: CoverageTotals;
    functions: CoverageTotals;
    branches: CoverageTotals;
  };
  files: SourceFileCoverage[];
  uncoveredItems: UncoveredItem[];
  ignored: {
    lines: number;
    byReason: Record<string, number>;
    assemblyLines: number;
  };
  diagnostics: CoverageDiagnostic[];
  customization?: CoverageReportCustomization;
  history: CoverageHistory;
}

export interface BuildReportInput {
  lcov: string;
  sourceFiles: Array<{
    path: string;
    content: string;
  }>;
  diagnostics?: DiagnosticInput[];
  customization?: CoverageReportCustomization;
  /**
   * Previous history loaded from disk. The `schemaVersion` field may be missing
   * on history files written by older releases; runs are migrated transparently.
   */
  history?: { schemaVersion?: number; runs: CoverageRun[] };
  projectName?: string;
  projectRoot?: string;
  commit?: string;
  branch?: string;
}
