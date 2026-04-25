export { buildCoverageBundle, normalizePath } from "./report.js";
export { appendHistoryRun, HISTORY_SCHEMA_VERSION } from "./history.js";
export {
  COVERAGE_THEME_TOKENS,
  COVERAGE_UI_HOOKS,
  isCoverageThemeToken,
  isSafeThemeTokenValue,
  sanitizeCoverageHref,
  sanitizeCoverageReportCustomization
} from "./customization.js";
export {
  DIAGNOSTIC_PARSERS,
  parseDiagnostics,
  parseFoundryBytecodeReport,
  parseFoundryDebugReport,
  registerDiagnosticParser,
  resolveDiagnosticParser
} from "./diagnostics.js";
export {
  DEFAULT_SOURCE_EXTENSIONS,
  LANGUAGE_DEFINITIONS,
  detectIgnoredLines,
  detectSourceLanguage,
  registerLanguageDefinition,
  resolveLanguageDefinition,
  sourceExtensionsForLanguages,
  sourceLanguageLabel
} from "./languages.js";
export { parseLcov } from "./lcov.js";
export type * from "./types.js";
