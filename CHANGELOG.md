# Changelog

## 0.3.0

Adds scalable static report output for large codebases while keeping single-file reports as the local default.

- Added `--mode standalone|static`. Local runs default to `standalone`; CI and GitHub Actions default to `static`.
- Updated `doublcov open` to auto-detect report output type. Standalone reports open from disk; static reports start a foreground local server on an available port.
- Added local static-report server timeout handling with an in-browser extend prompt, hidden unless the built-in server is active and close to expiry.
- Added shutdown messaging in the browser with a restart command for local static previews.
- Kept static output compatible with GitHub Pages and other static hosts by loading report JSON and per-file source payloads lazily.
- Normalized GitHub Actions absolute LCOV paths under `/home/runner/work/...` to repo-relative report paths.
- Updated release workflow/docs to maintain moving major action tags such as `v0`.

## 0.1.0

Initial release of Doublcov, a static LCOV coverage explorer for Solidity and general-purpose language projects.

This release includes the `doublcov` CLI, generic LCOV report generation, Foundry/Forge, Hardhat, and Vite/Vitest builder flows, language-aware source rendering, Solidity-specific coverage adjustments, diagnostics, history, theming, plugin UI customization hooks, and standalone binary build support.
