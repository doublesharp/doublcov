import { describe, expect, it } from "vitest";
import type {
  CoverageHookContribution,
  CoverageTheme,
} from "@0xdoublesharp/doublcov-core";
import { hookMatchesFile, mergeThemes, sortHooks } from "../src/appHelpers";

describe("mergeThemes", () => {
  it("preserves built-in themes when no custom themes are provided", () => {
    const base: CoverageTheme[] = [
      { id: "light", label: "Light", mode: "light", tokens: { bg: "#fff" } },
      { id: "dark", label: "Dark", mode: "dark", tokens: { bg: "#000" } },
    ];
    expect(mergeThemes(base, [])).toEqual(base);
  });

  it("overlays custom themes on top of built-ins, deep-merging tokens", () => {
    const base: CoverageTheme[] = [
      {
        id: "dark",
        label: "Dark",
        mode: "dark",
        tokens: { bg: "#000", panel: "#111", border: "#222" },
      },
    ];
    const custom: CoverageTheme[] = [
      { id: "dark", label: "Dark Plus", tokens: { panel: "#444" } },
      {
        id: "ci",
        label: "CI",
        mode: "dark",
        tokens: { bg: "#101010" },
      },
    ];
    const merged = mergeThemes(base, custom);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({
      id: "dark",
      label: "Dark Plus",
      mode: "dark",
      tokens: { bg: "#000", panel: "#444", border: "#222" },
    });
    expect(merged[1]?.id).toBe("ci");
  });

  it("drops candidates without an id or label", () => {
    const base: CoverageTheme[] = [{ id: "ok", label: "OK", tokens: {} }];
    const custom: CoverageTheme[] = [
      { id: "", label: "Bad", tokens: {} },
      { id: "another", label: "", tokens: {} },
    ];
    expect(mergeThemes(base, custom).map((t) => t.id)).toEqual(["ok"]);
  });
});

describe("sortHooks", () => {
  const hook = (
    overrides: Partial<CoverageHookContribution>,
  ): CoverageHookContribution => ({
    id: "h",
    hook: "report:header",
    label: "Hook",
    ...overrides,
  });

  it("orders by ascending priority then alphabetical label", () => {
    const result = sortHooks([
      hook({ id: "c", label: "Charlie", priority: 200 }),
      hook({ id: "a", label: "Alpha", priority: 50 }),
      hook({ id: "b", label: "Bravo", priority: 50 }),
    ]);
    expect(result.map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("treats missing priority as 100 (default)", () => {
    const result = sortHooks([
      hook({ id: "a", label: "A", priority: 90 }),
      hook({ id: "b", label: "B" }),
      hook({ id: "c", label: "C", priority: 110 }),
    ]);
    expect(result.map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      hook({ id: "z", label: "Z", priority: 200 }),
      hook({ id: "a", label: "A", priority: 50 }),
    ];
    const before = input.map((h) => h.id);
    sortHooks(input);
    expect(input.map((h) => h.id)).toEqual(before);
  });
});

describe("hookMatchesFile", () => {
  const file = {
    path: "src/foo.ts",
    displayPath: "foo.ts",
    language: "typescript",
  };

  it("returns false when no file is selected", () => {
    expect(
      hookMatchesFile({ id: "x", hook: "file:toolbar", label: "Hook" }, null),
    ).toBe(false);
  });

  it("matches a hook with no filePath or language constraint", () => {
    expect(
      hookMatchesFile({ id: "x", hook: "file:toolbar", label: "Hook" }, file),
    ).toBe(true);
  });

  it("rejects when hook.filePath does not match file.path or file.displayPath", () => {
    expect(
      hookMatchesFile(
        { id: "x", hook: "file:toolbar", label: "Hook", filePath: "other.ts" },
        file,
      ),
    ).toBe(false);
  });

  it("accepts when hook.filePath matches displayPath", () => {
    expect(
      hookMatchesFile(
        { id: "x", hook: "file:toolbar", label: "Hook", filePath: "foo.ts" },
        file,
      ),
    ).toBe(true);
  });

  it("rejects when hook.language does not match", () => {
    expect(
      hookMatchesFile(
        { id: "x", hook: "file:toolbar", label: "Hook", language: "python" },
        file,
      ),
    ).toBe(false);
  });
});
