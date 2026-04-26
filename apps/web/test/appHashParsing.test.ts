import { describe, expect, it } from "vitest";
import {
  buildHashFragment,
  parseBoundedInteger,
  parseHashState,
  parsePositiveInteger,
  parseUncoveredKind,
} from "../src/appHelpers";

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
