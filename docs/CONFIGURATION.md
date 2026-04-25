# Configuration

Doublcov works without a config file. Use configuration when a report needs local workflow defaults, custom theme metadata, or declarative UI hooks.

## CLI Options

```bash
doublcov build \
  --lcov lcov.info \
  --sources src \
  --customization doublcov.config.json \
  --theme ci-dark
```

`--customization <path>` reads a JSON customization file. An explicitly supplied path must exist.

`--theme <id>` sets the default theme.

Local builds open the generated report by default. CI and the GitHub Action default to `--no-open`. Use `--open` or `--no-open` to override that behavior for a single run.

`--mode standalone` writes a self-contained `index.html` that works from disk and is the local default. `--mode static` writes split assets and lazy-loaded JSON for large reports and static hosting; CI defaults to static mode. Use `doublcov open coverage/report` to preview any report locally. It opens standalone reports directly and serves static reports from an available local port.

Doublcov automatically attempts to load `doublcov.config.json` from the current working directory. If the default file is absent, the build continues without customization. Theme and hook customization from the config is embedded into the generated report; workflow fields such as `mode`, `lcov`, `out`, `history`, `name`, and `open` only affect the CLI run.

## Default Precedence

For builder commands such as `doublcov forge`, `doublcov hardhat`, and `doublcov vite`, defaults are resolved in this order:

1. CLI flags such as `--lcov`, `--sources`, `--extensions`, `--out`, `--history`, and `--name`
2. `doublcov.config.json`
3. Builder or project config, including `package.json`, `foundry.toml`, Hardhat source paths, Jest config, Vitest config, c8 config, `.solcover.js`, and `pyproject.toml`
4. Built-in builder defaults
5. Generic Doublcov defaults

When a builder resolves an LCOV path and no report output directory is set, Doublcov writes the static report to a `report` directory next to that LCOV file. For example, `coverage/lcov.info` produces `coverage/report`.

## Customization Shape

```json
{
  "open": true,
  "mode": "standalone",
  "lcov": "coverage/lcov.info",
  "out": "coverage/report",
  "sources": ["src"],
  "extensions": ["ts", "tsx", "js", "jsx"],
  "history": ".doublcov/history.json",
  "name": "My Project",
  "defaultTheme": "ci-dark",
  "themes": [
    {
      "id": "ci-dark",
      "label": "CI Dark",
      "mode": "dark",
      "tokens": {
        "bg": "#0b1020",
        "panel": "#111827",
        "panel-soft": "#1f2937",
        "text": "#f9fafb",
        "muted": "#cbd5e1",
        "border": "#334155",
        "accent": "#38bdf8",
        "accent-strong": "#7dd3fc",
        "covered": "#123524",
        "partial": "#4c3b12",
        "uncovered": "#4a1f2a",
        "ignored": "#283548",
        "code-bg": "#090e1a"
      }
    }
  ],
  "hooks": [
    {
      "id": "docs",
      "hook": "report:header",
      "label": "Docs",
      "href": "https://example.test/docs"
    }
  ],
  "plugins": [
    {
      "id": "ci",
      "label": "CI",
      "hooks": [
        {
          "id": "run",
          "hook": "report:header",
          "label": "CI run",
          "href": "https://example.test/run/123"
        },
        {
          "id": "gate",
          "hook": "report:summary",
          "label": "Gate",
          "content": "passing"
        }
      ]
    }
  ]
}
```

## package.json

Node projects can put shared defaults in `package.json`:

```json
{
  "doublcov": {
    "out": "coverage/report",
    "builders": {
      "vitest": {
        "lcov": "coverage/unit/lcov.info",
        "sources": ["src", "packages"]
      }
    }
  }
}
```

Doublcov also reads common tool defaults from `package.json`, including `jest.coverageDirectory`, `vitest.coverage.reportsDirectory`, and `c8.report-dir`.

## Native Project Config

Foundry projects can set Doublcov defaults in `foundry.toml`:

```toml
[profile.default]
src = "contracts"

[profile.default.doublcov]
lcov = "coverage/foundry/lcov.info"
out = "coverage/foundry/report"
```

Hardhat config files are executable JavaScript or TypeScript, so Doublcov reads only simple static defaults without importing the config. It detects `paths.sources`, a simple `doublcov: { ... }` object, and `.solcover.js` `coverageDir` or `coverageDirectory` values. For complex Hardhat configs, prefer `package.json` or `doublcov.config.json`.

`mode`, `lcov`, `out`, `history`, `name`, and `open` are CLI workflow settings only. They are not embedded into the report JSON.

## Theme Tokens

Themes can override any subset of these tokens:

- `bg`
- `panel`
- `panel-soft`
- `text`
- `muted`
- `border`
- `accent`
- `accent-strong`
- `covered`
- `partial`
- `uncovered`
- `ignored`
- `code-bg`
- `syn-keyword`
- `syn-type`
- `syn-builtin`
- `syn-function`
- `syn-string`
- `syn-number`
- `syn-comment`
- `syn-literal`
- `syn-key`
- `syn-operator`
- `syn-punctuation`

Built-in themes are:

- `light`
- `dark`
- `contrast`
- `paper`

## UI Hooks

Hooks are declarative metadata rendered by the static web app. They are not executable browser plugins, and hook text is rendered as text rather than raw HTML.

Supported hook locations:

- `report:header`: top-bar links or labels
- `report:summary`: summary cards
- `file:toolbar`: selected-file badges or links
- `sidebar:panel`: sidebar information panels

Hook fields:

- `id`: stable hook identifier
- `hook`: hook location
- `label`: user-facing label
- `content`: optional text content
- `href`: optional link
- `filePath`: optional selected-file filter
- `language`: optional selected-language filter
- `priority`: optional sort order

Allowed `href` protocols are `https:`, `http:`, and `mailto:`. For production use, prefer HTTPS URLs.
