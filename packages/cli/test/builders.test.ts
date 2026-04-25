import { describe, expect, it } from "vitest";
import type { BuilderOptions } from "../src/args.js";
import { coverageBuilders, registerCoverageBuilder, resolveBuilder } from "../src/builders/registry.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";

function builderOptions(overrides: Partial<BuilderOptions> = {}): BuilderOptions {
  return {
    sources: ["src"],
    sourceExtensions: [".ts"],
    out: "coverage/report",
    history: ".doublcov/history.json",
    diagnostics: [],
    open: false,
    port: 60732,
    builderArgs: [],
    ...overrides
  };
}

describe("coverage builder plugins", () => {
  it("resolves aliases to the same builder", () => {
    expect(resolveBuilder("forge")?.id).toBe("foundry");
    expect(resolveBuilder("foundry")?.id).toBe("foundry");
    expect(resolveBuilder("vitest")?.id).toBe("vite");
    expect(resolveBuilder("v8")?.id).toBe("c8");
    expect(resolveBuilder("node-test")?.id).toBe("c8");
    expect(resolveBuilder("python")?.id).toBe("pytest");
    expect(resolveBuilder("coverage.py")?.id).toBe("pytest");
    expect(resolveBuilder("rust")?.id).toBe("cargo-llvm-cov");
    expect(resolveBuilder("llvm-cov")?.id).toBe("cargo-llvm-cov");
    expect(resolveBuilder("tarpaulin")?.id).toBe("cargo-tarpaulin");
    expect(resolveBuilder("gcov")?.id).toBe("lcov-capture");
    expect(resolveBuilder("cpp")?.id).toBe("lcov-capture");
  });

  it("prepares Foundry coverage with an explicit LCOV output", async () => {
    const builder = resolveBuilder("foundry");
    const run = await builder?.prepareRun(builderOptions({
      lcov: "coverage/foundry.lcov",
      sourceExtensions: [".sol"],
      builderArgs: ["--exclude-tests"]
    }));

    await run?.cleanup?.();
    expect(run).toMatchObject({
      command: "forge",
      lcov: "coverage/foundry.lcov",
      args: ["coverage", "--report", "lcov", "--report-file", "coverage/foundry.lcov", "--exclude-tests"]
    });
  });

  it("prepares Vite coverage without running it", async () => {
    const run = await resolveBuilder("vite")?.prepareRun(builderOptions({
      sourceExtensions: [".ts", ".tsx"],
      builderArgs: ["--watch=false"]
    }));

    expect(run).toMatchObject({
      command: "npx",
      lcov: "coverage/lcov.info",
      args: ["vitest", "run", "--coverage", "--coverage.reporter=lcov", "--coverage.reportsDirectory=coverage", "--watch=false"]
    });
  });

  it("prepares JavaScript and V8 coverage harnesses", async () => {
    await expect(resolveBuilder("jest")?.prepareRun(builderOptions({ builderArgs: ["--runInBand"] }))).resolves.toMatchObject({
      command: "npx",
      lcov: "coverage/lcov.info",
      args: ["jest", "--coverage", "--coverageReporters=lcov", "--coverageDirectory", "coverage", "--runInBand"]
    });

    await expect(resolveBuilder("v8")?.prepareRun(builderOptions({ builderArgs: ["test/**/*.test.js"] }))).resolves.toMatchObject({
      command: "npx",
      lcov: "coverage/lcov.info",
      args: ["c8", "--reporter=lcov", "--report-dir", "coverage", "node", "--test", "test/**/*.test.js"]
    });
  });

  it("prepares Python and Rust coverage harnesses", async () => {
    await expect(resolveBuilder("pytest")?.prepareRun(builderOptions({ lcov: "coverage/python.info" }))).resolves.toMatchObject({
      command: "python",
      lcov: "coverage/python.info",
      args: ["-m", "pytest", "--cov", "--cov-report=lcov:coverage/python.info"]
    });

    await expect(resolveBuilder("cargo-llvm-cov")?.prepareRun(builderOptions({ builderArgs: ["--workspace"] }))).resolves.toMatchObject({
      command: "cargo",
      lcov: "lcov.info",
      args: ["llvm-cov", "--lcov", "--output-path", "lcov.info", "--workspace"]
    });

    await expect(resolveBuilder("cargo-tarpaulin")?.prepareRun(builderOptions({ lcov: "target/coverage/lcov.info" }))).resolves.toMatchObject({
      command: "cargo",
      lcov: "target/coverage/lcov.info",
      args: ["tarpaulin", "--out", "Lcov", "--output-dir", "target/coverage"]
    });
  });

  it("prepares gcov capture for C and C++ projects", async () => {
    await expect(resolveBuilder("lcov-capture")?.prepareRun(builderOptions({ lcov: "coverage/cpp.info" }))).resolves.toMatchObject({
      command: "lcov",
      lcov: "coverage/cpp.info",
      args: ["--capture", "--directory", ".", "--output-file", "coverage/cpp.info"]
    });
  });

  it("rejects impossible custom LCOV filenames for directory-based tools", async () => {
    await expect(resolveBuilder("jest")?.prepareRun(builderOptions({ lcov: "coverage/jest.info" }))).rejects.toThrow(
      /ending in lcov\.info/
    );
  });
});

describe("runCoverageBuilder failure paths", () => {
  it("throws a clear error when the builder name is unknown", async () => {
    await expect(runCoverageBuilder("does-not-exist", builderOptions())).rejects.toThrow(
      /Unknown coverage builder/
    );
  });

  it("surfaces the underlying tool's exit code when the run fails", async () => {
    const failingBuilder: CoverageBuilderPlugin = {
      id: "failing-test-tool",
      aliases: [],
      label: "Failing Test Tool",
      description: "Always exits non-zero",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "process.exit(7)"],
          lcov: "/tmp/never-written.lcov"
        };
      }
    };

    registerCoverageBuilder(failingBuilder);
    try {
      await expect(runCoverageBuilder("failing-test-tool", builderOptions())).rejects.toThrow(/exited with status 7/);
      await expect(runCoverageBuilder("failing-test-tool", builderOptions())).rejects.toThrow(/process\.exit\(7\)/);
    } finally {
      const index = coverageBuilders.findIndex((candidate) => candidate.id === "failing-test-tool");
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });

  it("surfaces a startup error when the underlying command is missing from PATH", async () => {
    const missingToolBuilder: CoverageBuilderPlugin = {
      id: "missing-tool",
      aliases: [],
      label: "Missing Tool",
      description: "Points at a binary that does not exist",
      async prepareRun() {
        return {
          command: "doublcov-nonexistent-binary-zzz",
          args: [],
          lcov: "/tmp/never-written.lcov"
        };
      }
    };

    registerCoverageBuilder(missingToolBuilder);
    try {
      await expect(runCoverageBuilder("missing-tool", builderOptions())).rejects.toThrow(
        /Could not start doublcov-nonexistent-binary-zzz/
      );
    } finally {
      const index = coverageBuilders.findIndex((candidate) => candidate.id === "missing-tool");
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });
});

describe("registerCoverageBuilder", () => {
  it("rejects a builder whose id collides with an existing alias", () => {
    expect(() =>
      registerCoverageBuilder({
        id: "forge",
        aliases: [],
        label: "Conflicting",
        description: "Tries to claim 'forge' which is already a Foundry alias",
        async prepareRun() {
          throw new Error("unreachable");
        }
      })
    ).toThrow(/conflicts with builder "foundry"/);
  });

  it("rejects a builder whose alias collides with an existing builder id", () => {
    expect(() =>
      registerCoverageBuilder({
        id: "fresh-tool",
        aliases: ["jest"],
        label: "Fresh Tool",
        description: "Tries to claim 'jest' as an alias",
        async prepareRun() {
          throw new Error("unreachable");
        }
      })
    ).toThrow(/conflicts with builder "jest"/);
  });

  it("permits replacing an existing builder by re-registering with the same id", () => {
    const original = resolveBuilder("foundry");
    expect(original).toBeDefined();
    try {
      registerCoverageBuilder({
        id: "foundry",
        aliases: ["forge"],
        label: "Replacement Foundry",
        description: "Replaces the default Foundry builder",
        async prepareRun() {
          return { command: "forge", args: ["custom"], lcov: "lcov.info" };
        }
      });
      expect(resolveBuilder("foundry")?.label).toBe("Replacement Foundry");
      expect(resolveBuilder("forge")?.label).toBe("Replacement Foundry");
    } finally {
      if (original) registerCoverageBuilder(original);
    }
  });
});
