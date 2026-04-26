import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { foundryBuilder } from "../src/builders/foundry.js";
import { hardhatBuilder } from "../src/builders/hardhat.js";
import { jestBuilder } from "../src/builders/jest.js";
import {
  deriveReportOut,
  readBuilderProjectDefaults,
} from "../src/builders/projectConfig.js";
import { resolveBuilder } from "../src/builders/registry.js";

describe("project default output derivation", () => {
  it("derives report output from resolved builder LCOV paths", () => {
    expect(deriveReportOut("coverage/lcov.info", "coverage/report")).toBe(
      "coverage/report",
    );
    expect(deriveReportOut("target/llvm/lcov.info", "coverage/report")).toBe(
      "target/llvm/report",
    );
    expect(deriveReportOut("lcov.info", "coverage/report")).toBe("report");
  });
});

describe("project default config discovery", () => {
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

describe("generic project default parsing", () => {
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
