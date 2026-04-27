# Changelog

## 0.4.3

Fixes Rust coverage false-positives from duplicate LLVM monomorphization records and tightens the core verification path.

- Collapsed duplicate Rust v0 function entries that differ only by crate disambiguator, both within a single LCOV record and when multiple LCOV records merge into one source file.
- Prevented phantom uncovered Rust functions from appearing on covered lines in workspace-style LLVM LCOV output.
- Expanded parser and report integration coverage around duplicate-function handling and replaced the last optional core fixture test with a deterministic in-repo path.
- Refreshed Rust and generic LCOV troubleshooting docs, plus pinned release examples, for the `v0.4.3` release.

## 0.4.2

Improves hosted report previews and keeps the release docs aligned with the next tag.

- Added OpenGraph and Twitter card metadata plus a bundled preview image to the web document so publicly hosted reports unfurl cleanly in chat clients.
- Covered the preview metadata behavior in the web and CLI test suites.
- Updated package versions and pinned action examples for the `v0.4.2` release.

## 0.4.1

Fixes the standalone-binary release build so v0.4.x SEA artifacts can ship.

- Replaced top-level `await` in the bin entry with a fire-and-forget call so the SEA build's CJS bundle compiles. `run()` already catches every error and sets `process.exitCode`, so the await wasn't doing useful work.
- Aligned ESLint type-aware rules between `.ts` source files and `.vue` files so CI doesn't surface a wall of `no-unsafe-*` errors when type resolution collapses to `any` in the GitHub-hosted runner environment.

## 0.4.0

Hardens the CLI, report pipeline, and static viewer while tightening release quality gates.

- Improved project config parsing, CLI validation, LCOV/diagnostic parsing, static report serving, and several report edge cases.
- Expanded automated verification with broader unit coverage, property-based fuzzing, Playwright E2E coverage, and mutation testing for core logic.
- Added release quality tooling for ESLint, knip, madge, and publish verification, and refreshed related CI/workflow behavior.

## 0.3.2

Fixes CI coverage generation from fresh checkouts by building the core package before workspace LCOV tests consume its package exports.

## 0.3.1

Fixes GitHub Pages coverage dogfooding and improves generated report readability.

- Added a Doublcov GitHub Actions workflow that publishes this repository's coverage report to GitHub Pages at `/coverage/`.
- Added a workspace LCOV generation script for merged Vitest coverage with monorepo-safe source paths.
- Replaced likely compiler-mangled function symbols with source-derived function names, or a neutral `Function at line N` fallback, across Rust, C++/MSVC, and Swift-style symbols.
- Updated uncovered navigator rows to use trimmed display paths.
- Added retry handling for transient GitHub Release asset download failures in the GitHub Action.

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
