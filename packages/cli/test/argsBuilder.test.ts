import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/args.js";
import {
  coverageBuilders,
  registerCoverageBuilder,
} from "../src/builders/registry.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";

describe("parseCommand builder arguments", () => {
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

  it("parses builder auto-open overrides without swallowing passthrough args", () => {
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

  it("parses builder report customization theme", () => {
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
