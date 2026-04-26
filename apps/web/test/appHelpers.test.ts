import { describe, expect, it } from "vitest";
import type {
  CoverageHookContribution,
  CoverageStatus,
  CoverageTheme,
  UncoveredItem,
} from "@0xdoublesharp/doublcov-core";
import {
  buildHashFragment,
  coverageClass,
  displayUncoveredItemLabel,
  hookMatchesFile,
  isEditableTarget,
  isLikelyMangledSymbol,
  mergeThemes,
  parseBoundedInteger,
  parseHashState,
  parsePositiveInteger,
  parseUncoveredKind,
  percent,
  selectionClass,
  sortHooks,
} from "../src/appHelpers";

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

describe("coverageClass", () => {
  it.each<[CoverageStatus | undefined, string]>([
    ["covered", "bg-[var(--covered)]"],
    ["partial", "bg-[var(--partial)]"],
    ["uncovered", "bg-[var(--uncovered)]"],
    ["ignored", "ignored-line"],
    ["neutral", ""],
    [undefined, ""],
  ])("maps %s to %s", (status, expected) => {
    expect(coverageClass(status)).toBe(expected);
  });
});

describe("selectionClass", () => {
  it("returns selected-line when no range and the line matches selectedLine", () => {
    expect(selectionClass(5, 5, null)).toBe("selected-line");
    expect(selectionClass(6, 5, null)).toBe("");
  });

  it("returns nothing for a line outside the uncovered range", () => {
    expect(selectionClass(2, null, { start: 5, end: 7 })).toBe("");
    expect(selectionClass(8, null, { start: 5, end: 7 })).toBe("");
  });

  it("returns the section class for the start line and includes -start", () => {
    expect(selectionClass(5, null, { start: 5, end: 7 })).toBe(
      "selected-uncovered-section selected-uncovered-section-start",
    );
  });

  it("returns the section class for the end line and includes -end", () => {
    expect(selectionClass(7, null, { start: 5, end: 7 })).toBe(
      "selected-uncovered-section selected-uncovered-section-end",
    );
  });

  it("returns -start and -end together when the range is one line", () => {
    expect(selectionClass(5, null, { start: 5, end: 5 })).toBe(
      "selected-uncovered-section selected-uncovered-section-start selected-uncovered-section-end",
    );
  });

  it("returns just the base class for a middle line", () => {
    expect(selectionClass(6, null, { start: 5, end: 7 })).toBe(
      "selected-uncovered-section",
    );
  });
});

describe("isLikelyMangledSymbol", () => {
  it.each([
    ["_RNvCs1abc_3foo", true], // Rust
    ["_ZN3std3sys6unix4exit17h0123abc", true], // Itanium C++
    ["__ZN3std3sys6unix4exit17h0123abc", true], // Itanium prefixed
    ["?foo@@YAXXZ", true], // MSVC
    ["$s12myCompany5MyAppC", true], // Swift
    ["_$s12myCompany5MyAppC", true], // Swift prefixed
  ])("recognizes %s as mangled", (sym) => {
    expect(isLikelyMangledSymbol(sym)).toBe(true);
  });

  it.each([
    "myFunction",
    "process_data",
    "render",
    "_internal",
    "Foo::bar",
    "",
  ])("does not flag %s", (sym) => {
    expect(isLikelyMangledSymbol(sym)).toBe(false);
  });
});

describe("displayUncoveredItemLabel", () => {
  const item = (overrides: Partial<UncoveredItem>): UncoveredItem => ({
    id: "i",
    kind: "line",
    fileId: "f",
    filePath: "src/foo.ts",
    line: 1,
    label: "Label",
    detail: "",
    ...overrides,
  });

  it("returns the label as-is for non-function items", () => {
    expect(displayUncoveredItemLabel(item({ kind: "line" }))).toBe("Label");
    expect(displayUncoveredItemLabel(item({ kind: "branch" }))).toBe("Label");
  });

  it("rewrites mangled function symbols to a 'Function at line N' summary", () => {
    expect(
      displayUncoveredItemLabel(
        item({ kind: "function", label: "_RNvCsabc_3foo", line: 42 }),
      ),
    ).toBe("Function at line 42");
  });

  it("preserves human-readable function names", () => {
    expect(
      displayUncoveredItemLabel(
        item({ kind: "function", label: "renderApp", line: 10 }),
      ),
    ).toBe("renderApp");
  });
});

describe("percent", () => {
  it("formats numbers to two decimal places with a percent sign", () => {
    expect(percent(0)).toBe("0.00%");
    expect(percent(50.5)).toBe("50.50%");
    expect(percent(99.9999)).toBe("100.00%");
    expect(percent(33.333333)).toBe("33.33%");
  });
});

describe("isEditableTarget", () => {
  it("returns false for null and non-element event targets", () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it("returns true for input/textarea/select/contentEditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(editable);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    editable.remove();
  });

  it("returns false for plain elements", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
  });
});

describe("parsePositiveInteger", () => {
  it("returns the parsed value for clean positive integers", () => {
    expect(parsePositiveInteger("1")).toBe(1);
    expect(parsePositiveInteger("12345")).toBe(12345);
  });

  it("returns null for null/empty/zero/negative/fractional/garbage", () => {
    expect(parsePositiveInteger(null)).toBeNull();
    expect(parsePositiveInteger("")).toBeNull();
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("-5")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger("abc")).toBeNull();
  });
});

describe("parseBoundedInteger", () => {
  it("returns the parsed value when within bounds", () => {
    expect(parseBoundedInteger("100", 0, 200, 50)).toBe(100);
  });

  it("clamps values outside the range", () => {
    expect(parseBoundedInteger("500", 0, 200, 50)).toBe(200);
    expect(parseBoundedInteger("-10", 0, 200, 50)).toBe(0);
  });

  it("returns the fallback for null/empty/non-integer", () => {
    expect(parseBoundedInteger(null, 0, 200, 50)).toBe(50);
    expect(parseBoundedInteger("", 0, 200, 50)).toBe(50);
    expect(parseBoundedInteger("nope", 0, 200, 50)).toBe(50);
    expect(parseBoundedInteger("1.5", 0, 200, 50)).toBe(50);
  });
});

describe("parseUncoveredKind", () => {
  it.each(["line", "branch", "function"] as const)("accepts %s", (value) => {
    expect(parseUncoveredKind(value)).toBe(value);
  });

  it("falls back to 'all' for null/empty/unknown values", () => {
    expect(parseUncoveredKind(null)).toBe("all");
    expect(parseUncoveredKind("")).toBe("all");
    expect(parseUncoveredKind("LINE")).toBe("all");
    expect(parseUncoveredKind("methods")).toBe("all");
  });
});

describe("hash state round-trip", () => {
  it("parses an empty hash to defaults", () => {
    expect(parseHashState("")).toEqual({
      selectedFileId: "",
      selectedLine: null,
      selectedKind: "all",
      search: "",
      uncoveredOnly: true,
      navigatorCurrentFileOnly: true,
    });
  });

  it("parses a populated hash with leading #", () => {
    const state = parseHashState(
      "#file=0001-foo&line=12&kind=branch&q=test&uncovered=0&navFile=0",
    );
    expect(state).toEqual({
      selectedFileId: "0001-foo",
      selectedLine: 12,
      selectedKind: "branch",
      search: "test",
      uncoveredOnly: false,
      navigatorCurrentFileOnly: false,
    });
  });

  it("rejects malformed line and kind values, leaving safe defaults", () => {
    const state = parseHashState("#line=-3&kind=evil");
    expect(state.selectedLine).toBeNull();
    expect(state.selectedKind).toBe("all");
  });

  it("builds a fragment that omits default values", () => {
    expect(
      buildHashFragment({
        selectedFileId: "",
        selectedLine: null,
        selectedKind: "all",
        search: "",
        uncoveredOnly: true,
        navigatorCurrentFileOnly: true,
      }),
    ).toBe("");
  });

  it("includes only the changed fields in the fragment", () => {
    const fragment = buildHashFragment({
      selectedFileId: "0001-foo",
      selectedLine: 12,
      selectedKind: "branch",
      search: "needle",
      uncoveredOnly: false,
      navigatorCurrentFileOnly: false,
    });
    const params = new URLSearchParams(fragment);
    expect(params.get("file")).toBe("0001-foo");
    expect(params.get("line")).toBe("12");
    expect(params.get("kind")).toBe("branch");
    expect(params.get("q")).toBe("needle");
    expect(params.get("uncovered")).toBe("0");
    expect(params.get("navFile")).toBe("0");
  });

  it("round-trips populated state losslessly", () => {
    const state = {
      selectedFileId: "0042-bar",
      selectedLine: 7,
      selectedKind: "line" as const,
      search: "find me",
      uncoveredOnly: false,
      navigatorCurrentFileOnly: false,
    };
    expect(parseHashState(`#${buildHashFragment(state)}`)).toEqual(state);
  });
});
