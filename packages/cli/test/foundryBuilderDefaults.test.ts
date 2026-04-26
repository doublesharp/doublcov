import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { foundryBuilder } from "../src/builders/foundry.js";
import { readBuilderProjectDefaults } from "../src/builders/projectConfig.js";

describe("Foundry TOML parsing", () => {
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

  it("accepts unquoted bareword entries in foundry.toml src arrays", async () => {
    // Strict TOML requires quoted strings, but real foundry.toml files in the
    // wild sometimes ship unquoted barewords. The lenient parser must accept
    // them and surface them as plain strings rather than dropping them.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-bare-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", "src = [contracts, vendor]"].join("\n"),
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
        "# this is a leading comment",
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
      ["[profile.default]", 'src = "with#hash"'].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["with#hash"]);
  });

  it("falls back gracefully when foundry.toml is empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-empty-"));
    await writeFile(path.join(root, "foundry.toml"), "", "utf8");
    await expect(
      readBuilderProjectDefaults("foundry", foundryBuilder, root),
    ).resolves.toEqual({});
  });

  it("parses single-line TOML arrays in foundry.toml", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-1l-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", 'src = ["contracts", "vendor"]'].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["contracts", "vendor"]);
  });

  it("ignores foundry.toml profiles other than profile.default", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-ci-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      [
        "[profile.default]",
        'src = "default-src"',
        "",
        "[profile.ci]",
        'src = "ci-src"',
        "optimizer = false",
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    // profile.ci must NOT be merged into the resolved defaults.
    expect(defaults.sources).toEqual(["default-src"]);
  });

  it("parses bare TOML boolean values without crashing", async () => {
    // Forces parseSimpleValue down its 'false' branch via a non-quoted
    // boolean assignment under [profile.default]. Even though we don't act
    // on it, the parser must accept it cleanly.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-bool-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", "via_ir = false", 'src = "contracts"'].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["contracts"]);
  });
});

describe("Foundry project defaults", () => {
  it("does not merge non-default foundry profiles into sources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-noprof-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ['name = "x"', "[profile.ci]", 'src = "ci"'].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toBeUndefined();
  });

  it("returns no sources when profile.default omits src", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-nosrc-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", "optimizer = true"].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toBeUndefined();
  });

  it("parses single-quoted foundry src strings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-sq-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", "src = 'contracts'"].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["contracts"]);
  });

  it("parses multi-line foundry src arrays with single-quoted entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-sqarr-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", "src = ['contracts',", "  'vendor'", "]"].join(
        "\n",
      ),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    expect(defaults.sources).toEqual(["contracts", "vendor"]);
  });

  it("tolerates nested array syntax in foundry src without crashing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-nested-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      ["[profile.default]", "src = [[a],", "  [b]]"].join("\n"),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("foundry", foundryBuilder, root),
    ).resolves.toBeDefined();
  });
});
