# Jest

Builder name: `jest`. Runs `npx jest --coverage --coverageReporters=lcov` and feeds the produced LCOV into Doublcov.

## Prerequisites

- [Jest](https://jestjs.io/) installed in the project
- Node 22+

```bash
npm install --save-dev jest
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
doublcov jest
```

Default output: `coverage/report`, unless Jest or Doublcov config resolves a different LCOV/report path. Local runs open the report by default.

## Passing arguments to jest

Forward arguments after `--`:

```bash
doublcov jest -- --runInBand --testPathPattern src/lib
```

## package.json scripts

```json
{
  "scripts": {
    "coverage": "doublcov jest",
    "coverage:ci": "doublcov jest --no-open"
  }
}
```

Doublcov reads Jest coverage defaults from `package.json` `jest.coverageDirectory`, `jest.config.json`, or simple static `coverageDirectory` values in `jest.config.*`.

## Manual LCOV path

```bash
npx jest --coverage --coverageReporters=lcov
doublcov build \
  --lcov coverage/lcov.info \
  --sources src \
  --out coverage/report
```

## CI snippet

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx doublcov jest
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **`coverage/lcov.info` not produced.** Confirm `coverageReporters` in `jest.config.*` does not override the CLI flag. The builder passes `--coverageReporters=lcov` but a config that explicitly sets only `text` or `html` may suppress it. Add `lcov` to your reporter list.
- **TypeScript files show as uncovered.** Ensure `transform` is configured (e.g. `ts-jest` or `babel-jest`); Jest cannot instrument files it cannot load.
- **Monorepo roots.** Run from the package directory or pass `-- --rootDir <pkg>` so Jest resolves the right config.
