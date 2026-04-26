import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  isCiEnvironment,
  readReportConfig,
  resolveAutoOpen,
  resolveBuildOptions,
  resolveReportMode,
} from "../src/build.js";

describe("report config", () => {
  it("reads auto-open without embedding it into report customization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-config-"));
    try {
      const configPath = path.join(root, "doublcov.config.json");
      await writeFile(
        configPath,
        JSON.stringify({
          open: true,
          defaultTheme: "dark",
          lcov: "custom/lcov.info",
          sources: ["contracts"],
          extensions: ["sol"],
          out: "custom/report",
          history: ".custom/history.json",
          name: "Configured",
          mode: "static",
        }),
        "utf8",
      );

      const config = await readReportConfig({
        path: configPath,
        required: true,
      });
      expect(config.open).toBe(true);
      expect(config).toMatchObject({
        lcov: "custom/lcov.info",
        sources: ["contracts"],
        sourceExtensions: [".sol"],
        out: "custom/report",
        history: ".custom/history.json",
        name: "Configured",
        mode: "static",
      });
      expect(config.customization).toEqual({ defaultTheme: "dark" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("clears the report mode when the user explicitly omits --mode", () => {
    const result = resolveBuildOptions(
      {
        lcov: "x.info",
        sources: [],
        sourceExtensions: [],
        out: "out",
        history: undefined,
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        explicit: { mode: true },
      },
      { mode: "static" },
    );
    expect(result.mode).toBeUndefined();
  });

  it("uses config.mode when the CLI did not explicitly set a mode", () => {
    const result = resolveBuildOptions(
      {
        lcov: "x.info",
        sources: [],
        sourceExtensions: [],
        out: "out",
        history: undefined,
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        explicit: { mode: false },
      },
      { mode: "static" },
    );
    expect(result.mode).toBe("static");
  });

  it("falls back to config.name when CLI did not pass --name", () => {
    const result = resolveBuildOptions(
      {
        lcov: "x.info",
        sources: [],
        sourceExtensions: [],
        out: "out",
        history: undefined,
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        explicit: {},
      },
      { name: "from-config" },
    );
    expect(result.name).toBe("from-config");
  });

  it("uses CLI --name when explicitly set, even with a config name present", () => {
    const result = resolveBuildOptions(
      {
        lcov: "x.info",
        sources: [],
        sourceExtensions: [],
        out: "out",
        history: undefined,
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        name: "from-cli",
        explicit: { name: true },
      },
      { name: "from-config" },
    );
    expect(result.name).toBe("from-cli");
  });

  it("lets CLI build options override doublcov config fields", () => {
    expect(
      resolveBuildOptions(
        {
          lcov: "cli/lcov.info",
          sources: ["src"],
          sourceExtensions: [".ts"],
          out: "coverage/report",
          history: ".doublcov/history.json",
          port: 0,
          timeoutMs: 30 * 60 * 1000,
          diagnostics: [],
          explicit: {
            lcov: true,
            sources: false,
            sourceExtensions: false,
            out: false,
            history: false,
          },
        },
        {
          lcov: "config/lcov.info",
          sources: ["contracts"],
          sourceExtensions: [".sol"],
          out: "config/report",
          history: "config/history.json",
        },
      ),
    ).toMatchObject({
      lcov: "cli/lcov.info",
      sources: ["contracts"],
      sourceExtensions: [".sol"],
      out: "config/report",
      history: "config/history.json",
    });
  });

  it("lets explicit CLI open settings override config", () => {
    expect(resolveAutoOpen(undefined, { open: false }, {})).toBe(false);
    expect(resolveAutoOpen(false, { open: true }, {})).toBe(false);
    expect(resolveAutoOpen(true, { open: false }, { CI: "true" })).toBe(true);
  });

  it("opens by default outside CI and stays closed by default in CI", () => {
    expect(resolveAutoOpen(undefined, {}, {})).toBe(true);
    expect(resolveAutoOpen(undefined, { open: true }, { CI: "true" })).toBe(
      false,
    );
    expect(
      resolveAutoOpen(undefined, { open: true }, { GITHUB_ACTIONS: "true" }),
    ).toBe(false);
    expect(isCiEnvironment({ CI: "1" })).toBe(true);
    expect(isCiEnvironment({ CI: "true" })).toBe(true);
    expect(isCiEnvironment({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(isCiEnvironment({ CI: "false" })).toBe(false);
    expect(isCiEnvironment({ CI: "0" })).toBe(false);
  });

  it("uses standalone mode locally and static mode in CI unless configured", () => {
    expect(resolveReportMode(undefined, {}, {})).toBe("standalone");
    expect(resolveReportMode(undefined, {}, { GITHUB_ACTIONS: "true" })).toBe(
      "static",
    );
    expect(
      resolveReportMode(undefined, { mode: "standalone" }, { CI: "1" }),
    ).toBe("standalone");
    expect(resolveReportMode("static", { mode: "standalone" }, {})).toBe(
      "static",
    );
  });
});

describe("readReportConfig customization handling", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-cust-")),
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("returns an empty config when no customization option is supplied", async () => {
    const config = await readReportConfig(undefined);
    expect(config).toEqual({});
  });

  it("returns an empty config when an optional customization file is missing", async () => {
    const config = await readReportConfig({
      path: path.join(tempRoot, "missing.json"),
      required: false,
    });
    expect(config).toEqual({});
  });

  it("throws an actionable error when a required customization file is missing", async () => {
    const missing = path.join(tempRoot, "absent.json");
    await expect(
      readReportConfig({ path: missing, required: true }),
    ).rejects.toThrow(missing);
  });

  it("emits a customization with just defaultTheme when JSON has no themes", async () => {
    const file = path.join(tempRoot, "config.json");
    await writeFile(file, JSON.stringify({ lcov: "x.info" }), "utf8");
    const config = await readReportConfig({
      path: file,
      defaultTheme: "midnight",
      required: false,
    });
    expect(config.customization).toEqual({ defaultTheme: "midnight" });
  });

  it("silently drops malformed customization fields rather than failing the build", async () => {
    const file = path.join(tempRoot, "garbage.json");
    await writeFile(
      file,
      JSON.stringify({ themes: "not-an-array", hooks: 42 }),
      "utf8",
    );
    const config = await readReportConfig({
      path: file,
      required: false,
    });
    expect(config.customization).toBeUndefined();
  });

  it("propagates a path-bearing error when the customization file is not valid JSON", async () => {
    const file = path.join(tempRoot, "broken.json");
    await writeFile(file, "{ not json", "utf8");
    await expect(
      readReportConfig({ path: file, required: false }),
    ).rejects.toThrow(file);
  });
});
