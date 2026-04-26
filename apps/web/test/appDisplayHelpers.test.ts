import { describe, expect, it } from "vitest";
import type { CoverageStatus, UncoveredItem } from "@0xdoublesharp/doublcov-core";
import {
  coverageClass,
  displayUncoveredItemLabel,
  isEditableTarget,
  isLikelyMangledSymbol,
  percent,
  selectionClass,
} from "../src/appHelpers";

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
    ["_RNvCs1abc_3foo", true],
    ["_ZN3std3sys6unix4exit17h0123abc", true],
    ["__ZN3std3sys6unix4exit17h0123abc", true],
    ["?foo@@YAXXZ", true],
    ["$s12myCompany5MyAppC", true],
    ["_$s12myCompany5MyAppC", true],
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
