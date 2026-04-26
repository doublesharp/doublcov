import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/args.js";

describe("parseCommand build arguments", () => {
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

  it("parses build paths and report name", () => {
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

  it("parses report mode", () => {
    expect(parseCommand(["build", "--mode", "static"])).toMatchObject({
      name: "build",
      options: {
        mode: "static",
      },
    });
  });

  it("rejects invalid report mode", () => {
    expect(() => parseCommand(["build", "--mode", "large"])).toThrow(
      /Invalid --mode/,
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

  it("rejects malformed --diagnostic inputs", () => {
    expect(() =>
      parseCommand(["build", "--diagnostic", "no-colon-here"]),
    ).toThrow(/Invalid diagnostic input/);
    expect(() => parseCommand(["build", "--diagnostic", ":path"])).toThrow(
      /Invalid diagnostic input/,
    );
    expect(() => parseCommand(["build", "--diagnostic", "parser:"])).toThrow(
      /Invalid diagnostic input/,
    );
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

  it("throws on missing value for a repeated --diagnostic flag", () => {
    expect(() =>
      parseCommand(["build", "--diagnostic", "--lcov", "lcov.info"]),
    ).toThrow(/Missing value for --diagnostic/);
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
  });

  it("parses build auto-open overrides", () => {
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

  it("treats build --help as whole-CLI help", () => {
    expect(parseCommand(["build", "--help", "--mode", "static"])).toEqual({
      name: "help",
    });
  });
});
