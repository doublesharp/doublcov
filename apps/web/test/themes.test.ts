import { describe, expect, it } from "vitest";
import type { CoverageTheme, CoverageThemeMode } from "@0xdoublesharp/doublcov-core";
import { builtInThemes, themeMode, themeTokens } from "../src/themes";

describe("builtInThemes", () => {
  it("ships with light, dark, contrast, and paper", () => {
    expect(builtInThemes.map((t) => t.id).sort()).toEqual(
      ["contrast", "dark", "light", "paper"].sort(),
    );
  });

  it("exposes the canonical token set from coverage-core", () => {
    expect(Array.isArray(themeTokens)).toBe(true);
    expect(themeTokens.length).toBeGreaterThan(0);
    // every token is a non-empty string
    for (const token of themeTokens) {
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    }
  });

  it("every built-in theme has a label and at least one token", () => {
    for (const theme of builtInThemes) {
      expect(theme.label).toBeTruthy();
      expect(Object.keys(theme.tokens).length).toBeGreaterThan(0);
    }
  });
});

describe("themeMode", () => {
  it("returns the explicit mode when provided", () => {
    const light: CoverageTheme = {
      id: "x",
      label: "X",
      mode: "light",
      tokens: {},
    };
    expect(themeMode(light)).toBe("light");
    const dark: CoverageTheme = {
      id: "y",
      label: "Y",
      mode: "dark",
      tokens: {},
    };
    expect(themeMode(dark)).toBe("dark");
  });

  it("falls back to 'dark' when mode is omitted from a custom theme", () => {
    // probe: a theme with no mode field at all
    const theme: CoverageTheme = { id: "n", label: "N", tokens: {} };
    expect(themeMode(theme)).toBe("dark");
  });

  it("falls back to 'dark' when the theme is undefined", () => {
    expect(themeMode(undefined)).toBe("dark");
  });

  it("returns whatever the .mode is when set to an out-of-spec value via cast", () => {
    // BUG PROBE: themeMode does no validation of the mode string. If a custom
    // theme arrives with mode:"auto" (or any other unknown string), it leaks
    // through verbatim — applyTheme() then never adds the .dark class because
    // the comparison is strictly === "dark", but the dataset.theme attribute
    // still ends up tagged with the unexpected mode. Lock current behavior.
    const oddMode = "auto" as unknown as CoverageThemeMode;
    const theme: CoverageTheme = {
      id: "auto",
      label: "Auto",
      mode: oddMode,
      tokens: {},
    };
    expect(themeMode(theme)).toBe("auto");
  });

  it("returns 'dark' when mode is null (cast)", () => {
    const theme = {
      id: "z",
      label: "Z",
      mode: null,
      tokens: {},
    } as unknown as CoverageTheme;
    // null ?? "dark" -> "dark"
    expect(themeMode(theme)).toBe("dark");
  });
});
