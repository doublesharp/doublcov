import type { IgnoredLine, SourceLanguage } from "./types.js";

export interface LanguageDefinition {
  id: SourceLanguage;
  label: string;
  extensions: string[];
  detectIgnoredLines?: (lines: string[]) => IgnoredLine[];
}

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    id: "solidity",
    label: "Solidity",
    extensions: [".sol"],
    detectIgnoredLines: detectSolidityAssemblyLines,
  },
  {
    id: "cpp",
    label: "C++",
    extensions: [".cc", ".cpp", ".cxx", ".hh", ".hpp", ".hxx"],
  },
  { id: "c", label: "C", extensions: [".c", ".h"] },
  {
    id: "typescript",
    label: "TypeScript",
    extensions: [".ts", ".tsx", ".mts", ".cts"],
  },
  {
    id: "javascript",
    label: "JavaScript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
  },
  { id: "rust", label: "Rust", extensions: [".rs"] },
  { id: "python", label: "Python", extensions: [".py", ".pyw"] },
  { id: "go", label: "Go", extensions: [".go"] },
  { id: "java", label: "Java", extensions: [".java"] },
  { id: "csharp", label: "C#", extensions: [".cs"] },
  { id: "kotlin", label: "Kotlin", extensions: [".kt", ".kts"] },
  { id: "php", label: "PHP", extensions: [".php"] },
  { id: "ruby", label: "Ruby", extensions: [".rb"] },
  { id: "swift", label: "Swift", extensions: [".swift"] },
  { id: "scala", label: "Scala", extensions: [".scala", ".sc"] },
  { id: "dart", label: "Dart", extensions: [".dart"] },
  { id: "lua", label: "Lua", extensions: [".lua"] },
  { id: "r", label: "R", extensions: [".r", ".R"] },
  { id: "shell", label: "Shell", extensions: [".sh", ".bash", ".zsh"] },
  { id: "css", label: "CSS", extensions: [".css"] },
  { id: "html", label: "HTML", extensions: [".html", ".htm"] },
  { id: "xml", label: "XML", extensions: [".xml", ".svg"] },
  { id: "vue", label: "Vue", extensions: [".vue"] },
  { id: "json", label: "JSON", extensions: [".json", ".jsonc"] },
  { id: "yaml", label: "YAML", extensions: [".yaml", ".yml"] },
  { id: "toml", label: "TOML", extensions: [".toml"] },
  { id: "markdown", label: "Markdown", extensions: [".md", ".mdx"] },
];

export const DEFAULT_SOURCE_EXTENSIONS = sourceExtensionsForLanguages();

const languagesByExtension = new Map(
  LANGUAGE_DEFINITIONS.flatMap((language) =>
    language.extensions.map(
      (extension) => [extension.toLowerCase(), language] as const,
    ),
  ),
);
const languagesById = new Map(
  LANGUAGE_DEFINITIONS.map((language) => [language.id, language] as const),
);

export function registerLanguageDefinition(language: LanguageDefinition): void {
  const normalized = {
    ...language,
    extensions: language.extensions.map(normalizeExtension),
  };
  const existing = languagesById.get(normalized.id);
  if (existing) {
    const index = LANGUAGE_DEFINITIONS.findIndex(
      (candidate) => candidate.id === normalized.id,
    );
    if (index !== -1) LANGUAGE_DEFINITIONS.splice(index, 1, normalized);
    for (const [extension, candidate] of languagesByExtension) {
      if (candidate.id === normalized.id)
        languagesByExtension.delete(extension);
    }
  } else {
    LANGUAGE_DEFINITIONS.push(normalized);
  }

  languagesById.set(normalized.id, normalized);
  for (const extension of normalized.extensions)
    languagesByExtension.set(extension, normalized);
}

export function resolveLanguageDefinition(
  language: SourceLanguage,
): LanguageDefinition | undefined {
  return languagesById.get(language);
}

export function sourceExtensionsForLanguages(
  languages = LANGUAGE_DEFINITIONS,
): string[] {
  return [
    ...new Set(
      languages.flatMap((language) =>
        language.extensions.map(normalizeExtension),
      ),
    ),
  ];
}

export function detectSourceLanguage(filePath: string): SourceLanguage {
  return languagesByExtension.get(extensionForPath(filePath))?.id ?? "plain";
}

export function sourceLanguageLabel(language: SourceLanguage): string {
  return languagesById.get(language)?.label ?? language;
}

export function detectIgnoredLines(
  lines: string[],
  language: SourceLanguage,
): IgnoredLine[] {
  return languagesById.get(language)?.detectIgnoredLines?.(lines) ?? [];
}

function detectSolidityAssemblyLines(lines: string[]): IgnoredLine[] {
  const ignoredLines: IgnoredLine[] = [];
  let depth = 0;
  let inAssembly = false;

  for (const [index, text] of lines.entries()) {
    const lineNumber = index + 1;
    const stripped = stripStringsAndComments(text);

    if (!inAssembly && /\bassembly(?:\s*\([^)]*\))?\s*\{/.test(stripped)) {
      inAssembly = true;
      depth = 0;
    }

    if (inAssembly) {
      ignoredLines.push({
        line: lineNumber,
        reason: "solidity-assembly",
        label: "Solidity assembly",
      });
      depth += countChar(stripped, "{") - countChar(stripped, "}");
      if (depth <= 0) {
        inAssembly = false;
        depth = 0;
      }
    }
  }

  return ignoredLines;
}

function extensionForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jsonc")) return ".jsonc";
  return lower.match(/(\.[^./\\]+)$/)?.[1] ?? "";
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function stripStringsAndComments(line: string): string {
  // Strip out double- and single-quoted string literals (with backslash escapes)
  // and trailing line comments so brace-tracking only sees real code.
  let result = "";
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === "/" && line[index + 1] === "/") break;
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < line.length && line[index] !== quote) {
        if (line[index] === "\\" && index + 1 < line.length) {
          index += 2;
          continue;
        }
        index += 1;
      }
      // Skip the closing quote (if present) without emitting it.
      if (index < line.length) index += 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

function countChar(value: string, char: string): number {
  return [...value].filter((candidate) => candidate === char).length;
}
