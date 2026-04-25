# Vitest

Builder name: `vite` (alias: `vitest`). Runs `npx vitest run --coverage --coverage.reporter=lcov` and feeds the produced LCOV into Doublcov.

## Prerequisites

- [Vitest](https://vitest.dev/) and a coverage provider installed
- Node 22+

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

`@vitest/coverage-istanbul` works too.

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
doublcov vite
```

Default output: `coverage/report`, unless Vitest or Doublcov config resolves a different LCOV/report path. Local runs open the report by default.

## Passing arguments to vitest

Forward arguments after `--`:

```bash
doublcov vite -- --run --reporter verbose src/lib
```

## package.json scripts

```json
{
  "scripts": {
    "coverage": "doublcov vite",
    "coverage:ci": "doublcov vite --no-open"
  }
}
```

Doublcov reads Vitest coverage defaults from `package.json` `vitest.coverage.reportsDirectory` and simple `coverage.reportsDirectory` values in `vitest.config.*` or `vite.config.*`.

## Manual LCOV path

```bash
npx vitest run --coverage --coverage.reporter=lcov
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
- run: npx doublcov vite
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **No coverage provider installed.** Install `@vitest/coverage-v8` or `@vitest/coverage-istanbul`. Vitest will error otherwise.
- **`lcov.info` ends up under a nested directory.** Vitest writes `coverage/lcov.info` by default. If you customize `coverage.reportsDirectory`, Doublcov will use that value when it can read it statically; otherwise pass `--lcov` explicitly.
- **Vue, Svelte, JSX files missing from output.** Pass `--extensions ts,tsx,js,jsx,vue,svelte` to `doublcov build` when using the manual LCOV path.
