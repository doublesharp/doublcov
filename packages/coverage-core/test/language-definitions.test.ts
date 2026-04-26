import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCE_EXTENSIONS,
  LANGUAGE_DEFINITIONS,
  sourceExtensionsForLanguages,
  sourceLanguageLabel,
} from "../src/languages.js";

describe("built-in language definitions", () => {
  it("keeps the supported language inventory and labels stable", () => {
    expect(
      LANGUAGE_DEFINITIONS.map(({ id, label, extensions }) => ({
        id,
        label,
        extensions,
      })),
    ).toEqual([
      { id: "solidity", label: "Solidity", extensions: [".sol"] },
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
      {
        id: "shell",
        label: "Shell",
        extensions: [".sh", ".bash", ".zsh"],
      },
      { id: "css", label: "CSS", extensions: [".css"] },
      { id: "html", label: "HTML", extensions: [".html", ".htm"] },
      { id: "xml", label: "XML", extensions: [".xml", ".svg"] },
      { id: "vue", label: "Vue", extensions: [".vue"] },
      { id: "json", label: "JSON", extensions: [".json", ".jsonc"] },
      { id: "yaml", label: "YAML", extensions: [".yaml", ".yml"] },
      { id: "toml", label: "TOML", extensions: [".toml"] },
      { id: "markdown", label: "Markdown", extensions: [".md", ".mdx"] },
    ]);
  });

  it("derives the default source extension set from every built-in language", () => {
    expect(DEFAULT_SOURCE_EXTENSIONS).toEqual(
      sourceExtensionsForLanguages(LANGUAGE_DEFINITIONS),
    );
    expect(DEFAULT_SOURCE_EXTENSIONS).toEqual([
      ".sol",
      ".cc",
      ".cpp",
      ".cxx",
      ".hh",
      ".hpp",
      ".hxx",
      ".c",
      ".h",
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".rs",
      ".py",
      ".pyw",
      ".go",
      ".java",
      ".cs",
      ".kt",
      ".kts",
      ".php",
      ".rb",
      ".swift",
      ".scala",
      ".sc",
      ".dart",
      ".lua",
      ".r",
      ".sh",
      ".bash",
      ".zsh",
      ".css",
      ".html",
      ".htm",
      ".xml",
      ".svg",
      ".vue",
      ".json",
      ".jsonc",
      ".yaml",
      ".yml",
      ".toml",
      ".md",
      ".mdx",
    ]);
  });

  it("uses built-in labels for every known language", () => {
    for (const definition of LANGUAGE_DEFINITIONS) {
      expect(sourceLanguageLabel(definition.id)).toBe(definition.label);
    }
  });
});
