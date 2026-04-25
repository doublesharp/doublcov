# Extending Doublcov

Doublcov is structured around a generic LCOV core, a CLI package, and a static web app.

## Package Boundaries

- `@0xdoublesharp/doublcov-core`: LCOV parsing, report building, language registry, diagnostic parser registry, history. This package is private in this workspace.
- `@0xdoublesharp/doublcov`: CLI, builder integrations, filesystem collection, static report generation, and browser-opening helpers.
- `@0xdoublesharp/doublcov-web`: static Vue report explorer bundled into the CLI package.

## Workspace Extension Points

The core package contains extension APIs for applications that embed it from this workspace:

- `registerLanguageDefinition`
- `sourceExtensionsForLanguages`
- `registerDiagnosticParser`
- `buildCoverageBundle`
- `CoverageReportCustomization`

These APIs are useful when another tool wants to consume LCOV and build Doublcov-compatible report JSON. If `@0xdoublesharp/doublcov-core` becomes a published package, keep this list aligned with the public package exports.

## CLI Extension Boundary

The CLI has internal builder integration modules for Foundry, Hardhat, Vite/Vitest, Jest, Node/V8 through c8, Pytest, cargo-llvm-cov, cargo-tarpaulin, and lcov/gcov capture. The registry is internal to the CLI package.

That means:

- New builders require a code change in this repository.
- There is no runtime plugin discovery.
- There is no `doublcov plugin add` command.
- There is no npm package naming convention for third-party builder plugins yet.

This keeps the production surface focused while the report schema, CLI flags, and builder contract evolve.

## Runtime Plugin Considerations

A runtime plugin system would need to define:

- package discovery, for example `doublcov.plugins` in `package.json`
- builder registration
- language registration
- diagnostic parser registration
- customization contributions
- version compatibility checks
- safe loading rules for local CI

Builder plugin shape should stay close to the internal model:

```ts
interface CoverageBuilderPlugin {
  id: string;
  aliases: string[];
  label: string;
  description: string;
  defaultLcov?: string;
  defaultSources?: string[];
  defaultExtensions?: string[];
  prepareRun(options: BuilderOptions): Promise<PreparedBuilderRun>;
}
```

## Adding Built-In Builder Integrations

Add built-in builders under:

```text
packages/cli/src/builders
```

Required steps:

1. Add a builder module.
2. Register it in `packages/cli/src/builders/registry.ts`.
3. Add argument/default tests in `packages/cli/test`.
4. Document it in `README.md` and `packages/cli/README.md`.
5. Add a fixture or smoke test if the builder has custom behavior.

## Adding Language Support

For core language detection, update:

```text
packages/coverage-core/src/languages.ts
```

For web syntax highlighting, update:

```text
apps/web/src/syntax.ts
```

For confidence, add fixtures under:

```text
fixtures/languages
```

and tests under:

```text
packages/coverage-core/test
```
