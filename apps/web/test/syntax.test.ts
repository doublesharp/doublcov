import { beforeAll, describe, expect, it } from "vitest";
import {
  highlightSourceLine,
  highlightSourceLines,
  type SyntaxKind,
  type SyntaxToken,
} from "../src/syntax";

// IMPORTANT: this test file deliberately does NOT mock "../src/syntax".
// It exercises the real module so coverage reflects actual behavior.

function joined(tokens: SyntaxToken[]): string {
  return tokens.map((token) => token.text).join("");
}

function kinds(tokens: SyntaxToken[]): Set<SyntaxKind | undefined> {
  return new Set(tokens.map((token) => token.kind));
}

describe("highlightSourceLine - language detection by path", () => {
  it("returns a single space token for empty input", () => {
    const tokens = highlightSourceLine("", "anything.ts");
    expect(tokens).toEqual([{ text: " " }]);
  });

  it("highlights typescript: keyword, type, function, builtin, string", () => {
    const text = `const greet = (name: string): void => console.log("hi");`;
    const tokens = highlightSourceLine(text, "foo.ts");
    expect(tokens.length).toBeGreaterThan(1);
    expect(joined(tokens)).toBe(text);
    const k = kinds(tokens);
    expect(k.has("keyword")).toBe(true);
    expect(k.has("type")).toBe(true);
    expect(k.has("string")).toBe(true);
    // `console` is a builtin, `log` follows a `.` then `(`, so log is function
    expect(k.has("builtin")).toBe(true);
    expect(k.has("function")).toBe(true);
    // Punctuation and operators sprinkled throughout
    expect(k.has("punctuation")).toBe(true);
    expect(k.has("operator")).toBe(true);
  });

  it("treats .tsx the same as .ts (typescript family)", () => {
    const text = `const x = 1;`;
    const tokens = highlightSourceLine(text, "foo.tsx");
    expect(joined(tokens)).toBe(text);
    expect(kinds(tokens).has("keyword")).toBe(true);
  });

  it("highlights python with a comment trailing", () => {
    const text = `def add(a, b): return a + b  # add`;
    const tokens = highlightSourceLine(text, "foo.py");
    expect(joined(tokens)).toBe(text);
    const k = kinds(tokens);
    expect(k.has("keyword")).toBe(true); // def, return
    expect(k.has("comment")).toBe(true);
    expect(k.has("function")).toBe(true); // add(
  });

  it("highlights python without a comment", () => {
    const text = `x = True`;
    const tokens = highlightSourceLine(text, "main.pyw");
    expect(joined(tokens)).toBe(text);
    expect(kinds(tokens).has("literal")).toBe(true);
  });

  it("highlights rust", () => {
    const text = `fn main() -> Option<i32> { let x: i32 = 1; Some(x) }`;
    const tokens = highlightSourceLine(text, "foo.rs");
    expect(joined(tokens)).toBe(text);
    const k = kinds(tokens);
    expect(k.has("keyword")).toBe(true);
    expect(k.has("type")).toBe(true);
    expect(k.has("function")).toBe(true);
    expect(k.has("number")).toBe(true);
  });

  it("highlights solidity", () => {
    const text = `function f() public pure returns (uint256) { return 42; }`;
    const tokens = highlightSourceLine(text, "Contract.sol");
    expect(joined(tokens)).toBe(text);
    const k = kinds(tokens);
    expect(k.has("keyword")).toBe(true);
    expect(k.has("type")).toBe(true);
    expect(k.has("number")).toBe(true);
  });

  it("highlights JSON: keys, strings, numbers, literals, punctuation", () => {
    const text = `{"name": "foo", "n": 42, "ok": true, "nope": null}`;
    const tokens = highlightSourceLine(text, "data.json");
    expect(joined(tokens)).toBe(text);
    const k = kinds(tokens);
    expect(k.has("key")).toBe(true);
    expect(k.has("string")).toBe(true);
    expect(k.has("number")).toBe(true);
    expect(k.has("literal")).toBe(true);
    expect(k.has("punctuation")).toBe(true);
  });

  it("highlights JSONC", () => {
    const text = `{"x": 1}`;
    const tokens = highlightSourceLine(text, "tsconfig.jsonc");
    expect(joined(tokens)).toBe(text);
    expect(kinds(tokens).has("number")).toBe(true);
  });

  it("returns plain tokens for unknown extensions", () => {
    const tokens = highlightSourceLine("anything goes here", "foo.unknown");
    expect(tokens).toEqual([{ text: "anything goes here" }]);
  });

  it("highlights C and C++", () => {
    const c = highlightSourceLine(`int main(void) { return 0; }`, "main.c");
    expect(joined(c)).toBe(`int main(void) { return 0; }`);
    expect(kinds(c).has("type")).toBe(true);
    expect(kinds(c).has("keyword")).toBe(true);

    const cpp = highlightSourceLine(
      `auto x = std::make_shared<int>(1);`,
      "main.cpp",
    );
    expect(kinds(cpp).has("builtin")).toBe(true);
    const hpp = highlightSourceLine(`int x;`, "header.hpp");
    expect(kinds(hpp).has("type")).toBe(true);
  });

  it("highlights TOML and YAML config", () => {
    const toml = highlightSourceLine(`name = "foo" # comment`, "Cargo.toml");
    expect(joined(toml)).toBe(`name = "foo" # comment`);
    expect(kinds(toml).has("key")).toBe(true);
    expect(kinds(toml).has("string")).toBe(true);
    expect(kinds(toml).has("comment")).toBe(true);

    const tomlSection = highlightSourceLine(`[package]`, "Cargo.toml");
    expect(kinds(tomlSection).has("keyword")).toBe(true);

    const yaml = highlightSourceLine(`port: 8080`, "config.yaml");
    expect(kinds(yaml).has("key")).toBe(true);
    expect(kinds(yaml).has("number")).toBe(true);

    const yml = highlightSourceLine(`flag: true`, "config.yml");
    expect(kinds(yml).has("literal")).toBe(true);
  });

  it("highlights shell scripts", () => {
    const sh = highlightSourceLine(
      `if [ -n $HOME ]; then echo "hi"; fi  # ok`,
      "run.sh",
    );
    expect(joined(sh)).toBe(`if [ -n $HOME ]; then echo "hi"; fi  # ok`);
    const k = kinds(sh);
    expect(k.has("keyword")).toBe(true);
    expect(k.has("string")).toBe(true);
    expect(k.has("builtin")).toBe(true); // $HOME (outside quotes)
    expect(k.has("comment")).toBe(true);

    const bracedVar = highlightSourceLine(`echo \${FOO}`, "run.bash");
    expect(kinds(bracedVar).has("builtin")).toBe(true);

    const zshTokens = highlightSourceLine(`echo hi`, "run.zsh");
    expect(joined(zshTokens)).toBe("echo hi");
  });

  it("highlights markdown headings, lists, blockquotes, code fences, inline", () => {
    const heading = highlightSourceLine(`## Title`, "doc.md");
    expect(heading[0]?.kind).toBe("keyword");

    const list = highlightSourceLine(`- item one`, "doc.md");
    expect(list[0]?.kind).toBe("operator");
    expect(list[1]?.text).toBe(" item one");

    const ordered = highlightSourceLine(`1. ordered`, "doc.md");
    expect(ordered[0]?.kind).toBe("operator");

    const quote = highlightSourceLine(`> quoted text`, "doc.md");
    expect(quote[0]?.kind).toBe("comment");

    const fence = highlightSourceLine("```ts", "doc.md");
    expect(fence[0]?.kind).toBe("keyword");

    const inline = highlightSourceLine(
      "see `code` and [link](url) here",
      "notes.mdx",
    );
    const inlineKinds = kinds(inline);
    expect(inlineKinds.has("string")).toBe(true);
    expect(inlineKinds.has("key")).toBe(true);
  });

  it("highlights CSS rules", () => {
    const text = `.btn { color: #fff; padding: 4px 8px; /* note */ }`;
    const tokens = highlightSourceLine(text, "style.css");
    expect(joined(tokens)).toBe(text);
    const k = kinds(tokens);
    expect(k.has("key")).toBe(true);
    expect(k.has("number")).toBe(true);
    expect(k.has("comment")).toBe(true);
    expect(k.has("punctuation")).toBe(true);
  });

  it("highlights HTML/XML/SVG markup including comments and attrs", () => {
    const html = highlightSourceLine(`<a href="x">y</a>`, "page.html");
    expect(joined(html)).toBe(`<a href="x">y</a>`);
    const k = kinds(html);
    expect(k.has("punctuation")).toBe(true);
    expect(k.has("keyword")).toBe(true); // tag name
    expect(k.has("key")).toBe(true); // attribute
    expect(k.has("string")).toBe(true); // value
    expect(k.has("operator")).toBe(true); // =

    const comment = highlightSourceLine(`<!-- hello -->`, "page.htm");
    expect(comment[0]?.kind).toBe("comment");

    const xml = highlightSourceLine(`<root/>`, "data.xml");
    expect(joined(xml)).toBe("<root/>");
    const svg = highlightSourceLine(`<svg></svg>`, "icon.svg");
    expect(joined(svg)).toBe("<svg></svg>");
  });

  it("handles block comments and unterminated strings in code-like languages", () => {
    const block = highlightSourceLine(`/* hi */ const x = 1;`, "x.ts");
    expect(joined(block)).toBe(`/* hi */ const x = 1;`);
    expect(block[0]?.kind).toBe("comment");

    const unterminatedBlock = highlightSourceLine(`/* never closed`, "x.ts");
    expect(unterminatedBlock[0]?.kind).toBe("comment");

    const lineComment = highlightSourceLine(`// trailing`, "x.ts");
    expect(lineComment[0]?.kind).toBe("comment");

    const unterminatedString = highlightSourceLine(`const s = "abc`, "x.ts");
    const sk = kinds(unterminatedString);
    expect(sk.has("string")).toBe(true);

    const escaped = highlightSourceLine(
      `const s = "a\\"b"; const n = 0xFF;`,
      "x.ts",
    );
    expect(kinds(escaped).has("string")).toBe(true);
    expect(kinds(escaped).has("number")).toBe(true);
  });

  it("handles leading-dot numbers and identifiers with $/_ ", () => {
    const tokens = highlightSourceLine(`const _x$ = .5;`, "x.ts");
    expect(joined(tokens)).toBe(`const _x$ = .5;`);
    expect(kinds(tokens).has("number")).toBe(true);
  });

  it("repeated calls return tokens (cache hit path)", () => {
    const text = `const a = 1;`;
    const first = highlightSourceLine(text, "foo.ts");
    const second = highlightSourceLine(text, "foo.ts");
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(joined(first)).toBe(text);
    expect(joined(second)).toBe(text);
  });
});

describe("highlightSourceLines (async, shiki-backed)", () => {
  // Warm up the highlighter once so per-test wall time is small. If the
  // initial init fails (e.g. WASM problem in happy-dom), the catch in
  // highlightSourceLines still gracefully falls back so tests remain valid.
  beforeAll(async () => {
    try {
      await highlightSourceLines(["const x = 1;"], "warmup.ts", "dark");
    } catch {
      // ignored - tests below tolerate fallback
    }
  }, 30_000);

  it(
    "returns one row per input line whose tokens cover the line text (typescript dark)",
    async () => {
      const lines = [
        `import { x } from "./y";`,
        `const n: number = 42;`,
        `export function f() { return n; }`,
      ];
      const rows = await highlightSourceLines(lines, "foo.ts", "dark");
      expect(rows.length).toBe(lines.length);
      rows.forEach((row, idx) => {
        expect(row.length).toBeGreaterThan(0);
        // The concatenated token text must equal the input line text. Shiki
        // may include a trailing newline in the final token; trim it so we
        // tolerate both behaviors.
        const stitched = row.map((t) => t.text).join("").replace(/\n$/, "");
        expect(stitched).toBe(lines[idx]);
      });
    },
    15_000,
  );

  it(
    "returns rows for python in light mode",
    async () => {
      const lines = [`def add(a, b):`, `    return a + b`];
      const rows = await highlightSourceLines(lines, "math.py", "light");
      expect(rows.length).toBe(2);
      rows.forEach((row) => {
        expect(row.length).toBeGreaterThan(0);
      });
    },
    15_000,
  );

  it(
    "returns rows for rust",
    async () => {
      const lines = [`fn main() {`, `  println!("hi");`, `}`];
      const rows = await highlightSourceLines(lines, "main.rs", "dark");
      expect(rows.length).toBe(3);
    },
    15_000,
  );

  it(
    "returns rows for solidity",
    async () => {
      const lines = [
        `pragma solidity ^0.8.20;`,
        `contract C { uint256 x; }`,
      ];
      const rows = await highlightSourceLines(lines, "C.sol", "dark");
      expect(rows.length).toBe(2);
    },
    15_000,
  );

  it(
    "returns rows for json",
    async () => {
      const lines = [`{`, `  "name": "x"`, `}`];
      const rows = await highlightSourceLines(lines, "p.json", "light");
      expect(rows.length).toBe(3);
    },
    15_000,
  );

  it(
    "falls back to per-line highlighting for unknown extensions (no shiki language)",
    async () => {
      const lines = [`anything`, `goes here`];
      const rows = await highlightSourceLines(lines, "f.unknown", "dark");
      expect(rows.length).toBe(2);
      // Plain fallback returns one token per line with the original text.
      expect(rows[0]?.[0]?.text).toBe("anything");
      expect(rows[1]?.[0]?.text).toBe("goes here");
    },
    15_000,
  );

  it(
    "exercises additional shiki language detection paths",
    async () => {
      // js/jsx/javascript and many more
      const cases: Array<{ path: string; text: string }> = [
        { path: "a.tsx", text: `const X = () => <div/>;` },
        { path: "a.js", text: `const x = 1;` },
        { path: "a.mjs", text: `export const x = 1;` },
        { path: "a.cjs", text: `module.exports = 1;` },
        { path: "a.jsx", text: `const X = () => <div/>;` },
        { path: "a.go", text: `package main` },
        { path: "Main.java", text: `class C {}` },
        { path: "a.cs", text: `class C {}` },
        { path: "a.kt", text: `fun main(){}` },
        { path: "a.kts", text: `val x = 1` },
        { path: "a.php", text: `<?php echo 1;` },
        { path: "a.rb", text: `puts 1` },
        { path: "a.swift", text: `let x = 1` },
        { path: "a.scala", text: `val x = 1` },
        { path: "a.sc", text: `val x = 1` },
        { path: "a.dart", text: `void main(){}` },
        { path: "a.lua", text: `local x = 1` },
        { path: "a.r", text: `x <- 1` },
        { path: "a.html", text: `<p>x</p>` },
        { path: "a.htm", text: `<p>x</p>` },
        { path: "a.xml", text: `<p/>` },
        { path: "a.svg", text: `<svg/>` },
        { path: "a.vue", text: `<template></template>` },
        { path: "a.bash", text: `echo hi` },
        { path: "a.zsh", text: `echo hi` },
        { path: "a.md", text: `# title` },
      ];
      for (const { path, text } of cases) {
        const rows = await highlightSourceLines([text], path, "dark");
        expect(rows.length).toBe(1);
        expect(rows[0]?.length ?? 0).toBeGreaterThan(0);
      }
    },
    60_000,
  );
});
