# Hardhat

Builder name: `hardhat`. Runs `npx hardhat coverage` (which uses `solidity-coverage`) and feeds the produced LCOV into Doublcov.

## Prerequisites

- [Hardhat](https://hardhat.org/) project with [`solidity-coverage`](https://github.com/sc-forks/solidity-coverage) installed
- Node 22+

```bash
npm install --save-dev hardhat solidity-coverage
```

`solidity-coverage` must be loaded in `hardhat.config.{ts,js}`:

```ts
import "solidity-coverage";
```

## Install

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

Or:

```bash
pnpm add -D @0xdoublesharp/doublcov
```

## Quick start

```bash
doublcov hardhat
```

Default output: `coverage/report`, unless Hardhat/solidity-coverage or Doublcov config resolves a different LCOV/report path. History: `.doublcov/history.json`. Local runs open the report by default.

## Passing arguments to hardhat

Forward arguments after `--`:

```bash
doublcov hardhat -- --testfiles 'test/unit/**/*.ts'
```

## package.json scripts

```json
{
  "scripts": {
    "coverage": "doublcov hardhat",
    "coverage:ci": "doublcov hardhat --no-open"
  }
}
```

Doublcov reads simple static defaults from Hardhat config without importing executable config code: `paths.sources`, a simple `doublcov: { ... }` object, and `.solcover.js` `coverageDir` / `coverageDirectory`.

## Manual LCOV path

`solidity-coverage` writes `coverage/lcov.info`:

```bash
npx hardhat coverage
doublcov build \
  --lcov coverage/lcov.info \
  --sources contracts \
  --out coverage/report
```

## CI snippet

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx doublcov hardhat
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **`solidity-coverage` not found.** Install it as a dev dependency and import it in your Hardhat config.
- **`coverage/lcov.info` is missing.** Confirm `npx hardhat coverage` exits successfully on its own first; Doublcov only consumes its output.
- **Custom contracts directory.** Pass `--sources <dir>` if your contracts are not in `contracts/`.
