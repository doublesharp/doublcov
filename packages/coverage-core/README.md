# @0xdoublesharp/doublcov-core

Shared LCOV parsing and report modeling for Doublcov.

This package is intentionally builder-agnostic. It parses LCOV, detects source languages, applies language-specific ignored-line rules, parses optional diagnostics, builds report JSON, and appends coverage history.

## Workspace API

- `parseLcov(input)` parses LCOV records.
- `buildCoverageBundle(input)` builds report JSON and source payloads.
- `appendHistoryRun(history, report, metadata)` appends a coverage-history point.
- `registerLanguageDefinition(definition)` registers language detection and ignored-line rules for embedders.
- `sourceExtensionsForLanguages()` returns extensions from the current language registry.
- `registerDiagnosticParser(parser)` registers parser-tagged diagnostic inputs for embedders.
- `CoverageReportCustomization` describes safe theme tokens and declarative UI hook contributions.

## Package Boundaries

This package is private in the workspace. The registries are available to workspace packages and describe the embedding API shape. External projects should use the published `@0xdoublesharp/doublcov` CLI unless this core package is published with package metadata and stable exports. The CLI ships built-in builder integrations and does not dynamically load third-party builder packages.

Customization metadata is declarative JSON. It is meant for static report rendering and should not be treated as executable plugin code.
