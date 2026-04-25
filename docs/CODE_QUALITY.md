# Code Quality Standards

These standards apply to hand-maintained project code: `packages/*/src`,
`packages/*/test`, `apps/web/src`, `scripts`, configuration files, and
documentation examples. Generated outputs such as `dist`, `dist-types`,
`*.tsbuildinfo`, coverage output, packaged binaries, and copied web assets are
validated by rebuilding them, not by hand editing. Review generated diffs only
to confirm they match the source change that produced them.

## Baseline Checks

Every code change must pass the same workspace gate used by CI and release jobs:

```bash
pnpm run verify:publish
```

Use the narrower checks while iterating locally:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

## TypeScript

- Keep `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
  clean. Do not add suppression comments unless the code includes a short
  reason and a test covers the behavior.
- Prefer precise exported interfaces for package boundaries and local inferred
  types for implementation details.
- Use `unknown` plus validation for untrusted JSON, CLI inputs, browser state,
  and external process output.
- Preserve ESM conventions: source imports use explicit `.js` extensions where
  NodeNext package code requires them.
- Avoid ambient globals in package code. Pass dependencies as parameters when
  doing so improves testability.

## Runtime Behavior

- Validate user-controlled input at boundaries: CLI flags, paths, report
  customization JSON, URL fragments, stored browser state, HTTP request paths,
  and rendered report data.
- Errors should be actionable and include the relevant path, command, parser, or
  option value.
- Helpers named `*IfPresent` must return `undefined` for missing inputs and
  rethrow unexpected errors.
- File writes that update persistent state, such as history, should be atomic.
- Long-running child processes must surface start failures, non-zero exits, and
  signals.

## Tests

- Add focused tests for parser edge cases, path handling, security-sensitive
  behavior, and bug fixes.
- Keep fixture tests representative of real LCOV and language data.
- Tests should assert observable behavior rather than private implementation
  details.

## Web App

- Treat report JSON, source payloads, URL hashes, and `localStorage` as
  untrusted input.
- Keep derived state in `computed` values and side effects in `watch` or
  lifecycle handlers.
- Keep UI state stable for large reports: window long source files and virtualize
  long navigation lists.
- Render untrusted report content as escaped text, not raw HTML.
- Links must pass an explicit protocol allowlist before rendering.
- Theme customization may only write known CSS custom properties with validated
  values.

## Repository Hygiene

- Do not hand-edit generated artifacts. Rebuild them with the package scripts.
- Keep package scripts as the source of truth for build, typecheck, test, and
  publishing workflows.
- Prefer small, named helper functions when parsing or sanitizing data.
- Comments should explain non-obvious decisions, not restate the code.
