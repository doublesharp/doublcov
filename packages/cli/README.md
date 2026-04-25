<div align="center">
  <img src="https://raw.githubusercontent.com/doublesharp/doublcov/main/docs/doublcov.png" alt="Doublcov report mark" width="132">
  <h1>@0xdoublesharp/doublcov</h1>
  <p><strong>Find what's missing in LCOV coverage.</strong></p>
  <p>
    Static, self-contained coverage reports with source browsing, uncovered navigation,
    history, diagnostics, syntax highlighting, themes, and declarative UI hooks.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@0xdoublesharp/doublcov"><img alt="npm" src="https://img.shields.io/npm/v/@0xdoublesharp/doublcov?color=2ea043"></a>
    <a href="https://github.com/doublesharp/doublcov/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/doublesharp/doublcov/ci.yml?branch=main&label=ci"></a>
    <a href="https://github.com/doublesharp/doublcov/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
  </p>
</div>

Build from an existing `lcov.info` file or run one of the built-in coverage builders first:

```bash
npx @0xdoublesharp/doublcov build --lcov lcov.info --sources src --out coverage/report
```

## What You Get

- A portable static report directory you can upload to CI artifacts or any static host.
- Built-in builders for Foundry, Hardhat, Vitest, Jest, Node/V8, pytest, Rust coverage tools, and gcov/lcov.
- Source-level navigation for uncovered lines, branch/function totals, parser diagnostics, and historical coverage.
- A GitHub Action, npm package, standalone binaries, and Docker image for different project shapes.

## Install

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

or:

```bash
pnpm dlx @0xdoublesharp/doublcov build
```

The executable is:

```bash
doublcov
```

## Commands

Build from existing LCOV:

```bash
doublcov build \
  --lcov lcov.info \
  --sources src \
  --out coverage/report
```

Run a builder and then build the report:

```bash
doublcov foundry -- --exclude-tests --ir-minimum
doublcov hardhat
doublcov vite
doublcov jest
doublcov v8
doublcov pytest
doublcov cargo-llvm-cov
doublcov cargo-tarpaulin
doublcov lcov-capture
```

Preview a report:

```bash
doublcov open coverage/report
```

Defaults:

- LCOV path: `lcov.info`
- source path: `src`
- output directory: `coverage/report`
- history file: `.doublcov/history.json`

## Supported Builders

- `foundry` / `forge`: runs `forge coverage --report lcov`
- `hardhat`: runs `npx hardhat coverage`
- `vite` / `vitest`: runs `npx vitest run --coverage --coverage.reporter=lcov`
- `jest`: runs `npx jest --coverage --coverageReporters=lcov`
- `c8` / `v8` / `node` / `node-test`: runs `npx c8 --reporter=lcov node --test`
- `pytest` / `python` / `coverage.py`: runs `python -m pytest --cov --cov-report=lcov:<path>`
- `cargo-llvm-cov` / `llvm-cov` / `rust`: runs `cargo llvm-cov --lcov --output-path <path>`
- `cargo-tarpaulin` / `tarpaulin`: runs `cargo tarpaulin --out Lcov`
- `lcov-capture` / `lcov` / `gcov` / `c` / `cpp`: runs `lcov --capture` for gcov-style C/C++ coverage data

For tools that always write `lcov.info` inside a report directory, `--lcov` must point to a path ending in `lcov.info`.

Pass arguments to the underlying builder after `--`:

```bash
doublcov forge -- --exclude-tests --ir-minimum
doublcov vite -- --runInBand
doublcov pytest -- tests/unit
doublcov cargo-llvm-cov -- --workspace
```

Builder integrations are built into this CLI. Adding a new builder requires a code change in the repository.

## Solidity

Foundry:

```json
{
  "scripts": {
    "coverage": "doublcov forge -- --exclude-tests --ir-minimum",
    "coverage:open": "doublcov forge --open -- --exclude-tests --ir-minimum"
  }
}
```

Hardhat:

```json
{
  "scripts": {
    "coverage": "doublcov hardhat",
    "coverage:open": "doublcov hardhat --open"
  }
}
```

From existing Hardhat LCOV:

```bash
npx hardhat coverage
doublcov build \
  --lcov coverage/lcov.info \
  --sources contracts \
  --out coverage/report
```

## JavaScript And TypeScript

```bash
doublcov vite
doublcov jest
doublcov v8
```

`v8` uses `c8` around Node's built-in test runner. Or build from existing LCOV:

```bash
doublcov build \
  --lcov coverage/lcov.info \
  --sources src \
  --extensions ts,tsx,js,jsx,mts,cts,mjs,cjs,vue
```

## Python, Rust, C, And C++

```bash
doublcov pytest
doublcov cargo-llvm-cov
doublcov cargo-tarpaulin
doublcov lcov-capture -- --rc branch_coverage=1
```

These builders assume the ecosystem coverage tool is installed in the project or environment: `pytest-cov` for Python, `cargo-llvm-cov` or `cargo-tarpaulin` for Rust, and `lcov` plus compiler-generated gcov data for C/C++.

## Diagnostics

Attach parser-tagged diagnostics:

```bash
doublcov build \
  --diagnostic foundry-debug:coverage.debug \
  --diagnostic foundry-bytecode:coverage.bytecode
```

Foundry aliases:

```bash
doublcov forge --debug coverage.debug --bytecode coverage.bytecode
```

## Themes And UI Hooks

Attach declarative report customization:

```bash
doublcov build \
  --customization doublcov.config.json \
  --theme ci-dark
```

Customization JSON can set `"open": true` to auto-open the generated `index.html` after `build` or builder commands. It can also define themes and declarative UI hook metadata for `report:header`, `report:summary`, `file:toolbar`, and `sidebar:panel`.

The CLI automatically loads `doublcov.config.json` from the current working directory when it exists. Use `--customization <path>` to override the path. An explicitly supplied customization path must exist.

Use `--open` or `--no-open` to override the config for one run.

## Output Hosting

The generated report directory is static. Open `coverage/report/index.html` directly from disk, or upload `coverage/report` to GitHub Pages, GitLab Pages, Netlify, Vercel, Cloudflare Pages, object storage, or CI artifacts.

## GitHub Action

For non-Node projects, use the repository action to download the standalone binary in CI:

```yaml
- uses: doublesharp/doublcov@<release-tag>
  with:
    version: <release-tag>
    command: build
    args: --lcov coverage/lcov.info --sources src --out coverage/report
```

Use the same release tag for the action ref and the `version` input. The
`version` input also accepts `latest`, but pinned tags make CI reproducible.

## Distribution

npm is the primary distribution channel for the CLI. Tagged GitHub Releases publish standalone binaries and checksums, the root GitHub Action wraps those binaries for any-language CI, and the Docker image is published for containerized workflows.

Additional docs:

- [Configuration](https://github.com/doublesharp/doublcov/blob/main/docs/CONFIGURATION.md)
- [CI and hosting](https://github.com/doublesharp/doublcov/blob/main/docs/CI.md)
- [Releasing](https://github.com/doublesharp/doublcov/blob/main/docs/RELEASING.md)
- [Extending Doublcov](https://github.com/doublesharp/doublcov/blob/main/docs/EXTENDING.md)
