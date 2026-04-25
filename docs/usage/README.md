# Usage Guides

One guide per built-in builder. Each page covers prerequisites, install, quick start, argument forwarding, package scripts, manual LCOV use, a CI snippet, and known gotchas.

Builder commands open reports by default for local runs and default to `--no-open` in CI. Defaults resolve from CLI flags, then `doublcov.config.json`, then ecosystem config such as `package.json`, `foundry.toml`, Hardhat/Jest/Vitest/c8 config, `.solcover.js`, or `pyproject.toml`.

## Solidity

- [Foundry](foundry.md) — `doublcov forge`
- [Hardhat](hardhat.md) — `doublcov hardhat`

## JavaScript and TypeScript

- [Jest](jest.md) — `doublcov jest`
- [Vitest](vitest.md) — `doublcov vite`
- [Node test runner with c8](c8.md) — `doublcov v8`

## Python

- [pytest](pytest.md) — `doublcov pytest`

## Rust

- [cargo-llvm-cov](cargo-llvm-cov.md) — `doublcov cargo-llvm-cov`
- [cargo-tarpaulin](cargo-tarpaulin.md) — `doublcov cargo-tarpaulin`

## C and C++

- [lcov-capture (gcov)](lcov-capture.md) — `doublcov lcov-capture`

## Any other tool

- [Generic LCOV](generic-lcov.md) — `doublcov build --lcov ...`

## See also

- [CI And Hosting](../CI.md)
- [Configuration](../CONFIGURATION.md)
- [Releasing](../RELEASING.md)
- [Extending Doublcov](../EXTENDING.md)
