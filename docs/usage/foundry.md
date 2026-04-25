# Foundry

Builder name: `foundry` (alias: `forge`). Runs `forge coverage --report lcov` and feeds the result into Doublcov.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) on `PATH` (`forge --version` must work)
- Node 22+ to run the Doublcov CLI

## Install

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

Or with pnpm:

```bash
pnpm add -D @0xdoublesharp/doublcov
```

Or run without installing:

```bash
npx @0xdoublesharp/doublcov forge
```

## Quick start

```bash
doublcov forge -- --exclude-tests --ir-minimum
```

This runs `forge coverage`, writes LCOV to `coverage/lcov.info`, writes the report to `coverage/report`, updates history at `.doublcov/history.json`, and opens the report locally.

## Passing arguments to forge

Anything after `--` is forwarded to `forge coverage`:

```bash
doublcov forge -- --exclude-tests --ir-minimum --match-path 'src/**/*.sol'
```

Foundry diagnostic and bytecode reports can be attached:

```bash
doublcov forge \
  --debug coverage.debug \
  --bytecode coverage.bytecode \
  -- --exclude-tests --ir-minimum
```

## package.json scripts

```json
{
  "scripts": {
    "coverage": "doublcov forge -- --exclude-tests --ir-minimum",
    "coverage:ci": "doublcov forge --no-open -- --exclude-tests --ir-minimum"
  }
}
```

Doublcov also reads `[profile.default] src` and `[profile.default.doublcov]` defaults from `foundry.toml`.

## Manual LCOV path

If you already produce `coverage/lcov.info` from `forge coverage`:

```bash
forge coverage --report lcov --report-file coverage/lcov.info
doublcov build \
  --lcov coverage/lcov.info \
  --sources src \
  --out coverage/report
```

## CI snippet

```yaml
- uses: foundry-rs/foundry-toolchain@v1
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx doublcov forge -- --exclude-tests --ir-minimum
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **Inline assembly lines look uncovered.** Foundry does not reliably instrument inline assembly. Doublcov excludes those blocks from line totals automatically.
- **`forge coverage` is slow or OOMs.** `--ir-minimum` lowers compiler memory pressure substantially; keep it on for CI.
- **Tests count toward coverage.** Pass `--exclude-tests` to drop test contracts from totals.
