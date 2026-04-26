import { afterEach, describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_PARSERS,
  parseDiagnostics,
  parseFoundryBytecodeReport,
  parseFoundryDebugReport,
  registerDiagnosticParser,
  resolveDiagnosticParser,
} from "../src/diagnostics.js";

// Snapshot the registry so we can restore between tests — this module mutates
// global state and other tests rely on it.
const baseline = DIAGNOSTIC_PARSERS.slice();

afterEach(() => {
  DIAGNOSTIC_PARSERS.splice(0, DIAGNOSTIC_PARSERS.length, ...baseline);
});

describe("registerDiagnosticParser", () => {
  it("registers a new parser exactly once", () => {
    registerDiagnosticParser({
      id: "custom-once",
      label: "Once",
      parse: () => [],
    });
    const occurrences = DIAGNOSTIC_PARSERS.filter(
      (parser) => parser.id === "custom-once",
    );
    expect(occurrences).toHaveLength(1);
    expect(resolveDiagnosticParser("custom-once")?.label).toBe("Once");
  });

  it("replaces a parser with the same id rather than duplicating it", () => {
    registerDiagnosticParser({ id: "dup", label: "first", parse: () => [] });
    registerDiagnosticParser({ id: "dup", label: "second", parse: () => [] });
    const occurrences = DIAGNOSTIC_PARSERS.filter(
      (parser) => parser.id === "dup",
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.label).toBe("second");
    expect(resolveDiagnosticParser("dup")?.label).toBe("second");
  });

  it("survives a desync where the parser was removed from the array but not the map", () => {
    // External callers may mutate DIAGNOSTIC_PARSERS directly (e.g. via the
    // splice-based reset other tests use). registerDiagnosticParser should
    // not crash when its findIndex returns -1.
    registerDiagnosticParser({ id: "desync", label: "v1", parse: () => [] });
    const idx = DIAGNOSTIC_PARSERS.findIndex(
      (parser) => parser.id === "desync",
    );
    DIAGNOSTIC_PARSERS.splice(idx, 1);
    expect(() =>
      registerDiagnosticParser({ id: "desync", label: "v2", parse: () => [] }),
    ).not.toThrow();
    expect(resolveDiagnosticParser("desync")?.label).toBe("v2");
    expect(DIAGNOSTIC_PARSERS.some((parser) => parser.id === "desync")).toBe(
      true,
    );
  });
});

describe("resolveDiagnosticParser", () => {
  it("returns undefined for an unknown id", () => {
    expect(resolveDiagnosticParser("nope-not-real")).toBeUndefined();
  });

  it("resolves the built-in foundry parsers", () => {
    expect(resolveDiagnosticParser("foundry-debug")).toBeDefined();
    expect(resolveDiagnosticParser("foundry-bytecode")).toBeDefined();
  });
});

describe("parseDiagnostics", () => {
  it("returns an empty array for undefined and empty inputs", () => {
    expect(parseDiagnostics(undefined)).toEqual([]);
    expect(parseDiagnostics([])).toEqual([]);
  });

  it("emits a warning for unknown parsers without dropping later results", () => {
    const diagnostics = parseDiagnostics([
      { parser: "totally-unknown", content: "ignored" },
      { parser: "foundry-debug", content: "src/A.sol:1: hi" },
    ]);
    const unknown = diagnostics.find((d) => d.source === "totally-unknown");
    const known = diagnostics.find((d) => d.source === "foundry-debug");
    expect(unknown?.severity).toBe("warning");
    expect(unknown?.message).toMatch(/unknown/i);
    expect(known?.filePath).toBe("src/A.sol");
  });

  it("isolates parser exceptions so one bad parser does not kill the report", () => {
    registerDiagnosticParser({
      id: "explodes",
      label: "Boom",
      parse: () => {
        throw new Error("kaboom");
      },
    });

    let result;
    expect(() => {
      result = parseDiagnostics([
        { parser: "foundry-debug", content: "src/A.sol:1: alpha" },
        { parser: "explodes", content: "anything" },
        { parser: "foundry-debug", content: "src/B.sol:2: beta" },
      ]);
    }).not.toThrow();

    const sources = (result ?? []).map((diagnostic) => diagnostic.source);
    expect(sources).toContain("foundry-debug");
    // We should also surface a warning describing the failure so it doesn't
    // silently disappear.
    const failure = (result ?? []).find(
      (diagnostic) =>
        diagnostic.source === "explodes" && diagnostic.severity === "warning",
    );
    expect(failure?.message).toMatch(/kaboom|fail/i);
  });

  it("ignores all-whitespace content and produces no diagnostics", () => {
    const diagnostics = parseDiagnostics([
      { parser: "foundry-debug", content: "   \n\n\t\n  " },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("handles unicode noise without throwing", () => {
    expect(() =>
      parseDiagnostics([
        { parser: "foundry-debug", content: "💥💥💥\n日本\n☃" },
      ]),
    ).not.toThrow();
  });

  it("assigns unique ids per parser invocation", () => {
    const diagnostics = parseDiagnostics([
      { parser: "foundry-debug", content: "src/A.sol:1: a\nsrc/B.sol:2: b" },
      { parser: "foundry-debug", content: "src/C.sol:3: c" },
    ]);
    const ids = diagnostics.map((diagnostic) => diagnostic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("extracts Foundry diagnostic locations with spaces, scoped dirs, and Windows drives", () => {
    const diagnostics = parseDiagnostics([
      {
        parser: "foundry-debug",
        content: [
          "contracts/My Contract.sol:7: uncovered",
          "lib/@scope/Foo.sol:12: uncovered",
          "C:\\repo\\src\\Foo.sol:3: uncovered",
        ].join("\n"),
      },
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.filePath)).toEqual([
      "contracts/My Contract.sol",
      "lib/@scope/Foo.sol",
      "C:\\repo\\src\\Foo.sol",
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.line)).toEqual([
      7, 12, 3,
    ]);
  });
});

describe("parseDiagnostics through the registry", () => {
  it("invokes the registered foundry-bytecode parser", () => {
    const diagnostics = parseDiagnostics([
      { parser: "foundry-bytecode", content: "src/Foo.sol:5: bytecode-only" },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      source: "foundry-bytecode",
      filePath: "src/Foo.sol",
      line: 5,
    });
  });

  it("surfaces a sensible message when a parser throws a non-Error value", () => {
    registerDiagnosticParser({
      id: "throws-string",
      label: "Throws String",
      parse: () => {
        throw "raw-string-error";
      },
    });
    const diagnostics = parseDiagnostics([
      { parser: "throws-string", content: "anything" },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toContain("raw-string-error");
  });
});

describe("parseFoundryDebugReport / parseFoundryBytecodeReport", () => {
  it("returns no diagnostics for undefined or empty input", () => {
    expect(parseFoundryDebugReport(undefined)).toEqual([]);
    expect(parseFoundryDebugReport("")).toEqual([]);
    expect(parseFoundryBytecodeReport(undefined)).toEqual([]);
    expect(parseFoundryBytecodeReport("   ")).toEqual([]);
  });

  it("extracts file and line from a foundry bytecode report", () => {
    const [diagnostic] = parseFoundryBytecodeReport(
      "src/Foo.sol:99: bytecode-only",
    );
    expect(diagnostic).toMatchObject({
      source: "foundry-bytecode",
      filePath: "src/Foo.sol",
      line: 99,
    });
  });
});
