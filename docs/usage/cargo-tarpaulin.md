# cargo-tarpaulin

Builder names: `cargo-tarpaulin` (alias: `tarpaulin`). Runs `cargo tarpaulin --out Lcov` and feeds the produced LCOV into Doublcov.

Tarpaulin is Linux-x86_64 first; for macOS or Windows prefer [`cargo-llvm-cov`](cargo-llvm-cov.md).

## Prerequisites

- Rust toolchain with [`cargo-tarpaulin`](https://github.com/xd009642/tarpaulin) installed
- Linux x86_64 (other platforms have varying support)
- Node 22+ to run the Doublcov CLI

```bash
cargo install cargo-tarpaulin
```

## Install

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

## Quick start

```bash
doublcov cargo-tarpaulin
```

Default output: `coverage/report`, unless Tarpaulin or Doublcov config resolves a different LCOV/report path. Local runs open the report by default.

## Passing arguments to cargo tarpaulin

Forward arguments after `--`:

```bash
doublcov cargo-tarpaulin -- --workspace --engine llvm
```

## Project scripts

`Makefile`:

```make
.PHONY: coverage
coverage:
	npx doublcov cargo-tarpaulin

.PHONY: coverage-ci
coverage-ci:
	npx doublcov cargo-tarpaulin --no-open
```

## Manual LCOV path

Tarpaulin writes `lcov.info` into the working directory (or the path set by `--output-dir`):

```bash
cargo tarpaulin --out Lcov --output-dir coverage
doublcov build \
  --lcov coverage/lcov.info \
  --sources src \
  --extensions rs \
  --out coverage/report
```

## CI snippet

```yaml
- uses: dtolnay/rust-toolchain@stable
- uses: taiki-e/install-action@cargo-tarpaulin
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx doublcov cargo-tarpaulin
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **macOS or Windows failures.** Tarpaulin's ptrace engine is Linux-only. Try `--engine llvm`, or switch to [`cargo-llvm-cov`](cargo-llvm-cov.md).
- **Tests run twice.** Disable parallel tarpaulin invocations from other build steps; tarpaulin reruns the test binary under instrumentation.
- **LCOV path mismatch.** If you set `--output-dir`, point `--lcov` at the matching path on the manual LCOV path.
- **Phantom uncovered Rust functions on covered lines.** When Tarpaulin's LLVM-based paths emit duplicate Rust v0 monomorphizations that only differ by crate disambiguator, Doublcov collapses them automatically. If you still see duplicate uncovered functions, confirm you are on a current Doublcov release and capture a fresh LCOV file.
