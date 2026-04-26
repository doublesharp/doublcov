# Releasing

Maintainer reference for cutting a Doublcov release. End-user install paths live in the [README](../README.md) and [usage guides](usage/README.md); CI integration lives in [CI And Hosting](CI.md).

## Release Channels

Every release tag (`v*`) publishes to all of:

| Channel         | Artifact                                                 |
| --------------- | -------------------------------------------------------- |
| npm             | `@0xdoublesharp/doublcov`                                |
| GitHub Releases | per-platform binaries + `SHA256SUMS`                     |
| GitHub Action   | [`action.yml`](../action.yml) (downloads release binary) |
| GHCR            | `ghcr.io/doublesharp/doublcov:<tag>` and `:latest`       |

Additional install channels should consume the tagged GitHub Release binaries and checksums.

## Release Workflow

Tagged stable semver pushes (`v*.*.*`) trigger [`.github/workflows/release.yml`](../.github/workflows/release.yml). Release tags are immutable version tags such as `v0.3.0`; moving major tags such as `v0` are maintained by the workflow and must not create releases themselves. The release jobs are:

1. **`verify`** — `pnpm run verify:publish` (build + typecheck + tests + npm-pack smoke).
2. **`binary`** — matrix across `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64`. Each runner builds its native standalone binary.
3. **`github-release`** — collects binary artifacts, generates `SHA256SUMS`, creates the GitHub Release with notes from `CHANGELOG.md`.
4. **`npm`** — installs the latest npm CLI and publishes `@0xdoublesharp/doublcov` with trusted-publishing provenance.
5. **`container`** — builds and pushes the multi-arch image to GHCR.
6. **`container-manifest`** — publishes the multi-arch `:<tag>` and `:latest` image manifests.
7. **`major-tag`** — after the release, npm, and container publish succeed, force-updates the moving major tag (`v0` for `v0.x.y`) to the released commit.

Pull requests and `main` pushes run [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`verify:publish` only, no artifacts).

## Action Major Tags

The GitHub Action should be documented with a moving major tag:

```yaml
- uses: doublesharp/doublcov@v0
```

The workflow updates `v0` after every successful stable `v0.x.y` release. Do not manually publish a GitHub Release for `v0`; it is only an action convenience tag.

Use the action `version` input to control which Doublcov binary the action downloads:

```yaml
- uses: doublesharp/doublcov@v0
  with:
    version: v0.4.0
```

Omit `version` to download the latest GitHub Release binary. Pin `version` in reproducible CI examples; omit it in quick-start examples where following the latest release is acceptable.

## Local Dry Run

```bash
pnpm install --frozen-lockfile
pnpm run verify:publish
npm publish ./packages/cli --access public --dry-run --ignore-scripts
pnpm run build:binary   # produces packages/cli/dist/bin/<host-binary>
```

The release workflow runs `verify:publish` before publishing, then uses `npm publish` from GitHub Actions so npm trusted publishing can exchange the workflow OIDC token for a short-lived publish token. Never run `publish` without `--dry-run` from a workstation for a real release — provenance must be signed by GitHub Actions.

## Artifact Details

**Binaries** are SEA-built single files with the web explorer assets embedded. Names:

- `doublcov-linux-x64`
- `doublcov-linux-arm64`
- `doublcov-windows-x64.exe`
- `doublcov-macos-x64`
- `doublcov-macos-arm64`

Builder subcommands still require their underlying tool on `PATH` (e.g. `doublcov forge` requires Foundry).

**Container** is built from [`Dockerfile`](../Dockerfile) on Node 22 Alpine. It ships the bundled CLI under `/opt/doublcov/dist` with a shim at `/usr/local/bin/doublcov`; it is not the SEA binary. Entrypoint `doublcov`, workdir `/work`.

**GitHub Action** is implemented by [`scripts/github-action.mjs`](../scripts/github-action.mjs). Inputs: `version`, `repository`, `command`, `args`, `install-only`. Output: `path`. Use the moving major action ref (`doublesharp/doublcov@v0`) for compatible action updates, and pin the downloaded CLI binary with the `version` input when reproducibility matters.

## Core Package

`@0xdoublesharp/doublcov-core` is marked `private: true` in the workspace. Publish only when external consumers need the LCOV parser/report model API. To publish: remove `private`, add full package metadata, and keep CLI and core versions aligned until the API stabilizes.
