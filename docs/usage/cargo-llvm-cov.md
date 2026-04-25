# cargo-llvm-cov

Builder names: `cargo-llvm-cov` (aliases: `llvm-cov`, `rust`). Runs `cargo llvm-cov --lcov --output-path <path>` and feeds the produced LCOV into Doublcov.

## Prerequisites

- Rust toolchain with [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov) installed
- `llvm-tools-preview` rustup component
- Node 22+ to run the Doublcov CLI

```bash
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov
```

## Install

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

Or use without installing:

```bash
npx @0xdoublesharp/doublcov cargo-llvm-cov
```

## Quick start

```bash
doublcov cargo-llvm-cov
```

Default output: `coverage/report`.

## Passing arguments to cargo llvm-cov

Forward arguments after `--`:

```bash
doublcov cargo-llvm-cov -- --workspace --all-features
```

## Project scripts

A `Makefile` target:

```make
.PHONY: coverage
coverage:
	npx doublcov cargo-llvm-cov

.PHONY: coverage-open
coverage-open:
	npx doublcov cargo-llvm-cov --open
```

Or `cargo` aliases in `.cargo/config.toml`:

```toml
[alias]
coverage = "run --quiet --manifest-path tools/coverage/Cargo.toml"
```

(Cargo aliases cannot invoke npm scripts directly; use a Makefile or shell wrapper.)

## Manual LCOV path

```bash
cargo llvm-cov --lcov --output-path lcov.info
doublcov build \
  --lcov lcov.info \
  --sources src \
  --extensions rs \
  --out coverage/report
```

## CI snippet

```yaml
- uses: dtolnay/rust-toolchain@stable
  with:
    components: llvm-tools-preview
- uses: taiki-e/install-action@cargo-llvm-cov
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx doublcov cargo-llvm-cov
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **`llvm-tools-preview` missing.** `cargo-llvm-cov` will error during instrumentation. Install with `rustup component add llvm-tools-preview`.
- **Workspace coverage incomplete.** Pass `-- --workspace` to include all crates.
- **Doctests excluded.** `cargo llvm-cov` does not measure doctests by default; pass `-- --doctests` (requires nightly) when needed.
