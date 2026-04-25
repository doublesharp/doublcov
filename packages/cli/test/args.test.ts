import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/args.js";

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
          required: false
        }
      }
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
        "Diesis Contracts"
      ])
    ).toMatchObject({
      name: "build",
      options: {
        lcov: "lcov.info",
        sources: ["src", "contracts"],
        out: "coverage-report",
        history: ".custom/history.json",
        name: "Diesis Contracts"
      }
    });
  });

  it("parses generic and Foundry diagnostic inputs", () => {
    expect(
      parseCommand([
        "build",
        "--diagnostic",
        "custom:coverage/custom.log",
        "--debug",
        "coverage.debug",
        "--bytecode=coverage.bytecode"
      ])
    ).toMatchObject({
      name: "build",
      options: {
        diagnostics: [
          { parser: "custom", path: "coverage/custom.log" },
          { parser: "foundry-debug", path: "coverage.debug" },
          { parser: "foundry-bytecode", path: "coverage.bytecode" }
        ]
      }
    });
  });

  it("parses report customization options", () => {
    expect(parseCommand(["build", "--customization", "coverage/doublcov.json", "--theme", "high-contrast"])).toMatchObject({
      name: "build",
      options: {
        customization: {
          path: "coverage/doublcov.json",
          defaultTheme: "high-contrast",
          required: true
        }
      }
    });

    expect(parseCommand(["vite", "--theme", "ocean"])).toMatchObject({
      name: "builder",
      options: {
        customization: {
          path: "doublcov.config.json",
          defaultTheme: "ocean",
          required: false
        }
      }
    });
  });

  it("parses auto-open overrides for build and builder commands", () => {
    expect(parseCommand(["build", "--open"])).toMatchObject({
      name: "build",
      options: {
        open: true
      }
    });

    expect(parseCommand(["build", "--no-open"])).toMatchObject({
      name: "build",
      options: {
        open: false
      }
    });

    expect(parseCommand(["forge", "--open=false", "--", "--exclude-tests"])).toMatchObject({
      name: "builder",
      options: {
        open: false,
        builderArgs: ["--exclude-tests"]
      }
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
        port: 60732,
        builderArgs: ["--exclude-tests"]
      }
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
        "test/Foo.t.sol"
      ])
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
        builderArgs: ["--exclude-tests", "--ir-minimum", "--match-path", "test/Foo.t.sol"]
      }
    });
  });

  it("does not let boolean forge flags consume following CLI flags", () => {
    expect(
      parseCommand(["forge", "--open", "--sources", "src", "--", "--exclude-tests"])
    ).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        open: true,
        sources: ["src"],
        builderArgs: ["--exclude-tests"]
      }
    });
  });

  it("uses builder plugin defaults", () => {
    expect(parseCommand(["hardhat"])).toMatchObject({
      name: "builder",
      builder: "hardhat",
      options: {
        sources: ["contracts"],
        sourceExtensions: [".sol"]
      }
    });

    expect(parseCommand(["vite", "--", "--runInBand"])).toMatchObject({
      name: "builder",
      builder: "vite",
      options: {
        sources: ["src"],
        sourceExtensions: expect.arrayContaining([".ts", ".tsx", ".js", ".jsx"]),
        builderArgs: ["--runInBand"]
      }
    });

    expect(parseCommand(["jest"])).toMatchObject({
      name: "builder",
      builder: "jest",
      options: {
        sources: ["src"],
        sourceExtensions: expect.arrayContaining([".ts", ".tsx", ".js", ".jsx"])
      }
    });

    expect(parseCommand(["pytest"])).toMatchObject({
      name: "builder",
      builder: "pytest",
      options: {
        sources: ["src"],
        sourceExtensions: [".py", ".pyw"]
      }
    });

    expect(parseCommand(["cargo-llvm-cov"])).toMatchObject({
      name: "builder",
      builder: "cargo-llvm-cov",
      options: {
        sources: ["src"],
        sourceExtensions: [".rs"]
      }
    });

    expect(parseCommand(["lcov-capture"])).toMatchObject({
      name: "builder",
      builder: "lcov-capture",
      options: {
        sources: ["src", "include"],
        sourceExtensions: expect.arrayContaining([".c", ".cpp", ".h", ".hpp"])
      }
    });
  });

  it("shows CLI help for command help flags before passthrough args", () => {
    expect(parseCommand(["forge", "--help"])).toEqual({ name: "help" });
    expect(parseCommand(["forge", "--", "--help"])).toMatchObject({
      name: "builder",
      builder: "forge",
      options: {
        builderArgs: ["--help"]
      }
    });
  });

  it("rejects out-of-range, fractional, or non-numeric --port values", () => {
    expect(() => parseCommand(["forge", "--port", "0"])).toThrow(/Invalid --port/);
    expect(() => parseCommand(["forge", "--port", "65536"])).toThrow(/Invalid --port/);
    expect(() => parseCommand(["forge", "--port", "-1"])).toThrow(/Invalid --port/);
    expect(() => parseCommand(["forge", "--port", "abc"])).toThrow(/Invalid --port/);
    expect(() => parseCommand(["forge", "--port", "1.5"])).toThrow(/Invalid --port/);
    expect(() => parseCommand(["open", "--port", "70000"])).toThrow(/Invalid --port/);
  });

  it("accepts valid --port values at both ends of the range", () => {
    expect(parseCommand(["forge", "--port", "1"])).toMatchObject({ options: { port: 1 } });
    expect(parseCommand(["forge", "--port", "65535"])).toMatchObject({ options: { port: 65535 } });
  });
});
