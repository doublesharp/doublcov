# Generic LCOV

For any tool that emits an `lcov.info` file. Use this when there is no built-in builder for your test runner, or when you want to keep coverage generation entirely separate from Doublcov.

## Prerequisites

- A coverage tool that produces standard LCOV (`lcov.info`)
- Node 22+ to run the Doublcov CLI

## Install

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

Or run without installing:

```bash
npx @0xdoublesharp/doublcov build --lcov lcov.info
```

## Quick start

```bash
your-coverage-tool                       # produces lcov.info
doublcov build \
  --lcov lcov.info \
  --sources src \
  --out coverage/report
```

## Passing arguments

There is no underlying tool to forward to. All Doublcov flags are passed directly:

```bash
doublcov build \
  --lcov coverage/lcov.info \
  --sources src,lib \
  --extensions ts,tsx,js,jsx \
  --out coverage/report \
  --name "My Project"
```

## package.json scripts

```json
{
  "scripts": {
    "coverage:report": "doublcov build --lcov coverage/lcov.info --sources src --out coverage/report",
    "coverage:ci": "doublcov build --lcov coverage/lcov.info --sources src --out coverage/report --no-open"
  }
}
```

Local `build` commands open the generated report by default. Use `--no-open` in scripts that run in CI.

## Manual LCOV path

This guide _is_ the manual LCOV path. The general shape:

```bash
doublcov build \
  --lcov <path-to-lcov.info> \
  --sources <comma-separated-source-roots> \
  --extensions <comma-separated-extensions> \
  --out <output-directory>
```

For tools that always write `lcov.info` inside a report directory, `--lcov` must point to a path ending in `lcov.info`.

## CI snippet

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: your-coverage-tool # produces coverage/lcov.info
- run: npx doublcov build --lcov coverage/lcov.info --sources src --out coverage/report
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **Files missing from the report.** LCOV records source paths as written by the coverage tool. If those paths are absolute or relative to a different root, pass `--sources` for each root or run `doublcov build` from the directory the tool used as its base.
- **Unknown language renders as plain text.** Add the file extension to `--extensions`. Doublcov will include the file but skip language-aware highlighting.
- **Multiple LCOV files.** Concatenate them first (`cat a.info b.info > lcov.info`) — the LCOV format is record-delimited and safely concatenable.
