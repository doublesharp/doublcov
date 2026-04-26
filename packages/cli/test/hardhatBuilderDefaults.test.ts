import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hardhatBuilder } from "../src/builders/hardhat.js";
import { readBuilderProjectDefaults } from "../src/builders/projectConfig.js";

describe("Hardhat config parsing", () => {
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

  it("returns empty defaults when hardhat 'paths' object literal never closes its braces", async () => {
    // Truncated config: extractObjectLiteral must walk to end-of-string and
    // return undefined, leaving us with no sources rather than throwing.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-trunc-"));
    await writeFile(
      path.join(root, "hardhat.config.ts"),
      // Note: never closes the outer brace.
      'export default { paths: { sources: "src/contracts"',
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults.sources).toBeUndefined();
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
});

describe("Hardhat project defaults", () => {
  it("returns empty defaults when no Hardhat or solcover config exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-empty-"));
    await expect(
      readBuilderProjectDefaults("hardhat", hardhatBuilder, root),
    ).resolves.toEqual({});
  });

  it("does not infer an lcov path from solcover files without a coverage directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-solcover-bare-"));
    await writeFile(
      path.join(root, ".solcover.js"),
      "module.exports = { skipFiles: ['Mock.sol'] };\n",
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults.lcov).toBeUndefined();
  });
});
