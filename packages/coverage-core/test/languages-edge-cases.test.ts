import { afterEach, describe, expect, it } from "vitest";
import {
  LANGUAGE_DEFINITIONS,
  detectIgnoredLines,
  detectSourceLanguage,
  registerLanguageDefinition,
  resolveLanguageDefinition,
  sourceExtensionsForLanguages,
} from "../src/languages.js";

const baseline = LANGUAGE_DEFINITIONS.slice();

afterEach(() => {
  LANGUAGE_DEFINITIONS.splice(0, LANGUAGE_DEFINITIONS.length, ...baseline);
});

describe("detectSourceLanguage", () => {
  it("matches case-insensitively (.SOL == .sol)", () => {
    expect(detectSourceLanguage("Foo.SOL")).toBe("solidity");
    expect(detectSourceLanguage("Foo.Sol")).toBe("solidity");
    expect(detectSourceLanguage("Foo.sol")).toBe("solidity");
  });

  it("uses the trailing extension for paths with multiple dots", () => {
    expect(detectSourceLanguage("foo.test.ts")).toBe("typescript");
    expect(detectSourceLanguage("foo.spec.tsx")).toBe("typescript");
    expect(detectSourceLanguage("a.b.c.py")).toBe("python");
  });

  it("returns plain for files with no extension", () => {
    expect(detectSourceLanguage("Makefile")).toBe("plain");
    expect(detectSourceLanguage("LICENSE")).toBe("plain");
  });

  it("returns plain for unknown extensions", () => {
    expect(detectSourceLanguage("foo.unknownext")).toBe("plain");
  });

  it("returns plain for dotfiles without an explicit extension", () => {
    // .gitignore is a dotfile, not an extension. We don't have a language
    // mapping for it, so it must fall back to plain.
    expect(detectSourceLanguage(".gitignore")).toBe("plain");
    expect(detectSourceLanguage(".env")).toBe("plain");
  });
});

describe("registerLanguageDefinition", () => {
  it("accepts a language with an empty extensions array", () => {
    expect(() =>
      registerLanguageDefinition({
        id: "no-ext",
        label: "No Extensions",
        extensions: [],
      }),
    ).not.toThrow();
    expect(resolveLanguageDefinition("no-ext")?.label).toBe("No Extensions");
    // Must not crash sourceExtensionsForLanguages either.
    expect(sourceExtensionsForLanguages()).toContain(".ts");
  });

  it("normalizes extensions (adds leading dot, lowercases)", () => {
    registerLanguageDefinition({
      id: "weird",
      label: "Weird",
      extensions: ["WeIrD", ".LOUD"],
    });
    expect(detectSourceLanguage("a.weird")).toBe("weird");
    expect(detectSourceLanguage("a.LOUD")).toBe("weird");
    expect(detectSourceLanguage("a.WEIRD")).toBe("weird");
  });

  it("lets a new language claim an extension previously owned by another", () => {
    // .ts is owned by typescript by default — registering a new language with
    // .ts should redirect lookups to the new language, not return typescript.
    registerLanguageDefinition({
      id: "claim-ts",
      label: "Claim TS",
      extensions: [".ts"],
    });
    expect(detectSourceLanguage("a.ts")).toBe("claim-ts");
  });

  it("does not duplicate the language in LANGUAGE_DEFINITIONS when re-registered", () => {
    registerLanguageDefinition({
      id: "dup-lang",
      label: "v1",
      extensions: [".dup"],
    });
    registerLanguageDefinition({
      id: "dup-lang",
      label: "v2",
      extensions: [".dup", ".dup2"],
    });
    const occurrences = LANGUAGE_DEFINITIONS.filter(
      (lang) => lang.id === "dup-lang",
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.label).toBe("v2");
    expect(detectSourceLanguage("a.dup2")).toBe("dup-lang");
  });
});

describe("detectIgnoredLines (Solidity assembly)", () => {
  it("ignores a single-line assembly block", () => {
    const lines = ["function foo() public {", "  assembly { let x := 1 }", "}"];
    const ignored = detectIgnoredLines(lines, "solidity");
    expect(ignored.map((entry) => entry.line)).toEqual([2]);
  });

  it("ignores a multi-line assembly block including the closing brace", () => {
    const lines = [
      "function foo() public {",
      "  assembly {",
      "    let x := 1",
      "    mstore(0, x)",
      "  }",
      "}",
    ];
    const ignored = detectIgnoredLines(lines, "solidity");
    expect(ignored.map((entry) => entry.line)).toEqual([2, 3, 4, 5]);
  });

  it("handles nested braces inside assembly without exiting prematurely", () => {
    const lines = [
      "assembly {",
      "  for { let i := 0 } lt(i, 10) { i := add(i, 1) } {",
      "    mstore(i, 1)",
      "  }",
      "}",
      "regularLine();",
    ];
    const ignored = detectIgnoredLines(lines, "solidity");
    expect(ignored.map((entry) => entry.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not exit assembly early on a } embedded in a yul string literal", () => {
    // Yul allows string literals such as `let s := "}"`. A naive depth counter
    // would treat the `}` inside the string as a real closing brace and exit
    // the assembly block on line 2 — which would mis-attribute line 3 onward
    // as regular code.
    const lines = [
      "assembly {", // depth 1
      '  let s := "}"', // string contains } only
      "  let x := 1",
      "}", // real closing brace
      "regularLine();",
    ];
    const ignored = detectIgnoredLines(lines, "solidity");
    expect(ignored.map((entry) => entry.line)).toEqual([1, 2, 3, 4]);
  });

  it("returns an empty array when there is no assembly block", () => {
    const lines = [
      "function foo() public {",
      "  uint256 x = 1;",
      "  return x;",
      "}",
    ];
    expect(detectIgnoredLines(lines, "solidity")).toEqual([]);
  });

  it("returns an empty array for files with only comments or whitespace", () => {
    expect(
      detectIgnoredLines(["// just a comment", "   ", ""], "solidity"),
    ).toEqual([]);
  });

  it("returns no ignored lines for non-solidity languages", () => {
    expect(
      detectIgnoredLines(["assembly {", "  x", "}"], "typescript"),
    ).toEqual([]);
  });

  it("matches assembly with explicit memory-safe annotation", () => {
    const lines = ["  assembly (\"memory-safe\") {", "    let x := 1", "  }"];
    const ignored = detectIgnoredLines(lines, "solidity");
    expect(ignored.map((entry) => entry.line)).toEqual([1, 2, 3]);
  });
});
