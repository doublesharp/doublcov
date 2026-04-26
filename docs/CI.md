# CI And Hosting

Doublcov reports are static artifacts. CI should generate LCOV, run Doublcov, then upload or publish the output directory.

CI environments default to `--mode static` and `--no-open`. Static mode keeps `index.html`, assets, `data/report.json`, and per-file source payloads as separate files so large reports do not have to parse one huge HTML file up front. The GitHub Action injects `--no-open` unless `args` already contains `--open` or `--no-open`.

## Generic CI Flow

```bash
doublcov build \
  --lcov lcov.info \
  --sources src \
  --mode static \
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
to download the latest GitHub Release binary, or set `version: v0.4.2` to pin
the downloaded CLI binary for reproducible CI.

To install `doublcov` into `PATH` and run multiple commands:

```yaml
- uses: doublesharp/doublcov@v0
  with:
    version: v0.4.2
    install-only: "true"

- run: doublcov build --lcov coverage/lcov.info --sources src --out coverage/report --no-open
```

## Local Preview

Static reports need an HTTP origin for lazy-loaded JSON. Preview them locally with:

```bash
doublcov open coverage/report
```

`open` detects the report type. Standalone reports open directly from disk; static reports bind to an available `127.0.0.1` port, open the browser, and run in the foreground. Static preview stops on Ctrl+C or after 30 minutes. The served page shows a prompt that can extend the timeout.

Published reports include OpenGraph and Twitter card metadata plus a bundled preview image. Discord, Telegram, Slack, and similar clients will unfurl the link when the report is reachable over public HTTP(S). Workflow artifacts, `localhost`, and `file://` URLs are not crawlable by those services.

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

### GitHub Pages At `/coverage/`

Use static mode for Pages. Publish `coverage/report` under a `coverage`
subdirectory in the Pages artifact, and add a root redirect so the site root can
forward to the report:

```yaml
- uses: doublesharp/doublcov@v0
  with:
    command: build
    args: --lcov coverage/lcov.info --sources src --out coverage/report --mode static

- run: |
    mkdir -p pages/coverage
    cp -R coverage/report/. pages/coverage/
    printf '%s\n' '<!doctype html><meta http-equiv="refresh" content="0; url=coverage/">' > pages/index.html

- uses: actions/upload-pages-artifact@v3
  with:
    path: pages

- uses: actions/deploy-pages@v5
```

The Doublcov repository dogfoods this flow in
`.github/workflows/coverage.yml`: pull requests upload `doublcov-report`, while
main-branch runs publish the same static report to GitHub Pages at `/coverage/`.

## History

Doublcov writes history to:

```text
.doublcov/history.json
```

For persistent history across CI runs, restore and save that file with your CI cache or store it in a branch/static bucket workflow. If history is not restored, each CI build still produces a valid current report.
