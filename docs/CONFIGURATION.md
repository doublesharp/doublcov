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

`--open` opens the generated report after a build. `--no-open` disables config-driven auto-open for that run.

Doublcov automatically attempts to load `doublcov.config.json` from the current working directory. If the default file is absent, the build continues without customization. If the default file is present, report customization is embedded into the generated report.

## Customization Shape

```json
{
  "open": true,
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

`open` is a CLI workflow setting only. It is not embedded into the report JSON.

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
