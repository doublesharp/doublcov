<div align="center">
  <img src="docs/doublcov.png" alt="Doublcov report mark" width="132">
  <h1>Doublcov</h1>
  <p><strong>Find what's missing in LCOV coverage.</strong></p>
  <p>
    Static, self-contained coverage reports with source browsing, uncovered navigation,
    history, diagnostics, syntax highlighting, themes, and declarative UI hooks.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@0xdoublesharp/doublcov"><img alt="npm" src="https://img.shields.io/npm/v/@0xdoublesharp/doublcov?color=2ea043"></a>
    <a href="https://github.com/doublesharp/doublcov/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/doublesharp/doublcov/ci.yml?branch=main&label=ci"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
  </p>
</div>

Build from an existing `lcov.info` file or run one of the built-in coverage builders first:

```bash
npx @0xdoublesharp/doublcov build --lcov lcov.info --sources src
```

## What You Get

- A portable static report directory with a self-contained `index.html` you can open from disk or upload to any static host.
- Built-in builders for Foundry, Hardhat, Vitest, Jest, Node/V8, pytest, Rust coverage tools, and gcov/lcov.
- Source-level navigation for uncovered lines, branch/function totals, parser diagnostics, and historical coverage.
- A GitHub Action, npm package, standalone binaries, and Docker image for different project shapes.

## Install

For Node-based projects:

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

or:

```bash
pnpm add -D @0xdoublesharp/doublcov
```

Run without installing:

```bash
npx @0xdoublesharp/doublcov build
```

For non-Node projects, use the GitHub Action, standalone binaries, or Docker image from tagged releases. See [Releasing](docs/RELEASING.md).

## Quick Start

If your project already emits LCOV:

```bash
doublcov build \
  --lcov lcov.info \
  --sources src
```

Local builds open the generated `index.html` automatically. To skip opening a browser:

```bash
doublcov build --no-open
```

Open an existing report directory:

```bash
doublcov open coverage/report
```

Generic `build` defaults:

- LCOV: `lcov.info`
- sources: `src`
- output: `coverage/report`
- history: `.doublcov/history.json`
- optional config: `doublcov.config.json` when present

Builder commands also read ecosystem config and place the report next to the resolved LCOV file when `--out` is not set.

## Built-In Builders

Builder commands run a coverage tool and pass the generated LCOV into the same report builder.

```bash
doublcov forge -- --exclude-tests --ir-minimum
doublcov hardhat
doublcov vite
doublcov jest
doublcov v8
doublcov pytest
doublcov cargo-llvm-cov
doublcov cargo-tarpaulin
doublcov lcov-capture
```

Supported builder commands:

| Command                                    | Tool it runs                                         | Typical projects               |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| `foundry`, `forge`                         | `forge coverage --report lcov`                       | Solidity / Foundry             |
| `hardhat`                                  | `npx hardhat coverage`                               | Solidity / Hardhat             |
| `vite`, `vitest`                           | `npx vitest run --coverage --coverage.reporter=lcov` | Vite / Vitest                  |
| `jest`                                     | `npx jest --coverage --coverageReporters=lcov`       | Jest                           |
| `c8`, `v8`, `node`, `node-test`            | `npx c8 --reporter=lcov node --test`                 | Node test runner / V8 coverage |
| `pytest`, `python`, `coverage.py`          | `python -m pytest --cov --cov-report=lcov:<path>`    | Python / pytest-cov            |
| `cargo-llvm-cov`, `llvm-cov`, `rust`       | `cargo llvm-cov --lcov --output-path <path>`         | Rust                           |
| `cargo-tarpaulin`, `tarpaulin`             | `cargo tarpaulin --out Lcov`                         | Rust                           |
| `lcov-capture`, `lcov`, `gcov`, `c`, `cpp` | `lcov --capture`                                     | C / C++ gcov data              |

Builder arguments after `--` are passed to the underlying tool:

```bash
doublcov forge -- --match-path test/Foo.t.sol
doublcov cargo-llvm-cov -- --workspace
```

Builder integrations are built into the CLI. Adding a new builder requires a code change in this repository; see [Extending Doublcov](docs/EXTENDING.md).

## Usage Guides

Per-framework guides live in [docs/usage](docs/usage/README.md). Each one covers prerequisites, install, quick start, argument forwarding, package scripts, manual LCOV use, a CI snippet, and known gotchas.

- Solidity: [Foundry](docs/usage/foundry.md), [Hardhat](docs/usage/hardhat.md)
- JavaScript and TypeScript: [Jest](docs/usage/jest.md), [Vitest](docs/usage/vitest.md), [Node test runner with c8](docs/usage/c8.md)
- Python: [pytest](docs/usage/pytest.md)
- Rust: [cargo-llvm-cov](docs/usage/cargo-llvm-cov.md), [cargo-tarpaulin](docs/usage/cargo-tarpaulin.md)
- C and C++: [lcov-capture](docs/usage/lcov-capture.md)
- Any other tool: [Generic LCOV](docs/usage/generic-lcov.md)

## Languages

The report core is generic LCOV. Built-in source detection and syntax highlighting cover Solidity, C, C++, TypeScript, JavaScript, Python, Rust, Go, Java, C#, Kotlin, PHP, Ruby, Swift, Scala, Dart, Lua, R, shell, CSS, HTML/XML, Vue, JSON, YAML, TOML, and Markdown.

Unknown source files can still be included with `--extensions` and render as plain text.

## Configuration

Doublcov automatically reads `doublcov.config.json` from the current working directory when it exists. Use `--customization <path>` to choose another file; explicit paths must exist.

Configuration supports:

- `open` to control whether the generated `index.html` opens after `build` or builder commands
- `lcov`, `out`, `sources`, `extensions`, `history`, and `name` defaults
- `defaultTheme`
- custom `themes`
- declarative hooks for `report:header`, `report:summary`, `file:toolbar`, and `sidebar:panel`

Reports open automatically after local `build` and builder commands. CI and the GitHub Action default to `--no-open`. Use `--open` or `--no-open` to override that behavior for a single run.

For builder commands, default paths come from CLI flags first, then `doublcov.config.json`, then project config such as `package.json`, `foundry.toml`, Hardhat source paths, Jest/Vitest/c8 config, `.solcover.js`, or `pyproject.toml`. If no report output is configured, the report is written to a `report` directory next to the resolved LCOV file.

See [Configuration](docs/CONFIGURATION.md).

## Diagnostics

Diagnostics are optional parser-tagged files layered on top of LCOV. Foundry debug and bytecode diagnostics are built in:

```bash
doublcov build \
  --lcov lcov.info \
  --diagnostic foundry-debug:coverage.debug \
  --diagnostic foundry-bytecode:coverage.bytecode
```

Foundry aliases:

```bash
doublcov forge --debug coverage.debug --bytecode coverage.bytecode
```

## CI And Hosting

Reports are static directories with a self-contained `index.html`. Open `coverage/report/index.html` directly from disk, or upload `coverage/report` to CI artifacts, GitHub Pages, GitLab Pages, Cloudflare Pages, Netlify, Vercel, object storage, or any static file server.

GitHub Actions example:

```yaml
- uses: doublesharp/doublcov@v0
  with:
    command: build
    args: --lcov coverage/lcov.info --sources src --out coverage/report
```

Add `version: v0.2.1` when you want to pin the downloaded Doublcov binary instead of using the latest release.

Use the npm package for Node projects, the GitHub Action for language-neutral CI, standalone binaries for local non-Node use, and Docker when your CI standardizes on containers. See [CI And Hosting](docs/CI.md) and [Releasing](docs/RELEASING.md).

The GitHub Action passes `--no-open` by default. Add `--open` to `args` only when a workflow intentionally has a browser-capable environment.

## Development

```bash
pnpm install
pnpm run verify:publish
```

Build a local standalone binary:

```bash
pnpm run build:binary
./packages/cli/dist/bin/doublcov-macos-arm64 --help
```
