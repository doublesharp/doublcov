import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { c8Builder } from "../src/builders/c8.js";
import { jestBuilder } from "../src/builders/jest.js";
import { readBuilderProjectDefaults } from "../src/builders/projectConfig.js";
import { viteBuilder } from "../src/builders/vite.js";

describe("JavaScript config parsing", () => {
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

  it("vitest config with coverage:false (not an object) yields no reportsDirectory", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "doublcov-vitest-disabled-"),
    );
    await writeFile(
      path.join(root, "vitest.config.ts"),
      [
        "import { defineConfig } from 'vitest/config';",
        "export default defineConfig({",
        "  test: {",
        "    coverage: false,",
        "  },",
        "});",
      ].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "vite",
      viteBuilder,
      root,
    );
    expect(defaults.lcov).toBeUndefined();
    expect(defaults.out).toBeUndefined();
  });
});

describe("JavaScript builder project defaults", () => {
  it("ignores .c8rc JSON values that are not objects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-arr-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify(["not", "an", "object"]),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("v8", c8Builder, root),
    ).resolves.toEqual({});
  });

  it("reads c8 camelCase reportDir when report-dir is absent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-camel-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify({ reportDir: "camel/c8" }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("v8", c8Builder, root),
    ).resolves.toMatchObject({
      lcov: "camel/c8/lcov.info",
    });
  });

  it("returns empty c8 defaults when no report directory is configured", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-blank-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify({ all: true }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("v8", c8Builder, root),
    ).resolves.toEqual({});
  });

  it("ignores non-string c8 report directory values in package.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-types-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ c8: { "report-dir": 42, reportDir: "" } }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("v8", c8Builder, root),
    ).resolves.toEqual({});
  });

  it("returns empty vitest defaults when coverage has no reportsDirectory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-vitest-blank-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ vitest: { coverage: { provider: "v8" } } }),
      "utf8",
    );
    await expect(
      readBuilderProjectDefaults("vite", viteBuilder, root),
    ).resolves.toEqual({});
  });
});
