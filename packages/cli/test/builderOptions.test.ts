import { describe, expect, it } from "vitest";
import type { BuilderOptions } from "../src/args.js";
import { foundryBuilder } from "../src/builders/foundry.js";
import { resolveBuilderOptions } from "../src/builders/run.js";

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
    timeoutMs: 60_000,
    builderArgs: [],
    ...overrides,
  };
}

describe("builder option precedence", () => {
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
});

describe("builder option resolution", () => {
  function baseOptions(
    overrides: Partial<BuilderOptions> = {},
  ): BuilderOptions {
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

  it("uses an explicitly requested mode over config mode", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({
        mode: "standalone",
        explicit: {
          lcov: false,
          out: false,
          sources: false,
          sourceExtensions: false,
          history: false,
          name: false,
          mode: true,
        },
      }),
      { mode: "static" },
      {},
    );
    expect(resolved.mode).toBe("standalone");
  });

  it("uses an explicitly requested name over config and project defaults", () => {
    const resolved = resolveBuilderOptions(
      foundryBuilder,
      baseOptions({
        name: "explicit-name",
        explicit: {
          lcov: false,
          out: false,
          sources: false,
          sourceExtensions: false,
          history: false,
          name: true,
          mode: false,
        },
      }),
      { name: "config-name" },
      { name: "project-name" },
    );
    expect(resolved.name).toBe("explicit-name");
  });
});
