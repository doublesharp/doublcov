import { describe, expect, it } from "vitest";
import type { BuilderOptions } from "../src/args.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { c8Builder } from "../src/builders/c8.js";
import { foundryBuilder } from "../src/builders/foundry.js";
import { hardhatBuilder } from "../src/builders/hardhat.js";
import { jestBuilder } from "../src/builders/jest.js";
import { pytestBuilder } from "../src/builders/pytest.js";
import {
  deriveReportOut,
  readBuilderProjectDefaults,
} from "../src/builders/projectConfig.js";
import {
  coverageBuilders,
  registerCoverageBuilder,
  resolveBuilder,
} from "../src/builders/registry.js";
import {
  resolveBuilderOptions,
  runCoverageBuilder,
} from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";
import { viteBuilder } from "../src/builders/vite.js";

function builderOptions(
  overrides: Partial<BuilderOptions> = {},
): BuilderOptions {
  return {
    sources: ["src"],
    sourceExtensions: [".ts"],
    out: "coverage/report",
    history: ".doublcov/history.json",
    diagnostics: [],
    open: false,
    port: 60732,
    builderArgs: [],
    ...overrides,
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
    const run = await builder?.prepareRun(
      builderOptions({
        lcov: "coverage/foundry.lcov",
        sourceExtensions: [".sol"],
        builderArgs: ["--exclude-tests"],
      }),
    );

    await run?.cleanup?.();
    expect(run).toMatchObject({
      command: "forge",
      lcov: "coverage/foundry.lcov",
      args: [
        "coverage",
        "--report",
        "lcov",
        "--report-file",
        "coverage/foundry.lcov",
        "--exclude-tests",
      ],
    });
  });

  it("prepares Foundry coverage into coverage/lcov.info by default", async () => {
    const builder = resolveBuilder("foundry");
    const run = await builder?.prepareRun(
      builderOptions({
        sourceExtensions: [".sol"],
        builderArgs: ["--exclude-tests"],
      }),
    );

    expect(run).toMatchObject({
      command: "forge",
      lcov: "coverage/lcov.info",
      args: [
        "coverage",
        "--report",
        "lcov",
        "--report-file",
        "coverage/lcov.info",
        "--exclude-tests",
      ],
    });
  });

  it("prepares Vite coverage without running it", async () => {
    const run = await resolveBuilder("vite")?.prepareRun(
      builderOptions({
        sourceExtensions: [".ts", ".tsx"],
        builderArgs: ["--watch=false"],
      }),
    );

    expect(run).toMatchObject({
      command: "npx",
      lcov: "coverage/lcov.info",
      args: [
        "vitest",
        "run",
        "--coverage",
        "--coverage.reporter=lcov",
        "--coverage.reportsDirectory=coverage",
        "--watch=false",
      ],
    });
  });

  it("prepares JavaScript and V8 coverage harnesses", async () => {
    await expect(
      resolveBuilder("jest")?.prepareRun(
        builderOptions({ builderArgs: ["--runInBand"] }),
      ),
    ).resolves.toMatchObject({
      command: "npx",
      lcov: "coverage/lcov.info",
      args: [
        "jest",
        "--coverage",
        "--coverageReporters=lcov",
        "--coverageDirectory",
        "coverage",
        "--runInBand",
      ],
    });

    await expect(
      resolveBuilder("v8")?.prepareRun(
        builderOptions({ builderArgs: ["test/**/*.test.js"] }),
      ),
    ).resolves.toMatchObject({
      command: "npx",
      lcov: "coverage/lcov.info",
      args: [
        "c8",
        "--reporter=lcov",
        "--report-dir",
        "coverage",
        "node",
        "--test",
        "test/**/*.test.js",
      ],
    });
  });

  it("prepares Python and Rust coverage harnesses", async () => {
    await expect(
      resolveBuilder("pytest")?.prepareRun(
        builderOptions({ lcov: "coverage/python.info" }),
      ),
    ).resolves.toMatchObject({
      command: "python",
      lcov: "coverage/python.info",
      args: ["-m", "pytest", "--cov", "--cov-report=lcov:coverage/python.info"],
    });

    await expect(
      resolveBuilder("cargo-llvm-cov")?.prepareRun(
        builderOptions({ builderArgs: ["--workspace"] }),
      ),
    ).resolves.toMatchObject({
      command: "cargo",
      lcov: "coverage/lcov.info",
      args: [
        "llvm-cov",
        "--lcov",
        "--output-path",
        "coverage/lcov.info",
        "--workspace",
      ],
    });

    await expect(
      resolveBuilder("cargo-tarpaulin")?.prepareRun(
        builderOptions({ lcov: "target/coverage/lcov.info" }),
      ),
    ).resolves.toMatchObject({
      command: "cargo",
      lcov: "target/coverage/lcov.info",
      args: ["tarpaulin", "--out", "Lcov", "--output-dir", "target/coverage"],
    });
  });

  it("prepares gcov capture for C and C++ projects", async () => {
    await expect(
      resolveBuilder("lcov-capture")?.prepareRun(
        builderOptions({ lcov: "coverage/cpp.info" }),
      ),
    ).resolves.toMatchObject({
      command: "lcov",
      lcov: "coverage/cpp.info",
      args: [
        "--capture",
        "--directory",
        ".",
        "--output-file",
        "coverage/cpp.info",
      ],
    });
  });

  it("rejects impossible custom LCOV filenames for directory-based tools", async () => {
    await expect(
      resolveBuilder("jest")?.prepareRun(
        builderOptions({ lcov: "coverage/jest.info" }),
      ),
    ).rejects.toThrow(/ending in lcov\.info/);
  });

  it("derives report output from resolved builder LCOV paths", () => {
    expect(deriveReportOut("coverage/lcov.info", "coverage/report")).toBe(
      "coverage/report",
    );
    expect(deriveReportOut("target/llvm/lcov.info", "coverage/report")).toBe(
      "target/llvm/report",
    );
    expect(deriveReportOut("lcov.info", "coverage/report")).toBe("report");
  });

  it("prefers CLI, then doublcov config, then project config, then builder defaults", () => {
    const options = builderOptions({
      lcov: undefined,
      explicit: {
        lcov: false,
        out: false,
        sources: false,
        sourceExtensions: false,
        history: false,
        name: false,
      },
    });

    expect(
      resolveBuilderOptions(
        foundryBuilder,
        options,
        { lcov: "config/lcov.info", sources: ["contracts"] },
        {
          lcov: "project/lcov.info",
          sources: ["src"],
        },
      ),
    ).toMatchObject({
      lcov: "config/lcov.info",
      out: "config/report",
      sources: ["contracts"],
    });

    expect(
      resolveBuilderOptions(
        foundryBuilder,
        {
          ...options,
          lcov: "cli/lcov.info",
          explicit: { ...options.explicit, lcov: true },
        },
        { lcov: "config/lcov.info" },
        {
          lcov: "project/lcov.info",
        },
      ),
    ).toMatchObject({
      lcov: "cli/lcov.info",
      out: "cli/report",
    });
  });

  it("reads builder defaults from package.json and Foundry config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-builder-config-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        doublcov: {
          builders: {
            foundry: {
              out: "custom/report",
            },
          },
        },
      }),
      "utf8",
    );
    await writeFile(
      path.join(root, "foundry.toml"),
      [
        "[profile.default]",
        'src = "contracts"',
        "",
        "[profile.default.doublcov]",
        'lcov = "custom/lcov.info"',
      ].join("\n"),
      "utf8",
    );

    await expect(
      readBuilderProjectDefaults("forge", foundryBuilder, root),
    ).resolves.toMatchObject({
      lcov: "custom/lcov.info",
      out: "custom/report",
      sources: ["contracts"],
    });
  });

  it("reads safe static Hardhat defaults without importing config code", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-config-"));
    const hardhat = resolveBuilder("hardhat");
    if (!hardhat) throw new Error("hardhat builder missing");
    await writeFile(
      path.join(root, ".solcover.js"),
      "module.exports = { coverageDir: 'coverage/solidity' };\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "hardhat.config.ts"),
      [
        "export default {",
        "  paths: { sources: 'contracts' },",
        "  doublcov: { out: 'coverage/hardhat-report' }",
        "};",
      ].join("\n"),
      "utf8",
    );

    await expect(
      readBuilderProjectDefaults("hardhat", hardhat, root),
    ).resolves.toMatchObject({
      lcov: "coverage/solidity/lcov.info",
      out: "coverage/hardhat-report",
      sources: ["contracts"],
    });
  });
});

describe("runCoverageBuilder failure paths", () => {
  it("throws a clear error when the builder name is unknown", async () => {
    await expect(
      runCoverageBuilder("does-not-exist", builderOptions()),
    ).rejects.toThrow(/Unknown coverage builder/);
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
          lcov: "/tmp/never-written.lcov",
        };
      },
    };

    registerCoverageBuilder(failingBuilder);
    try {
      await expect(
        runCoverageBuilder("failing-test-tool", builderOptions()),
      ).rejects.toThrow(/exited with status 7/);
      await expect(
        runCoverageBuilder("failing-test-tool", builderOptions()),
      ).rejects.toThrow(/process\.exit\(7\)/);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "failing-test-tool",
      );
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
          lcov: "/tmp/never-written.lcov",
        };
      },
    };

    registerCoverageBuilder(missingToolBuilder);
    try {
      await expect(
        runCoverageBuilder("missing-tool", builderOptions()),
      ).rejects.toThrow(/Could not start doublcov-nonexistent-binary-zzz/);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "missing-tool",
      );
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
        },
      }),
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
        },
      }),
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
        },
      });
      expect(resolveBuilder("foundry")?.label).toBe("Replacement Foundry");
      expect(resolveBuilder("forge")?.label).toBe("Replacement Foundry");
    } finally {
      if (original) registerCoverageBuilder(original);
    }
  });
});

describe("hardhat builder prepareRun", () => {
  it("invokes npx hardhat coverage and passes builder args through", async () => {
    const run = await hardhatBuilder.prepareRun(
      builderOptions({
        builderArgs: ["--network", "localhost", "--testfiles", "test/foo.ts"],
      }),
    );
    expect(run.command).toBe("npx");
    expect(run.args).toEqual([
      "hardhat",
      "coverage",
      "--network",
      "localhost",
      "--testfiles",
      "test/foo.ts",
    ]);
    expect(run.lcov).toBe("coverage/lcov.info");
  });

  it("respects an explicit lcov override", async () => {
    const run = await hardhatBuilder.prepareRun(
      builderOptions({ lcov: "out/hardhat.lcov" }),
    );
    expect(run.lcov).toBe("out/hardhat.lcov");
    // The command does not currently force the lcov path on Hardhat itself.
    expect(run.args).toEqual(["hardhat", "coverage"]);
  });
});

describe("readBuilderProjectDefaults edge cases", () => {
  it("returns empty defaults when no config files exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-empty-config-"));
    await expect(
      readBuilderProjectDefaults("foundry", foundryBuilder, root),
    ).resolves.toEqual({});
  });

  it("does not crash when package.json is malformed JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-bad-pkg-"));
    await writeFile(path.join(root, "package.json"), "{not-json", "utf8");
    await expect(
      readBuilderProjectDefaults("jest", jestBuilder, root),
    ).rejects.toThrow();
  });

  it("reads jest coverageDirectory from package.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pkg-jest-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ jest: { coverageDirectory: "out/jest" } }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("jest", jestBuilder, root),
    ).resolves.toMatchObject({
      lcov: "out/jest/lcov.info",
      out: "out/jest/report",
    });
  });

  it("reads c8 report-dir from package.json (kebab-case key)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pkg-c8-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ c8: { "report-dir": "out/c8" } }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("v8", c8Builder, root),
    ).resolves.toMatchObject({
      lcov: "out/c8/lcov.info",
    });
  });

  it("reads vitest coverage.reportsDirectory from package.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pkg-vitest-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        vitest: { coverage: { reportsDirectory: "out/vitest" } },
      }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("vite", viteBuilder, root),
    ).resolves.toMatchObject({
      lcov: "out/vitest/lcov.info",
    });
  });

  it("reads .c8rc.json report-dir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8rc-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify({ "report-dir": "build/c8" }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("v8", c8Builder, root),
    ).resolves.toMatchObject({
      lcov: "build/c8/lcov.info",
    });
  });

  it("reads jest.config.json coverageDirectory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-jest-json-"));
    await writeFile(
      path.join(root, "jest.config.json"),
      JSON.stringify({ coverageDirectory: "build/jest" }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("jest", jestBuilder, root),
    ).resolves.toMatchObject({
      lcov: "build/jest/lcov.info",
    });
  });

  it("reads jest.config.js coverageDirectory via regex", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-jest-js-"));
    await writeFile(
      path.join(root, "jest.config.js"),
      "module.exports = {\n  coverageDirectory: 'js-out'\n};\n",
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("jest", jestBuilder, root),
    ).resolves.toMatchObject({
      lcov: "js-out/lcov.info",
    });
  });

  it("reads vitest.config.ts coverage.reportsDirectory via regex", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-vitest-ts-"));
    await writeFile(
      path.join(root, "vitest.config.ts"),
      [
        "import { defineConfig } from 'vitest/config';",
        "export default defineConfig({",
        "  test: {",
        "    coverage: {",
        "      reportsDirectory: 'vitest-out',",
        "    },",
        "  },",
        "});",
      ].join("\n"),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("vite", viteBuilder, root),
    ).resolves.toMatchObject({
      lcov: "vitest-out/lcov.info",
    });
  });

  it("reads pyproject.toml [tool.coverage.lcov] output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pyproject-"));
    await writeFile(
      path.join(root, "pyproject.toml"),
      [
        "[tool.coverage.lcov]",
        'output = "py/cov.lcov"',
        "",
        "[tool.coverage.run]",
        "branch = true",
      ].join("\n"),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("pytest", pytestBuilder, root),
    ).resolves.toMatchObject({
      lcov: "py/cov.lcov",
      out: "py/report",
    });
  });

  it("parses foundry.toml multi-line src arrays", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-multi-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      [
        "[profile.default]",
        "src = [",
        '  "contracts",',
        '  "vendor"',
        "]",
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["contracts", "vendor"]);
  });

  it("ignores comments after values in foundry.toml without breaking quoted strings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-comm-"));
    // Both a line-trailing comment AND a hash inside the quoted string.
    await writeFile(
      path.join(root, "foundry.toml"),
      [
        "[profile.default]",
        '# this is a leading comment',
        'src = "contracts" # trailing comment',
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["contracts"]);
  });

  it("preserves hashes inside quoted TOML strings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-hash-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      [
        "[profile.default]",
        'src = "with#hash"',
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["with#hash"]);
  });

  it("walks Hardhat config with whitespace and double quotes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-ws-"));
    await writeFile(
      path.join(root, "hardhat.config.ts"),
      [
        "export default {",
        "  paths : {",
        '    sources : "src/contracts"',
        "  }",
        "};",
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["src/contracts"]);
  });

  it("prefers hardhat.config.ts over hardhat.config.js when both exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-pref-"));
    await writeFile(
      path.join(root, "hardhat.config.ts"),
      "export default { paths: { sources: 'ts-src' } };\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "hardhat.config.js"),
      "module.exports = { paths: { sources: 'js-src' } };\n",
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["ts-src"]);
  });

  it("merges .solcover.js coverageDirectory with hardhat.config sources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-solcover-merge-"));
    await writeFile(
      path.join(root, ".solcover.js"),
      "module.exports = { coverageDirectory: 'sol-out' };\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "hardhat.config.js"),
      "module.exports = { paths: { sources: 'src' } };\n",
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults).toMatchObject({
      lcov: "sol-out/lcov.info",
      sources: ["src"],
    });
  });

  it("looks up nested doublcov builders by alias when not under id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-alias-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        doublcov: {
          builders: {
            forge: { name: "via-alias", out: "alias/report" },
          },
        },
      }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "forge",
      foundryBuilder,
      root,
    );
    expect(defaults).toMatchObject({
      name: "via-alias",
      out: "alias/report",
    });
  });

  it("merges top-level doublcov fields with builder-specific overrides", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-toplevel-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        doublcov: {
          history: "shared/history.json",
          builders: { foundry: { out: "specific/out" } },
        },
      }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults).toMatchObject({
      history: "shared/history.json",
      out: "specific/out",
    });
  });

  it("falls back gracefully when foundry.toml is empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-empty-"));
    await writeFile(path.join(root, "foundry.toml"), "", "utf8");
    await expect(
      readBuilderProjectDefaults("foundry", foundryBuilder, root),
    ).resolves.toEqual({});
  });

  it("matchObjectArray ignores keys that share a property suffix", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-arr-prefix-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        doublcov: {
          builders: {
            foundry: {
              // mysources should not be matched as 'sources'
              // (We embed it as a free-form key on the doublcov section.)
              sources: ["a", "b"],
            },
          },
        },
      }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["a", "b"]);
  });

  it("parses arrays inside an embedded doublcov object literal in hardhat config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-arr-"));
    await writeFile(
      path.join(root, "hardhat.config.js"),
      [
        "module.exports = {",
        "  doublcov: {",
        "    sources: ['a', 'b', 'c'],",
        "    extensions: ['sol', 'vy'],",
        "  }",
        "};",
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["a", "b", "c"]);
    expect(defaults.sourceExtensions).toEqual([".sol", ".vy"]);
  });

  it("does not match unrelated keys whose name contains 'paths' as a suffix", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-key-prefix-"));
    // 'mypaths' shouldn't match 'paths' regex; we only have a foreign key.
    await writeFile(
      path.join(root, "hardhat.config.ts"),
      [
        "export default {",
        "  mypaths: { sources: 'WRONG' },",
        "  paths: { sources: 'right' }",
        "};",
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["right"]);
  });

  it("ignores non-string values when sanitizing doublcov sections", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-types-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        doublcov: {
          lcov: 42,
          out: null,
          sources: "contracts",
        },
      }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.lcov).toBeUndefined();
    expect(defaults.out).toBeUndefined();
    expect(defaults.sources).toEqual(["contracts"]);
  });
});

describe("resolveBuilderOptions branches", () => {
  function baseOptions(overrides: Partial<BuilderOptions> = {}): BuilderOptions {
    return builderOptions({
      explicit: {
        lcov: false,
        out: false,
        sources: false,
        sourceExtensions: false,
        history: false,
        name: false,
        mode: false,
      },
      ...overrides,
    });
  }

  it("derives out from project defaults' lcov when only project lcov is set", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({ lcov: undefined }),
      {},
      { lcov: "alt/lcov.info" },
    );
    expect(resolved.lcov).toBe("alt/lcov.info");
    expect(resolved.out).toBe("alt/report");
  });

  it("falls back to builder defaultLcov when nothing else is set", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({ lcov: undefined }),
      {},
      {},
    );
    expect(resolved.lcov).toBe("coverage/lcov.info");
    expect(resolved.out).toBe("coverage/report");
  });

  it("uses sourceExtensions from project defaults when CLI is unset", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({ sourceExtensions: [".ts"] }),
      {},
      { sourceExtensions: [".sol", ".vy"] },
    );
    expect(resolved.sourceExtensions).toEqual([".sol", ".vy"]);
  });

  it("treats explicit.sources=true as authoritative even with project defaults", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({
        sources: ["explicit/src"],
        explicit: {
          lcov: false,
          out: false,
          sources: true,
          sourceExtensions: false,
          history: false,
          name: false,
        },
      }),
      { sources: ["config/src"] },
      { sources: ["project/src"] },
    );
    expect(resolved.sources).toEqual(["explicit/src"]);
  });

  it("propagates name and mode through config and project defaults", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions(),
      { name: "config-name", mode: "static" },
      {},
    );
    expect(resolved.name).toBe("config-name");
    expect(resolved.mode).toBe("static");
  });

  it("project defaults' name wins when config does not set one", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions(),
      {},
      { name: "project-name" },
    );
    expect(resolved.name).toBe("project-name");
  });

  it("derives out from config.lcov when config.out is unset", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({ lcov: undefined }),
      { lcov: "x/y/foo.lcov" },
      {},
    );
    expect(resolved.lcov).toBe("x/y/foo.lcov");
    expect(resolved.out).toBe("x/y/report");
  });

  it("history from config wins over CLI default and project default", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions(),
      { history: "config/history.json" },
      { history: "project/history.json" },
    );
    expect(resolved.history).toBe("config/history.json");
  });
});

describe("runCoverageBuilder cleanup behaviors", () => {
  it("does not invoke cleanup when prepareRun rejects", async () => {
    let cleanupCalled = false;
    const builder: CoverageBuilderPlugin = {
      id: "prepare-rejects",
      aliases: [],
      label: "Prepare Rejects",
      description: "",
      async prepareRun() {
        throw new Error("prepare boom");
      },
    };
    // Save a sentinel so we can reason about cleanup
    void cleanupCalled;
    registerCoverageBuilder(builder);
    try {
      await expect(
        runCoverageBuilder("prepare-rejects", builderOptions()),
      ).rejects.toThrow(/prepare boom/);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "prepare-rejects",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });

  it("rejects with the killing signal when the child terminates from a signal", async () => {
    const builder: CoverageBuilderPlugin = {
      id: "self-killing",
      aliases: [],
      label: "Self Killing",
      description: "",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "process.kill(process.pid, 'SIGTERM')"],
          lcov: "/tmp/never-written.lcov",
        };
      },
    };
    registerCoverageBuilder(builder);
    try {
      await expect(
        runCoverageBuilder("self-killing", builderOptions()),
      ).rejects.toThrow(/exited from signal SIGTERM/);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "self-killing",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });

  it("invokes cleanup even when the underlying command fails", async () => {
    let cleaned = false;
    const builder: CoverageBuilderPlugin = {
      id: "cleanup-on-failure",
      aliases: [],
      label: "Cleanup On Failure",
      description: "",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "process.exit(3)"],
          lcov: "/tmp/never-written.lcov",
          cleanup: async () => {
            cleaned = true;
          },
        };
      },
    };
    registerCoverageBuilder(builder);
    try {
      await expect(
        runCoverageBuilder("cleanup-on-failure", builderOptions()),
      ).rejects.toThrow(/exited with status 3/);
      expect(cleaned).toBe(true);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "cleanup-on-failure",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });

});
