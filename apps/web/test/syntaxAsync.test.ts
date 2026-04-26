import { beforeAll, describe, expect, it, vi } from "vitest";
import { highlightSourceLines } from "../src/syntax";

// IMPORTANT: this test file deliberately does NOT mock "../src/syntax".
// It exercises the real async Shiki integration and its fallback behavior.

describe("highlightSourceLines async highlighter", () => {
  beforeAll(async () => {
    try {
      await highlightSourceLines(["const x = 1;"], "warmup.ts", "dark");
    } catch {
      // The implementation catches highlighter failures and falls back below.
    }
  }, 30_000);

  it("returns one row per input line whose tokens cover the line text (typescript dark)", async () => {
    const lines = [
      `import { x } from "./y";`,
      `const n: number = 42;`,
      `export function f() { return n; }`,
    ];
    const rows = await highlightSourceLines(lines, "foo.ts", "dark");
    expect(rows.length).toBe(lines.length);
    rows.forEach((row, idx) => {
      const stitched = row
        .map((t) => t.text)
        .join("")
        .replace(/\n$/, "");
      expect(row.length).toBeGreaterThan(0);
      expect(stitched).toBe(lines[idx]);
    });
  }, 15_000);

  it("returns rows for python in light mode", async () => {
    const rows = await highlightSourceLines(
      [`def add(a, b):`, `    return a + b`],
      "math.py",
      "light",
    );
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      expect(row.length).toBeGreaterThan(0);
    });
  }, 15_000);

  it("returns rows for rust", async () => {
    const rows = await highlightSourceLines(
      [`fn main() {`, `  println!("hi");`, `}`],
      "main.rs",
      "dark",
    );
    expect(rows.length).toBe(3);
  }, 15_000);

  it("returns rows for solidity", async () => {
    const rows = await highlightSourceLines(
      [`pragma solidity ^0.8.20;`, `contract C { uint256 x; }`],
      "C.sol",
      "dark",
    );
    expect(rows.length).toBe(2);
  }, 15_000);

  it("returns rows for json", async () => {
    const rows = await highlightSourceLines(
      [`{`, `  "name": "x"`, `}`],
      "p.json",
      "light",
    );
    expect(rows.length).toBe(3);
  }, 15_000);

  it("falls back to per-line highlighting for unknown extensions (no shiki language)", async () => {
    const rows = await highlightSourceLines(
      [`anything`, `goes here`],
      "f.unknown",
      "dark",
    );
    expect(rows.length).toBe(2);
    expect(rows[0]?.[0]?.text).toBe("anything");
    expect(rows[1]?.[0]?.text).toBe("goes here");
  }, 15_000);

  it("exercises additional shiki language detection paths", async () => {
    const cases: Array<{ path: string; text: string }> = [
      { path: "a.tsx", text: `const X = () => <div/>;` },
      { path: "a.js", text: `const x = 1;` },
      { path: "a.mjs", text: `export const x = 1;` },
      { path: "a.cjs", text: `module.exports = 1;` },
      { path: "a.jsx", text: `const X = () => <div/>;` },
      { path: "a.cc", text: `int main(){}` },
      { path: "a.cpp", text: `int main(){}` },
      { path: "a.cxx", text: `int main(){}` },
      { path: "a.hh", text: `int x;` },
      { path: "a.hpp", text: `int x;` },
      { path: "a.hxx", text: `int x;` },
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
  }, 60_000);

  it("falls back per-line when codeToTokens throws (catch path)", async () => {
    vi.resetModules();
    vi.doMock("shiki/core", () => ({
      createHighlighterCore: async () => ({
        codeToTokens: () => {
          throw new Error("synthetic");
        },
      }),
    }));
    vi.doMock("shiki/engine/oniguruma", () => ({
      createOnigurumaEngine: () => ({}),
    }));
    try {
      const fresh = await import("../src/syntax");
      const lines = ["const x = 1;", "const y = 2;"];
      const rows = await fresh.highlightSourceLines(lines, "foo.ts", "dark");
      expect(rows.length).toBe(2);
      rows.forEach((row, idx) => {
        const stitched = row.map((t) => t.text).join("");
        expect(stitched).toBe(lines[idx]);
      });
    } finally {
      vi.doUnmock("shiki/core");
      vi.doUnmock("shiki/engine/oniguruma");
      vi.resetModules();
    }
  }, 20_000);
});
