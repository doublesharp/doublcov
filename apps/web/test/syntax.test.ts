import { describe, expect, it } from "vitest";
import {
  highlightSourceLine,
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

  it("triggers cache eviction when cache exceeds maxCacheEntries", () => {
    // maxCacheEntries is 12000; insert >12000 unique entries to force the
    // tokenCache.clear() branch.
    for (let i = 0; i < 12100; i++) {
      const text = `const v${i} = ${i};`;
      const tokens = highlightSourceLine(text, "evict.ts");
      expect(tokens.length).toBeGreaterThan(0);
    }
  });

  it("highlights CSS strings (content: '..', url('..'))", () => {
    // Exercise the readQuoted branch of highlightCss.
    const text = `.x { content: "hi"; background: url('a.png'); }`;
    const tokens = highlightSourceLine(text, "style.css");
    expect(joined(tokens)).toBe(text);
    expect(kinds(tokens).has("string")).toBe(true);
  });

  it("highlightConfig falls through to value-only branch when no key match", () => {
    // Continuation/value-only TOML/YAML line with no `key:` or `key =` and
    // not a section header. Exercises the else branch calling
    // pushSimpleValueTokens.
    const tokens = highlightSourceLine(`  "just a value"`, "config.toml");
    expect(joined(tokens)).toBe(`  "just a value"`);
    expect(kinds(tokens).has("string")).toBe(true);

    // YAML continuation line with a number-only value.
    const yamlContinuation = highlightSourceLine(`  42`, "config.yaml");
    expect(joined(yamlContinuation)).toBe(`  42`);
    expect(kinds(yamlContinuation).has("number")).toBe(true);

    // Bare identifier value (not a recognised literal).
    const bare = highlightSourceLine(`  bareword`, "config.toml");
    expect(joined(bare)).toBe(`  bareword`);

    // Recognised literal in a value-only context.
    const literal = highlightSourceLine(`  true`, "config.yaml");
    expect(kinds(literal).has("literal")).toBe(true);
  });
});
