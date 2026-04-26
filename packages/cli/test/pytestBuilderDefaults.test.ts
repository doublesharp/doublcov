import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pytestBuilder } from "../src/builders/pytest.js";
import { readBuilderProjectDefaults } from "../src/builders/projectConfig.js";

describe("Pytest coverage config parsing", () => {
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
});

describe("Pytest project defaults", () => {
  it("returns empty defaults when pyproject.toml is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pytest-empty-"));
    await expect(
      readBuilderProjectDefaults("pytest", pytestBuilder, root),
    ).resolves.toEqual({});
  });

  it("returns empty defaults when pyproject.toml has no coverage lcov section", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pytest-norun-"));
    await writeFile(
      path.join(root, "pyproject.toml"),
      ["[tool.coverage.run]", "branch = true"].join("\n"),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("pytest", pytestBuilder, root),
    ).resolves.toEqual({});
  });
});
