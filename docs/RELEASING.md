# Releasing

Maintainer reference for cutting a Doublcov release. End-user install paths live in the [README](../README.md) and [usage guides](usage/README.md); CI integration lives in [CI And Hosting](CI.md).

## Release Channels

Every release tag (`v*`) publishes to all of:

| Channel | Artifact |
| --- | --- |
| npm | `@0xdoublesharp/doublcov` |
| GitHub Releases | per-platform binaries + `SHA256SUMS` |
| GitHub Action | [`action.yml`](../action.yml) (downloads release binary) |
| GHCR | `ghcr.io/doublesharp/doublcov:<tag>` and `:latest` |

Additional install channels should consume the tagged GitHub Release binaries and checksums.

## Release Workflow

Tagged `v*` pushes trigger [`.github/workflows/release.yml`](../.github/workflows/release.yml). Five jobs, all gated on `verify`:

1. **`verify`** — `pnpm run verify:publish` (build + typecheck + tests + npm-pack smoke).
2. **`binary`** — matrix across `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64`. Each runner builds its native standalone binary.
3. **`github-release`** — collects binary artifacts, generates `SHA256SUMS`, creates the GitHub Release with notes from `CHANGELOG.md`.
4. **`npm`** — publishes `@0xdoublesharp/doublcov` with `--access public --provenance`.
5. **`container`** — builds and pushes the multi-arch image to GHCR.

Pull requests and `main` pushes run [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`verify:publish` only, no artifacts).

## Local Dry Run

```bash
pnpm install --frozen-lockfile
pnpm run verify:publish
pnpm --filter @0xdoublesharp/doublcov publish --access public --dry-run
pnpm run build:binary   # produces packages/cli/dist/bin/<host-binary>
```

`prepublishOnly` re-runs `verify:publish`, so the publish step can be invoked safely. Never run `publish` without `--dry-run` from a workstation — provenance must be signed by GitHub Actions.

## Artifact Details

**Binaries** are SEA-built single files with the web explorer assets embedded. Names:

- `doublcov-linux-x64`
- `doublcov-linux-arm64`
- `doublcov-windows-x64.exe`
- `doublcov-macos-x64`
- `doublcov-macos-arm64`

Builder subcommands still require their underlying tool on `PATH` (e.g. `doublcov forge` requires Foundry).

**Container** is built from [`Dockerfile`](../Dockerfile) on Node 22 Alpine. It ships the bundled CLI under `/opt/doublcov/dist` with a shim at `/usr/local/bin/doublcov`; it is not the SEA binary. Entrypoint `doublcov`, workdir `/work`.

**GitHub Action** is implemented by [`scripts/github-action.mjs`](../scripts/github-action.mjs). Inputs: `version`, `repository`, `command`, `args`, `install-only`. Output: `path`. Pin via the `version` input rather than the action ref so the action and binary versions stay decoupled.

## Core Package

`@0xdoublesharp/doublcov-core` is marked `private: true` in the workspace. Publish only when external consumers need the LCOV parser/report model API. To publish: remove `private`, add full package metadata, and keep CLI and core versions aligned until the API stabilizes.
