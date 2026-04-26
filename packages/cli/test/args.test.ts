import { describe, expect, it } from "vitest";
import { helpText, parseCommand } from "../src/args.js";
import {
  coverageBuilders,
  registerCoverageBuilder,
} from "../src/builders/registry.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";

describe("parseCommand", () => {
  it("uses defaults for common build paths", () => {
    expect(parseCommand(["build"])).toMatchObject({
      name: "build",
      options: {
        lcov: "lcov.info",
        sources: ["src"],
        out: "coverage/report",
        history: ".doublcov/history.json",
        customization: {
          path: "doublcov.config.json",
          required: false,
        },
      },
    });
  });

  it("parses build options", () => {
    expect(
      parseCommand([
        "build",
        "--lcov",
        "lcov.info",
        "--sources",
        "src, contracts",
        "--out",
        "coverage-report",
        "--history",
        ".custom/history.json",
        "--name",
        "Diesis Contracts",
      ]),
    ).toMatchObject({
      name: "build",
      options: {
        lcov: "lcov.info",
        sources: ["src", "contracts"],
        out: "coverage-report",
        history: ".custom/history.json",
        name: "Diesis Contracts",
      },
    });
  });

  it("parses report mode and static server options", () => {
    expect(parseCommand(["build", "--mode", "static"])).toMatchObject({
      name: "build",
      options: {
        mode: "static",
      },
    });
    expect(
      parseCommand([
        "serve",
        "coverage/report",
        "--port",
        "0",
        "--timeout",
        "45m",
      ]),
    ).toMatchObject({
      name: "serve",
      reportDir: "coverage/report",
      port: 0,
      timeoutMs: 45 * 60 * 1000,
    });
    expect(() => parseCommand(["build", "--mode", "large"])).toThrow(
      /Invalid --mode/,
    );
    expect(() => parseCommand(["serve", "--timeout", "soon"])).toThrow(
      /Invalid --timeout/,
    );
  });

  it("parses generic and Foundry diagnostic inputs", () => {
    expect(
      parseCommand([
        "build",
        "--diagnostic",
        "custom:coverage/custom.log",
        "--debug",
        "coverage.debug",
        "--bytecode=coverage.bytecode",
      ]),
    ).toMatchObject({
      name: "build",
      options: {
        diagnostics: [
          { parser: "custom", path: "coverage/custom.log" },
          { parser: "foundry-debug", path: "coverage.debug" },
          { parser: "foundry-bytecode", path: "coverage.bytecode" },
        ],
      },
    });
  });

  it("parses report customization options", () => {
    expect(
      parseCommand([
        "build",
        "--customization",
        "coverage/doublcov.json",
        "--theme",
        "high-contrast",
      ]),
    ).toMatchObject({
      name: "build",
      options: {
        customization: {
          path: "coverage/doublcov.json",
          defaultTheme: "high-contrast",
          required: true,
        },
      },
    });

    expect(parseCommand(["vite", "--theme", "ocean"])).toMatchObject({
      name: "builder",
      options: {
        customization: {
          path: "doublcov.config.json",
          defaultTheme: "ocean",
          required: false,
        },
      },
    });
  });

  it("parses auto-open overrides for build and builder commands", () => {
    expect(parseCommand(["build", "--open"])).toMatchObject({
      name: "build",
      options: {
        open: true,
      },
    });

    expect(parseCommand(["build", "--no-open"])).toMatchObject({
      name: "build",
      options: {
        open: false,
      },
    });

    expect(
      parseCommand(["forge", "--open=false", "--", "--exclude-tests"]),
    ).toMatchObject({
      name: "builder",
      options: {
        open: false,
        builderArgs: ["--exclude-tests"],
      },
    });
  });

  it("uses defaults for common forge paths", () => {
    expect(parseCommand(["forge", "--", "--exclude-tests"])).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        sources: ["src"],
        sourceExtensions: [".sol"],
        out: "coverage/report",
        history: ".doublcov/history.json",
        port: 0,
        timeoutMs: 30 * 60 * 1000,
        builderArgs: ["--exclude-tests"],
      },
    });
  });

  it("parses forge options and passes remaining args to Foundry", () => {
    expect(
      parseCommand([
        "forge",
        "--open",
        "--sources",
        "src,contracts",
        "--out",
        "coverage-report",
        "--history",
        ".doublcov/history.json",
        "--name",
        "Diesis Contracts",
        "--port",
        "60733",
        "--",
        "--exclude-tests",
        "--ir-minimum",
        "--match-path",
        "test/Foo.t.sol",
      ]),
    ).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        open: true,
        sources: ["src", "contracts"],
        sourceExtensions: [".sol"],
        out: "coverage-report",
        history: ".doublcov/history.json",
        name: "Diesis Contracts",
        port: 60733,
        builderArgs: [
          "--exclude-tests",
          "--ir-minimum",
          "--match-path",
          "test/Foo.t.sol",
        ],
      },
    });
  });

  it("does not let boolean forge flags consume following CLI flags", () => {
    expect(
      parseCommand([
        "forge",
        "--open",
        "--sources",
        "src",
        "--",
        "--exclude-tests",
      ]),
    ).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        open: true,
        sources: ["src"],
        builderArgs: ["--exclude-tests"],
      },
    });
  });

  it("uses builder plugin defaults", () => {
    expect(parseCommand(["hardhat"])).toMatchObject({
      name: "builder",
      builder: "hardhat",
      options: {
        sources: ["contracts"],
        sourceExtensions: [".sol"],
      },
    });

    expect(parseCommand(["vite", "--", "--runInBand"])).toMatchObject({
      name: "builder",
      builder: "vite",
      options: {
        sources: ["src"],
        sourceExtensions: expect.arrayContaining([
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
        ]),
        builderArgs: ["--runInBand"],
      },
    });

    expect(parseCommand(["jest"])).toMatchObject({
      name: "builder",
      builder: "jest",
      options: {
        sources: ["src"],
        sourceExtensions: expect.arrayContaining([
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
        ]),
      },
    });

    expect(parseCommand(["pytest"])).toMatchObject({
      name: "builder",
      builder: "pytest",
      options: {
        sources: ["src"],
        sourceExtensions: [".py", ".pyw"],
      },
    });

    expect(parseCommand(["cargo-llvm-cov"])).toMatchObject({
      name: "builder",
      builder: "cargo-llvm-cov",
      options: {
        sources: ["src"],
        sourceExtensions: [".rs"],
      },
    });

    expect(parseCommand(["lcov-capture"])).toMatchObject({
      name: "builder",
      builder: "lcov-capture",
      options: {
        sources: ["src", "include"],
        sourceExtensions: expect.arrayContaining([".c", ".cpp", ".h", ".hpp"]),
      },
    });
  });

  it("shows CLI help for command help flags before passthrough args", () => {
    expect(parseCommand(["forge", "--help"])).toEqual({ name: "help" });
    expect(parseCommand(["forge", "--", "--help"])).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        builderArgs: ["--help"],
      },
    });
  });

  it("rejects out-of-range, fractional, or non-numeric --port values", () => {
    expect(() => parseCommand(["forge", "--port", "65536"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port", "-1"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port", "abc"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port", "1.5"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["open", "--port", "70000"])).toThrow(
      /Invalid --port/,
    );
  });

  it("accepts valid --port values at both ends of the range", () => {
    expect(parseCommand(["forge", "--port", "0"])).toMatchObject({
      options: { port: 0 },
    });
    expect(parseCommand(["forge", "--port", "1"])).toMatchObject({
      options: { port: 1 },
    });
    expect(parseCommand(["forge", "--port", "65535"])).toMatchObject({
      options: { port: 65535 },
    });
  });

  it("rejects an empty --port value (was silently parsed as 0)", () => {
    // Bug: Number("") === 0 and Number.isInteger(0) is true, so previously
    // `--port ""` was accepted as port 0 instead of reported as invalid.
    expect(() => parseCommand(["forge", "--port=", "--", "x"])).toThrow(
      /Invalid --port/,
    );
  });

  it("rejects whitespace-only --port", () => {
    expect(() => parseCommand(["forge", "--port=   "])).toThrow(
      /Invalid --port/,
    );
  });

  it("rejects --port given as hex/exponent (non-decimal)", () => {
    // Number("0x10") === 16 and Number("1e2") === 100 — both Number.isInteger.
    // We require strictly decimal-digit input.
    expect(() => parseCommand(["forge", "--port=0x10"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port=1e2"])).toThrow(
      /Invalid --port/,
    );
  });

  it("rejects malformed --timeout values", () => {
    expect(() => parseCommand(["serve", "--timeout", "5x"])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", "abc"])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", "-5m"])).toThrow(
      /Invalid --timeout/,
    );
    // `--timeout ""` is rejected by parseFlags as a missing value before it
    // reaches parseTimeout. `--timeout=` (inline empty) reaches parseTimeout
    // and produces "Invalid --timeout".
    expect(() => parseCommand(["serve", "--timeout", ""])).toThrow(
      /Missing value for --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout="])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", "1.5h"])).toThrow(
      /Invalid --timeout/,
    );
  });

  it("converts valid --timeout durations correctly", () => {
    expect(parseCommand(["serve", "--timeout", "0"])).toMatchObject({
      timeoutMs: 0,
    });
    expect(parseCommand(["serve", "--timeout", "500ms"])).toMatchObject({
      timeoutMs: 500,
    });
    expect(parseCommand(["serve", "--timeout", "30s"])).toMatchObject({
      timeoutMs: 30 * 1000,
    });
    expect(parseCommand(["serve", "--timeout", "2h"])).toMatchObject({
      timeoutMs: 2 * 60 * 60 * 1000,
    });
  });

  it("rejects malformed --diagnostic inputs", () => {
    // Missing colon entirely.
    expect(() =>
      parseCommand(["build", "--diagnostic", "no-colon-here"]),
    ).toThrow(/Invalid diagnostic input/);
    // Leading colon (empty parser).
    expect(() => parseCommand(["build", "--diagnostic", ":path"])).toThrow(
      /Invalid diagnostic input/,
    );
    // Trailing colon (empty path).
    expect(() => parseCommand(["build", "--diagnostic", "parser:"])).toThrow(
      /Invalid diagnostic input/,
    );
    // Just a colon.
    expect(() => parseCommand(["build", "--diagnostic", ":"])).toThrow(
      /Invalid diagnostic input/,
    );
  });

  it("preserves colons in the diagnostic path portion", () => {
    expect(
      parseCommand(["build", "--diagnostic", "custom:C:/path/to/file"]),
    ).toMatchObject({
      options: {
        diagnostics: [{ parser: "custom", path: "C:/path/to/file" }],
      },
    });
  });

  it("supports the --diagnostic=parser:path inline form", () => {
    expect(
      parseCommand(["build", "--diagnostic=custom:cov.log"]),
    ).toMatchObject({
      options: {
        diagnostics: [{ parser: "custom", path: "cov.log" }],
      },
    });
  });

  it("rejects --mode help-style flags as a whole-CLI help", () => {
    expect(parseCommand(["build", "--help", "--mode", "static"])).toEqual({
      name: "help",
    });
  });

  it("filters empty entries from comma-separated lists", () => {
    expect(parseCommand(["build", "--sources", ",,,a,,b,,,"])).toMatchObject({
      options: { sources: ["a", "b"] },
    });
    expect(
      parseCommand(["build", "--extensions", ", .ts , , .tsx , "]),
    ).toMatchObject({
      options: { sourceExtensions: [".ts", ".tsx"] },
    });
  });

  it("rejects an --open value that is not true or false", () => {
    expect(() => parseCommand(["build", "--open=maybe"])).toThrow(
      /Invalid --open/,
    );
  });

  it("rejects missing values for known value-taking flags", () => {
    expect(() => parseCommand(["build", "--lcov", "--out", "report"])).toThrow(
      /Missing value for --lcov/,
    );
    expect(() => parseCommand(["build", "--out"])).toThrow(
      /Missing value for --out/,
    );
    expect(() =>
      parseCommand(["build", "--sources", "--mode", "static"]),
    ).toThrow(/Missing value for --sources/);
    expect(() => parseCommand(["open", "--dir"])).toThrow(
      /Missing value for --dir/,
    );
  });

  it("throws on missing value for a repeated --diagnostic flag", () => {
    expect(() =>
      parseCommand(["build", "--diagnostic", "--lcov", "lcov.info"]),
    ).toThrow(/Missing value for --diagnostic/);
  });

  it("rejects unknown subcommands with a helpful message", () => {
    expect(() => parseCommand(["definitely-not-a-builder"])).toThrow(
      /Unknown command "definitely-not-a-builder"/,
    );
  });

  it("treats no args as help", () => {
    expect(parseCommand([])).toEqual({ name: "help" });
  });

  it("accepts -h as a top-level help flag", () => {
    expect(parseCommand(["-h"])).toEqual({ name: "help" });
  });

  it("returns helpText() without throwing and includes key sections", () => {
    const text = helpText();
    expect(typeof text).toBe("string");
    expect(text).toMatch(/Doublcov/);
    expect(text).toMatch(/Usage:/);
    expect(text).toMatch(/Builder options:/);
    expect(text).toMatch(/Build options:/);
    expect(text).toMatch(/Open options:/);
  });

  it("parses builder commands with lcov, extensions, mode, and passthrough args", () => {
    expect(
      parseCommand([
        "forge",
        "--lcov",
        "build/lcov.info",
        "--extensions",
        "sol,vy",
        "--mode",
        "static",
        "--",
        "--exclude-tests",
      ]),
    ).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        lcov: "build/lcov.info",
        sourceExtensions: ["sol", "vy"],
        mode: "static",
        builderArgs: ["--exclude-tests"],
      },
    });
  });

  it("ignores malformed empty-key flags without consuming valid flags", () => {
    expect(parseCommand(["build", "--=foo", "--lcov", "lcov.info"]))
      .toMatchObject({
        name: "build",
        options: { lcov: "lcov.info" },
      });
  });

  it("leaves unknown valueless flags undefined when followed by another flag", () => {
    expect(parseCommand(["build", "--frobnicate", "--lcov", "lcov.info"]))
      .toMatchObject({
        name: "build",
        options: { lcov: "lcov.info" },
      });
  });

  it("skips empty positional tokens when resolving the open report directory", () => {
    expect(parseCommand(["open", "", "real-report-dir"])).toMatchObject({
      name: "open",
      reportDir: "real-report-dir",
    });
  });

  it("uses global source defaults when a registered builder has no defaults", () => {
    const minimalBuilder: CoverageBuilderPlugin = {
      id: "minimal-defaults-test",
      aliases: [],
      label: "Minimal Defaults Test",
      description: "Has no source defaults",
      async prepareRun() {
        return { command: "true", args: [], lcov: "lcov.info" };
      },
    };
    registerCoverageBuilder(minimalBuilder);
    try {
      const parsed = parseCommand(["minimal-defaults-test"]);
      expect(parsed).toMatchObject({
        name: "builder",
        builder: "minimal-defaults-test",
        options: { sources: ["src"] },
      });
      if (parsed.name !== "builder") throw new Error("expected builder");
      expect(parsed.options.sourceExtensions).toEqual(
        expect.arrayContaining([".ts", ".js"]),
      );
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "minimal-defaults-test",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });
});
