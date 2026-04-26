import type {
  CoverageHookContribution,
  CoverageReportCustomization,
  CoverageThemeToken,
  CoverageUiHook,
} from "./types.js";

export const COVERAGE_THEME_TOKENS = [
  "bg",
  "panel",
  "panel-soft",
  "text",
  "muted",
  "border",
  "accent",
  "accent-strong",
  "covered",
  "partial",
  "uncovered",
  "ignored",
  "code-bg",
  "syn-keyword",
  "syn-type",
  "syn-builtin",
  "syn-function",
  "syn-string",
  "syn-number",
  "syn-comment",
  "syn-literal",
  "syn-key",
  "syn-operator",
  "syn-punctuation",
] as const satisfies readonly CoverageThemeToken[];

export const COVERAGE_UI_HOOKS = [
  "report:header",
  "report:summary",
  "file:toolbar",
  "sidebar:panel",
] as const satisfies readonly CoverageUiHook[];

const themeTokens = new Set<string>(COVERAGE_THEME_TOKENS);
const hookLocations = new Set<string>(COVERAGE_UI_HOOKS);

export function sanitizeCoverageReportCustomization(
  input: unknown,
): CoverageReportCustomization | undefined {
  if (!isRecord(input)) return undefined;
  const customization: CoverageReportCustomization = {};
  if (typeof input.defaultTheme === "string" && input.defaultTheme.trim()) {
    customization.defaultTheme = input.defaultTheme.trim();
  }

  const themes = Array.isArray(input.themes)
    ? input.themes.map(sanitizeTheme).filter((theme) => theme !== null)
    : [];
  if (themes.length) customization.themes = themes;

  const hooks = Array.isArray(input.hooks)
    ? input.hooks.map(sanitizeHook).filter((hook) => hook !== null)
    : [];
  if (hooks.length) customization.hooks = hooks;

  const plugins = Array.isArray(input.plugins)
    ? input.plugins.map(sanitizePlugin).filter((plugin) => plugin !== null)
    : [];
  if (plugins.length) customization.plugins = plugins;

  return Object.keys(customization).length > 0 ? customization : undefined;
}

export function isCoverageThemeToken(
  value: string,
): value is CoverageThemeToken {
  return themeTokens.has(value);
}

export function isSafeThemeTokenValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;
  if (/^(?:rgb|hsl)a?\([0-9%.,\s+-]+\)$/.test(trimmed)) return true;
  return /^[a-zA-Z]+$/.test(trimmed);
}

export function sanitizeCoverageHref(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    /^[/\\]{2}/.test(trimmed) ||
    /^[/\\]\\/.test(trimmed) ||
    /^\\\//.test(trimmed)
  ) {
    return undefined;
  }
  try {
    const url = new URL(trimmed, "https://doublcov.local/");
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:"
    )
      return trimmed;
  } catch {
    return undefined;
  }
  return undefined;
}

function sanitizeTheme(
  input: unknown,
): NonNullable<CoverageReportCustomization["themes"]>[number] | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.label !== "string"
  )
    return null;
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id || !label) return null;
  const tokens: Partial<Record<CoverageThemeToken, string>> = {};
  if (isRecord(input.tokens)) {
    for (const [key, value] of Object.entries(input.tokens)) {
      if (
        isCoverageThemeToken(key) &&
        typeof value === "string" &&
        isSafeThemeTokenValue(value)
      )
        tokens[key] = value.trim();
    }
  }
  return {
    id,
    label,
    ...(input.mode === "light" || input.mode === "dark"
      ? { mode: input.mode }
      : {}),
    tokens,
  };
}

function sanitizePlugin(
  input: unknown,
): NonNullable<CoverageReportCustomization["plugins"]>[number] | null {
  if (!isRecord(input) || typeof input.id !== "string") return null;
  const id = input.id.trim();
  if (!id) return null;
  const hooks = Array.isArray(input.hooks)
    ? input.hooks.map(sanitizeHook).filter((hook) => hook !== null)
    : [];
  return {
    id,
    ...(typeof input.label === "string" && input.label.trim()
      ? { label: input.label.trim() }
      : {}),
    ...(hooks.length ? { hooks } : {}),
  };
}

function sanitizeHook(input: unknown): CoverageHookContribution | null {
  if (
    !isRecord(input) ||
    typeof input.id !== "string" ||
    typeof input.hook !== "string" ||
    typeof input.label !== "string" ||
    !hookLocations.has(input.hook)
  ) {
    return null;
  }
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id || !label) return null;
  const href =
    typeof input.href === "string"
      ? sanitizeCoverageHref(input.href)
      : undefined;
  return {
    id,
    hook: input.hook as CoverageUiHook,
    label,
    ...(typeof input.content === "string" ? { content: input.content } : {}),
    ...(href ? { href } : {}),
    ...(typeof input.filePath === "string" ? { filePath: input.filePath } : {}),
    ...(typeof input.language === "string" ? { language: input.language } : {}),
    ...(typeof input.priority === "number" && Number.isFinite(input.priority)
      ? { priority: input.priority }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
