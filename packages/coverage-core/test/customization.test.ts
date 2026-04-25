import { describe, expect, it } from "vitest";
import {
  COVERAGE_THEME_TOKENS,
  COVERAGE_UI_HOOKS,
  isCoverageThemeToken,
  isSafeThemeTokenValue,
  sanitizeCoverageHref,
  sanitizeCoverageReportCustomization,
} from "../src/customization.js";

describe("sanitizeCoverageReportCustomization", () => {
  it("rejects non-record inputs", () => {
    expect(sanitizeCoverageReportCustomization(null)).toBeUndefined();
    expect(sanitizeCoverageReportCustomization(undefined)).toBeUndefined();
    expect(sanitizeCoverageReportCustomization("string")).toBeUndefined();
    expect(sanitizeCoverageReportCustomization(42)).toBeUndefined();
    expect(sanitizeCoverageReportCustomization([])).toBeUndefined();
    expect(sanitizeCoverageReportCustomization(true)).toBeUndefined();
  });

  it("returns undefined when no fields produce output", () => {
    expect(sanitizeCoverageReportCustomization({})).toBeUndefined();
    expect(sanitizeCoverageReportCustomization({ defaultTheme: "" })).toBeUndefined();
    expect(sanitizeCoverageReportCustomization({ defaultTheme: "   " })).toBeUndefined();
    expect(sanitizeCoverageReportCustomization({ themes: [], hooks: [], plugins: [] })).toBeUndefined();
    expect(sanitizeCoverageReportCustomization({ themes: "not-an-array" })).toBeUndefined();
  });

  it("trims defaultTheme and accepts non-string-truthy with no other fields as undefined", () => {
    expect(sanitizeCoverageReportCustomization({ defaultTheme: "  light  " })).toEqual({
      defaultTheme: "light",
    });
    expect(sanitizeCoverageReportCustomization({ defaultTheme: 123 })).toBeUndefined();
  });

  it("filters malformed themes and keeps tokens that pass the value safety check", () => {
    const result = sanitizeCoverageReportCustomization({
      themes: [
        {
          id: "ci",
          label: "CI",
          mode: "dark",
          tokens: {
            bg: "#101010",
            "code-bg": "rgb(0, 0, 0)",
            unknown: "#fff",
            __proto__: "#000",
            border: "url(javascript:alert(1))",
          },
        },
        { id: "no-label" },
        { id: "  ", label: "Blank ID" },
        { id: "ok", label: "  " },
        "not an object",
        null,
      ],
    });
    expect(result?.themes).toHaveLength(1);
    const theme = result!.themes![0]!;
    expect(theme).toMatchObject({ id: "ci", label: "CI", mode: "dark" });
    expect(theme.tokens).toEqual({ bg: "#101010", "code-bg": "rgb(0, 0, 0)" });
    expect(Object.keys(theme.tokens ?? {})).not.toContain("__proto__");
    expect(Object.keys(theme.tokens ?? {})).not.toContain("unknown");
    expect(Object.keys(theme.tokens ?? {})).not.toContain("border");
  });

  it("only sets theme.mode when it is exactly 'light' or 'dark'", () => {
    const result = sanitizeCoverageReportCustomization({
      themes: [
        { id: "a", label: "A", mode: "light" },
        { id: "b", label: "B", mode: "dark" },
        { id: "c", label: "C", mode: "auto" },
        { id: "d", label: "D" },
      ],
    });
    expect(result?.themes).toEqual([
      { id: "a", label: "A", mode: "light", tokens: {} },
      { id: "b", label: "B", mode: "dark", tokens: {} },
      { id: "c", label: "C", tokens: {} },
      { id: "d", label: "D", tokens: {} },
    ]);
  });

  it("filters hooks and plugins, supporting hooks nested inside plugins", () => {
    const result = sanitizeCoverageReportCustomization({
      hooks: [
        { id: "ok", hook: "report:header", label: "OK" },
        { id: "no-hook-loc", hook: "report:unknown", label: "Bad" },
        { id: "missing-label", hook: "report:header" },
        null,
      ],
      plugins: [
        { id: "p1", label: "Plugin", hooks: [{ id: "h1", hook: "file:toolbar", label: "H1" }] },
        { id: "  " },
        { id: "p2" },
        { id: "p3", hooks: "not-array" },
        "not an object",
      ],
    });
    expect(result?.hooks).toHaveLength(1);
    expect(result?.plugins).toHaveLength(3);
    expect(result?.plugins?.[0]).toEqual({
      id: "p1",
      label: "Plugin",
      hooks: [{ id: "h1", hook: "file:toolbar", label: "H1" }],
    });
    expect(result?.plugins?.[1]).toEqual({ id: "p2" });
    expect(result?.plugins?.[2]).toEqual({ id: "p3" });
  });

  it("rejects hooks with whitespace-only id or label after trimming", () => {
    const result = sanitizeCoverageReportCustomization({
      hooks: [
        { id: "   ", hook: "report:header", label: "Real" },
        { id: "real", hook: "report:header", label: "   " },
      ],
    });
    expect(result).toBeUndefined();
  });

  it("includes optional hook fields only when valid", () => {
    const result = sanitizeCoverageReportCustomization({
      hooks: [
        {
          id: "h",
          hook: "report:summary",
          label: "Hook",
          content: "Body text",
          href: "https://example.test/docs",
          filePath: "src/foo.ts",
          language: "typescript",
          priority: 10,
        },
        {
          id: "h2",
          hook: "report:summary",
          label: "Hook2",
          priority: Number.NaN,
          content: 42,
        },
      ],
    });
    expect(result?.hooks?.[0]).toMatchObject({
      content: "Body text",
      href: "https://example.test/docs",
      filePath: "src/foo.ts",
      language: "typescript",
      priority: 10,
    });
    expect(result?.hooks?.[1]).toEqual({ id: "h2", hook: "report:summary", label: "Hook2" });
    expect(result?.hooks?.[1]).not.toHaveProperty("priority");
    expect(result?.hooks?.[1]).not.toHaveProperty("content");
  });
});

describe("isCoverageThemeToken", () => {
  it("returns true for every documented token", () => {
    for (const token of COVERAGE_THEME_TOKENS) {
      expect(isCoverageThemeToken(token)).toBe(true);
    }
  });

  it("rejects unknown tokens and protocol-pollution attempts", () => {
    expect(isCoverageThemeToken("unknown")).toBe(false);
    expect(isCoverageThemeToken("__proto__")).toBe(false);
    expect(isCoverageThemeToken("constructor")).toBe(false);
    expect(isCoverageThemeToken("toString")).toBe(false);
    expect(isCoverageThemeToken("")).toBe(false);
  });
});

describe("isSafeThemeTokenValue", () => {
  it("accepts trimmed hex colors at standard lengths", () => {
    expect(isSafeThemeTokenValue("#abc")).toBe(true);
    expect(isSafeThemeTokenValue("#ABCD")).toBe(true);
    expect(isSafeThemeTokenValue("#abcdef")).toBe(true);
    expect(isSafeThemeTokenValue("#abcdefAB")).toBe(true);
    expect(isSafeThemeTokenValue("  #abcdef  ")).toBe(true);
  });

  it("accepts rgb/rgba/hsl/hsla functional notation", () => {
    expect(isSafeThemeTokenValue("rgb(0, 0, 0)")).toBe(true);
    expect(isSafeThemeTokenValue("rgba(255, 255, 255, 0.5)")).toBe(true);
    expect(isSafeThemeTokenValue("hsl(180, 50%, 50%)")).toBe(true);
    expect(isSafeThemeTokenValue("hsla(180, 50%, 50%, 0.5)")).toBe(true);
  });

  it("accepts simple named colors but not multi-word identifiers", () => {
    expect(isSafeThemeTokenValue("red")).toBe(true);
    expect(isSafeThemeTokenValue("currentColor")).toBe(true);
    expect(isSafeThemeTokenValue("light dark")).toBe(false);
  });

  it("rejects anything that could break out of a CSS declaration", () => {
    expect(isSafeThemeTokenValue("")).toBe(false);
    expect(isSafeThemeTokenValue("   ")).toBe(false);
    expect(isSafeThemeTokenValue("red; background: url(javascript:alert(1))")).toBe(false);
    expect(isSafeThemeTokenValue("url(javascript:alert(1))")).toBe(false);
    expect(isSafeThemeTokenValue("expression(alert(1))")).toBe(false);
    expect(isSafeThemeTokenValue("rgb(0,0,0); color: red")).toBe(false);
  });

  it("rejects values longer than the 80-character budget", () => {
    expect(isSafeThemeTokenValue("a".repeat(80))).toBe(true);
    expect(isSafeThemeTokenValue("a".repeat(81))).toBe(false);
  });
});

describe("sanitizeCoverageHref", () => {
  it("preserves whitelisted absolute URLs after trimming", () => {
    expect(sanitizeCoverageHref("  https://example.test/docs  ")).toBe(
      "https://example.test/docs",
    );
    expect(sanitizeCoverageHref("http://example.test")).toBe("http://example.test");
    expect(sanitizeCoverageHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("preserves same-origin relative paths", () => {
    expect(sanitizeCoverageHref("/runs/1")).toBe("/runs/1");
    expect(sanitizeCoverageHref("relative/path")).toBe("relative/path");
    expect(sanitizeCoverageHref("#anchor")).toBe("#anchor");
    expect(sanitizeCoverageHref("?q=1")).toBe("?q=1");
  });

  it("rejects empty / whitespace-only input", () => {
    expect(sanitizeCoverageHref("")).toBeUndefined();
    expect(sanitizeCoverageHref("   ")).toBeUndefined();
  });

  it("rejects dangerous protocols regardless of casing or padding", () => {
    expect(sanitizeCoverageHref("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeCoverageHref("JAVASCRIPT:alert(1)")).toBeUndefined();
    expect(sanitizeCoverageHref("  jaVaScRiPt:alert(1)  ")).toBeUndefined();
    expect(sanitizeCoverageHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(sanitizeCoverageHref("vbscript:msgbox(1)")).toBeUndefined();
    expect(sanitizeCoverageHref("file:///etc/passwd")).toBeUndefined();
    expect(sanitizeCoverageHref("tel:+1234")).toBeUndefined();
  });

  it("rejects protocol-relative authority hijacks (the bug we just fixed)", () => {
    expect(sanitizeCoverageHref("//evil.com/x")).toBeUndefined();
    expect(sanitizeCoverageHref("  //evil.com  ")).toBeUndefined();
    expect(sanitizeCoverageHref("\\\\evil.com")).toBeUndefined();
    expect(sanitizeCoverageHref("/\\evil.com")).toBeUndefined();
    expect(sanitizeCoverageHref("\\/evil.com")).toBeUndefined();
  });

  it("returns undefined when URL parsing throws on malformed input", () => {
    // An unterminated IPv6 literal makes the URL parser throw — we should
    // catch that and return undefined rather than letting it propagate.
    expect(sanitizeCoverageHref("http://[::1")).toBeUndefined();
    expect(sanitizeCoverageHref("https://[invalid")).toBeUndefined();
  });

  it("returns undefined for unknown but parseable schemes", () => {
    // ftp:// parses cleanly but is not whitelisted; the function should fall
    // through to the trailing `return undefined`.
    expect(sanitizeCoverageHref("ftp://example.test/")).toBeUndefined();
    expect(sanitizeCoverageHref("ws://example.test/")).toBeUndefined();
  });

  it("exposes the documented hook locations", () => {
    expect(COVERAGE_UI_HOOKS).toContain("report:header");
    expect(COVERAGE_UI_HOOKS).toContain("report:summary");
    expect(COVERAGE_UI_HOOKS).toContain("file:toolbar");
    expect(COVERAGE_UI_HOOKS).toContain("sidebar:panel");
  });
});
