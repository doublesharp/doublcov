# CI And Hosting

Doublcov reports are static artifacts. CI should generate LCOV, run Doublcov, then upload or publish the output directory.

CI environments default to `--no-open`, and the GitHub Action injects `--no-open` unless `args` already contains `--open` or `--no-open`.

## Generic CI Flow

```bash
doublcov build \
  --lcov lcov.info \
  --sources src \
  --no-open
```

Upload:

```text
coverage/report
```

In GitHub Actions, that directory stays on the runner unless the workflow uploads
or publishes it. To keep it as a downloadable workflow artifact:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: doublcov-report
    path: coverage/report
```

## GitHub Actions

For projects in any language, the official action downloads the release binary, verifies it, and runs Doublcov:

```yaml
- uses: doublesharp/doublcov@v0
  with:
    command: build
    args: --lcov coverage/lcov.info --sources src --out coverage/report
```

Use the moving major action ref for compatible action updates. Omit `version`
to download the latest GitHub Release binary, or set `version: v0.2.1` to pin
the downloaded CLI binary for reproducible CI.

To install `doublcov` into `PATH` and run multiple commands:

```yaml
- uses: doublesharp/doublcov@v0
  with:
    version: v0.2.1
    install-only: "true"

- run: doublcov build --lcov coverage/lcov.info --sources src --out coverage/report --no-open
```

## Per-Framework CI Snippets

Each [usage guide](usage/README.md) includes a minimal GitHub Actions snippet for that builder: [Foundry](usage/foundry.md), [Hardhat](usage/hardhat.md), [Jest](usage/jest.md), [Vitest](usage/vitest.md), [Node test runner with c8](usage/c8.md), [pytest](usage/pytest.md), [cargo-llvm-cov](usage/cargo-llvm-cov.md), [cargo-tarpaulin](usage/cargo-tarpaulin.md), [lcov-capture](usage/lcov-capture.md), and [generic LCOV](usage/generic-lcov.md).

## Pull Request Reports

For pull requests, upload the report directory as a CI artifact. This avoids publishing untrusted PR output to a public static site.

Recommended artifact path: `coverage/report`.

Builder commands may choose a different artifact path when project config changes the LCOV location. If `--out` is not set, Doublcov writes the report to a `report` directory beside the resolved LCOV file, for example `coverage/unit/lcov.info` -> `coverage/unit/report`.

## Main Branch Reports

For trusted main-branch builds, publish the report to a stable static host.

Good options:

- GitHub Pages
- GitLab Pages
- Cloudflare Pages
- Netlify
- Vercel
- S3, GCS, Azure Blob Storage, or compatible object storage

## History

Doublcov writes history to:

```text
.doublcov/history.json
```

For persistent history across CI runs, restore and save that file with your CI cache or store it in a branch/static bucket workflow. If history is not restored, each CI build still produces a valid current report.
