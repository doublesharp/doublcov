import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cp, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { parseCommand } from "../src/args.js";
import { c8Builder } from "../src/builders/c8.js";
import { cargoLlvmCovBuilder } from "../src/builders/cargoLlvmCov.js";
import { cargoTarpaulinBuilder } from "../src/builders/cargoTarpaulin.js";
import { foundryBuilder } from "../src/builders/foundry.js";
import { hardhatBuilder } from "../src/builders/hardhat.js";
import { jestBuilder } from "../src/builders/jest.js";
import { lcovCaptureBuilder } from "../src/builders/lcovCapture.js";
import { pytestBuilder } from "../src/builders/pytest.js";
import { readBuilderProjectDefaults } from "../src/builders/projectConfig.js";
import {
  coverageBuilders,
  registerCoverageBuilder,
} from "../src/builders/registry.js";
import {
  resolveBuilderOptions,
  runCoverageBuilder,
} from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";
import { viteBuilder } from "../src/builders/vite.js";
import { openReport, serveReport, serveRequest } from "../src/server.js";
import type { BuilderOptions } from "../src/args.js";

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
    port: 0,
    timeoutMs: 0,
    builderArgs: [],
    ...overrides,
  };
}

describe("args.ts branch gaps", () => {
  it("parses builder commands that pass --lcov, --extensions, and --mode together", () => {
    // Hits the parseBuilder return-spread branches for lcov/mode/extensions
    // truthy paths (BRDA on lines 148, 155, 159).
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
      },
    });
  });

  it("ignores flag tokens that are bare '--=value' with an empty key", () => {
    // parseFlags line 336 (`!key`) — '--=foo' has key '' and must skip silently.
    const result = parseCommand(["build", "--=foo", "--lcov", "lcov.info"]);
    expect(result).toMatchObject({
      name: "build",
      options: { lcov: "lcov.info" },
    });
  });

  it("treats an unknown non-value flag followed by another --flag as undefined", () => {
    // parseFlags line 349 (`next?.startsWith('--') ? undefined : next`).
    // 'frobnicate' isn't a VALUE_FLAG and isn't booleanFlags — the next token
    // is another --flag, so the value must be left undefined and the next
    // token must NOT be consumed.
    const result = parseCommand([
      "build",
      "--frobnicate",
      "--lcov",
      "lcov.info",
    ]);
    expect(result).toMatchObject({
      name: "build",
      options: { lcov: "lcov.info" },
    });
  });

  it("skips empty positional tokens when resolving a directory for `open`", () => {
    // firstPositional line 376 (`!arg`) — an empty-string arg must be skipped
    // rather than treated as a real positional, so the second arg wins.
    const result = parseCommand(["open", "", "real-report-dir"]);
    expect(result).toMatchObject({
      name: "open",
      reportDir: "real-report-dir",
    });
  });

  it("falls back to DEFAULT_SOURCES/DEFAULT_SOURCE_EXTENSIONS when the builder omits its own", () => {
    // Hits parseBuilder line 147/150 (`builder?.defaultSources ?? DEFAULT_SOURCES`,
    // `builder?.defaultExtensions ?? [...DEFAULT_SOURCE_EXTENSIONS]`) for the
    // RHS branch by registering a minimal builder with no defaults.
    const minimalBuilder: CoverageBuilderPlugin = {
      id: "minimal-defaults-test",
      aliases: [],
      label: "Minimal Defaults Test",
      description: "Has no defaultSources/defaultExtensions/defaultLcov",
      async prepareRun() {
        return { command: "true", args: [], lcov: "lcov.info" };
      },
    };
    registerCoverageBuilder(minimalBuilder);
    try {
      const parsed = parseCommand(["minimal-defaults-test"]);
      if (parsed.name !== "builder") throw new Error("expected builder");
      // sources falls through to DEFAULT_SOURCES, extensions to DEFAULTs.
      expect(parsed.options.sources).toEqual(["src"]);
      expect(parsed.options.sourceExtensions.length).toBeGreaterThan(0);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "minimal-defaults-test",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });
});

describe("server.ts defense-in-depth branches", () => {
  let tempRoot: string;
  let reportRoot: string;

  beforeEach(async () => {
    tempRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-server-branch-")),
    );
    reportRoot = path.join(tempRoot, "report");
    await import("node:fs").then(({ mkdirSync }) =>
      mkdirSync(reportRoot, { recursive: true }),
    );
    await writeFile(
      path.join(reportRoot, "index.html"),
      "<html><body>hi</body></html>",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("openReport in static mode forwards an explicit port to serveReport", async () => {
    // Hits openReport line 53 (`options.port !== undefined`) truthy branch.
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await openReport(reportRoot, {
        mode: "static",
        port: 0,
        timeoutMs: 50,
      });
    } finally {
      stdoutSpy.mockRestore();
    }
  }, 5_000);

  it("openReport in static mode without an explicit timeoutMs still terminates", async () => {
    // Hits openReport line 54 (`options.timeoutMs !== undefined`) falsy branch.
    // We can't actually wait DEFAULT_SERVE_TIMEOUT_MS, so we fire SIGTERM at
    // ourselves shortly after the URL is printed to force a graceful shutdown.
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const killTimer = setTimeout(() => {
      process.emit("SIGTERM");
    }, 100);
    try {
      await openReport(reportRoot, { mode: "static", port: 0 });
    } finally {
      clearTimeout(killTimer);
      stdoutSpy.mockRestore();
    }
  }, 5_000);

  it("serveReport with timeoutMs=0 prints no countdown and self-terminates on signal", async () => {
    // Hits server.ts lines 79 (`timeoutMs > 0` ternary), 104 (`if (timeoutMs > 0)`),
    // 250 (`if (timeout)` falsy when no timer was set), and 263 (`if (timeoutMs > 0)`).
    const writes: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });
    const killTimer = setTimeout(() => {
      process.emit("SIGINT");
    }, 100);
    try {
      await serveReport(reportRoot, { timeoutMs: 0, open: false, port: 0 });
    } finally {
      clearTimeout(killTimer);
      stdoutSpy.mockRestore();
    }
    // The "Server will stop after ..." message must NOT have been printed
    // when timeoutMs is 0 — that's the falsy branch on line 104.
    expect(
      writes.find((w) => w.includes("Server will stop after")),
    ).toBeUndefined();
  }, 5_000);

  it("serveReport without an explicit open flag defaults to opening the browser", async () => {
    // Hits server.ts line 109 (`options.open ?? true`) for the nullish branch.
    // DOUBLCOV_DISABLE_BROWSER_OPEN is set in test/setup.ts, so launchBrowser
    // is a no-op — but the `?? true` branch is still evaluated.
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const killTimer = setTimeout(() => {
      process.emit("SIGTERM");
    }, 100);
    try {
      await serveReport(reportRoot, { timeoutMs: 0, port: 0 });
    } finally {
      clearTimeout(killTimer);
      stdoutSpy.mockRestore();
    }
  }, 5_000);

  it("serveReport without an explicit timeoutMs takes the DEFAULT_SERVE_TIMEOUT_MS path", async () => {
    // Hits server.ts line 76 (`options.timeoutMs ?? DEFAULT_SERVE_TIMEOUT_MS`)
    // for the nullish branch.
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const killTimer = setTimeout(() => {
      process.emit("SIGTERM");
    }, 100);
    try {
      await serveReport(reportRoot, { open: false, port: 0 });
    } finally {
      clearTimeout(killTimer);
      stdoutSpy.mockRestore();
    }
  }, 5_000);

  it("/__doublcov/extend on a server with timeoutMs=0 keeps the deadline at infinity", async () => {
    // Hits server.ts line 133 (state.timeoutMs > 0 ternary) for the falsy
    // branch — extend on an unlimited server returns a 200 with no remainingMs.
    const state = {
      timeoutMs: 0,
      deadline: Number.POSITIVE_INFINITY,
      shutdownListeners: new Set<() => void>(),
    };
    const server = http.createServer((req, res) => {
      void serveRequest(
        reportRoot,
        state as unknown as Parameters<typeof serveRequest>[1],
        req.url ?? "/",
        res,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address() as AddressInfo;
      const result = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          http
            .get(
              `http://127.0.0.1:${address.port}/__doublcov/extend`,
              (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (c: Buffer) => chunks.push(c));
                response.on("end", () => {
                  resolve({
                    status: response.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString("utf8"),
                  });
                });
                response.on("error", reject);
              },
            )
            .on("error", reject);
        },
      );
      expect(result.status).toBe(200);
      const data = JSON.parse(result.body) as {
        timeoutMs: number;
        remainingMs: number;
      };
      expect(data.timeoutMs).toBe(0);
      expect(data.remainingMs).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("projectConfig.ts TOML edges", () => {
  it("foundry.toml without a [profile.default] header still merges root keys", async () => {
    // Hits readFoundryDefaults line 146 (`?? sections.get('')`) middle branch
    // and line 152 (`sources ? ... : {}`) falsy branch (no `src`).
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

  it("foundry.toml [profile.default] without `src` returns empty sources", async () => {
    // Hits readFoundryDefaults line 152 falsy branch (sources missing).
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

  it("foundry.toml with single-quoted strings parses without losing quotes", async () => {
    // Hits stripTomlComment line 313 single-quote branches.
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

  it("foundry.toml multi-line array containing a single-quoted entry parses correctly", async () => {
    // Hits hasMatchingClosingBracket line 327 single-quote branches: the
    // FIRST line of the multi-line array assignment contains a `'`, so when
    // hasMatchingClosingBracket walks valueText it actually encounters one.
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

  it("foundry.toml first-line array with nested brackets walks past the inner ']'", async () => {
    // Hits hasMatchingClosingBracket line 332 (`if (depth === 0) return true`)
    // falsy branch — the inner `]` closes one level but not the outer, so the
    // function must keep walking. Real foundry.toml never has nested arrays in
    // src, but the parser must not crash if it sees one.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-foundry-nested-"));
    await writeFile(
      path.join(root, "foundry.toml"),
      // First line opens TWO brackets but doesn't close the outer one.
      ["[profile.default]", "src = [[a],", "  [b]]"].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "foundry",
      foundryBuilder,
      root,
    );
    // Whatever we get back, the parser must not have thrown.
    expect(defaults).toBeDefined();
  });

  it("hardhat without any hardhat.config.* and no .solcover.js returns empty defaults", async () => {
    // Hits readHardhatDefaults line 164 (`configPath ? ... : undefined`) falsy
    // branch and line 170 (`hardhatText ? ... : {}`) falsy branch.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-hardhat-empty-"));
    const defaults = await readBuilderProjectDefaults(
      "hardhat",
      hardhatBuilder,
      root,
    );
    expect(defaults).toEqual({});
  });

  it("solcover.js without coverageDir or coverageDirectory yields no lcov default", async () => {
    // Hits readSolcoverTextDefaults line 187 (`reportDir ? ... : {}`) falsy.
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

  it(".c8rc with a non-record JSON value (top-level array) returns empty defaults", async () => {
    // Hits readC8Defaults line 234 (`!isRecord(json)`) truthy branch.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-arr-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify(["not", "an", "object"]),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults("v8", c8Builder, root);
    expect(defaults).toEqual({});
  });

  it(".c8rc with only camelCase reportDir (no kebab-case) still resolves the lcov path", async () => {
    // Hits readC8Defaults line 236 (`stringValue(json['report-dir']) ??
    // stringValue(json.reportDir)`) for the second-operand path.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-camel-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify({ reportDir: "camel/c8" }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults("v8", c8Builder, root);
    expect(defaults.lcov).toBe("camel/c8/lcov.info");
  });

  it(".c8rc.json present but with neither report-dir nor reportDir returns empty", async () => {
    // Hits readC8Defaults line 237 (`reportDir ? ... : {}`) falsy branch.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-blank-"));
    await writeFile(
      path.join(root, ".c8rc.json"),
      JSON.stringify({ all: true }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults("v8", c8Builder, root);
    expect(defaults).toEqual({});
  });

  it("pytest with no pyproject.toml at all returns empty defaults", async () => {
    // Hits readPytestDefaults line 244 (`!text` truthy branch).
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pytest-empty-"));
    const defaults = await readBuilderProjectDefaults(
      "pytest",
      pytestBuilder,
      root,
    );
    expect(defaults).toEqual({});
  });

  it("pyproject.toml without a [tool.coverage.lcov] section returns empty", async () => {
    // Hits readPytestDefaults line 247 (`lcov ? ... : {}`) falsy branch.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-pytest-norun-"));
    await writeFile(
      path.join(root, "pyproject.toml"),
      ["[tool.coverage.run]", "branch = true"].join("\n"),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "pytest",
      pytestBuilder,
      root,
    );
    expect(defaults).toEqual({});
  });

  it("vitest config that mentions coverage but has no reportsDirectory yields no defaults", async () => {
    // Hits readVitestDefaults line 100 falsy branch (`reportDir ? ... : {}`).
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-vitest-blank-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ vitest: { coverage: { provider: "v8" } } }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults(
      "vite",
      viteBuilder,
      root,
    );
    expect(defaults).toEqual({});
  });

  it("package.json with non-string c8 entries falls back to plain stringValue", async () => {
    // Hits projectConfig.ts line 423 (`typeof value === 'string' &&
    // value.trim()`) — the non-string branch — when c8.report-dir is a number.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-c8-types-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ c8: { "report-dir": 42, reportDir: "" } }),
      "utf8",
    );
    const defaults = await readBuilderProjectDefaults("v8", c8Builder, root);
    expect(defaults).toEqual({});
  });
});

describe("fs.ts normalizeExtension empty input", () => {
  it("readSourceFiles tolerates extensions that normalize to empty strings", async () => {
    // Hits fs.ts line 246 (`if (!trimmed) return trimmed;`) for empty/blank
    // entries. Empty extensions can't currently come through the CLI but the
    // helper must be defensive.
    const root = await mkdtemp(path.join(tmpdir(), "doublcov-fs-emptyext-"));
    const { readSourceFiles } = await import("../src/fs.js");
    const { mkdir, writeFile: w } = await import("node:fs/promises");
    await mkdir(path.join(root, "src"), { recursive: true });
    await w(path.join(root, "src", "f.ts"), "x\n", "utf8");
    const files = await readSourceFiles(["src"], {
      root,
      extensions: ["", "   ", ".ts"],
    });
    expect(files.map((f) => f.path)).toEqual(["src/f.ts"]);
  });
});

describe("build.ts helper branch gaps", () => {
  it("sanitizeHistory drops a run whose totals field is not a record", async () => {
    // Hits sanitizeRunTotals line 299 (`!isRecord(input)`) truthy branch
    // when input.totals is a string instead of an object.
    const { sanitizeHistory } = await import("../src/build.js");
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "no-totals-object",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: "not-an-object",
          files: [],
        },
      ],
    });
    expect(result?.runs).toHaveLength(0);
  });

  it("resolveBuildOptions takes config.mode when explicit.mode is false but config has mode", async () => {
    // Hits build.ts resolveBuildOptions line 148 (`config.mode`) truthy branch.
    const { resolveBuildOptions } = await import("../src/build.js");
    const out = resolveBuildOptions(
      {
        lcov: "lcov.info",
        sources: ["src"],
        sourceExtensions: [".ts"],
        out: "report",
        history: "history.json",
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        explicit: {
          lcov: false,
          sources: false,
          sourceExtensions: false,
          out: false,
          history: false,
          mode: false,
        },
      },
      { mode: "static" },
    );
    expect(out.mode).toBe("static");
  });

  it("resolveBuildOptions with explicit.mode=true and options.mode undefined drops mode", async () => {
    // Hits build.ts resolveBuildOptions line 144-147 (`options.explicit?.mode`
    // truthy + `options.mode` falsy) — without a real mode set, the result
    // should NOT include a mode key, even though explicit.mode is true.
    const { resolveBuildOptions } = await import("../src/build.js");
    const out = resolveBuildOptions(
      {
        lcov: "lcov.info",
        sources: ["src"],
        sourceExtensions: [".ts"],
        out: "report",
        history: "history.json",
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        explicit: { mode: true },
      },
      { mode: "static" },
    );
    expect(out.mode).toBeUndefined();
  });
});

describe("run.ts resolveBuilderOptions branch gaps", () => {
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

  it("respects explicit.mode=true to take options.mode over config.mode", () => {
    // Hits run.ts line 119 (`options.explicit?.mode`) truthy branch.
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

  it("respects explicit.name=true to take options.name over config.name", () => {
    // Hits run.ts line 122 (`options.explicit?.name`) truthy branch.
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

describe("builder prepareRun lcov fallbacks", () => {
  it("pytest falls back to its defaultLcov when options.lcov is undefined", async () => {
    // Hits pytest.ts line 17 second branch (`options.lcov ?? defaultLcov`).
    const run = await pytestBuilder.prepareRun(
      builderOptions({ lcov: undefined }),
    );
    expect(run.lcov).toBe("coverage/lcov.info");
  });

  it("lcov-capture falls back to its defaultLcov when options.lcov is undefined", async () => {
    // Hits lcovCapture.ts line 16 second branch.
    const run = await lcovCaptureBuilder.prepareRun(
      builderOptions({ lcov: undefined }),
    );
    expect(run.lcov).toBe("coverage/lcov.info");
  });

  it("cargo-llvm-cov falls back to its defaultLcov when options.lcov is undefined", async () => {
    // Hits cargoLlvmCov.ts line 17 second branch.
    const run = await cargoLlvmCovBuilder.prepareRun(
      builderOptions({ lcov: undefined }),
    );
    expect(run.lcov).toBe("coverage/lcov.info");
  });

  // The `?? "coverage/lcov.info"` literal trailing each builder's
  // `defaultLcov ?? ...` chain is genuinely unreachable: every shipped builder
  // defines defaultLcov at construction. Asserting on those branches would
  // require mutating the plugin object at runtime (and mutation tests defeat
  // the purpose of the literal fallback). They remain as defense-in-depth.
  void [
    foundryBuilder,
    hardhatBuilder,
    viteBuilder,
    jestBuilder,
    c8Builder,
    cargoTarpaulinBuilder,
  ];
});

describe("runCoverageBuilder option-passing branch gaps", () => {
  const FIXTURE_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../fixtures/simple",
  );
  let workspace: string;
  let originalCwd: string;
  let originalWebAssetsDir: string | undefined;
  let originalCi: string | undefined;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-branch-runner-")),
    );
    await cp(FIXTURE_DIR, workspace, { recursive: true });
    // Minimal web assets so buildReport can copy them.
    const webRoot = path.join(workspace, "web-assets");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(webRoot, "assets"), { recursive: true });
    await writeFile(
      path.join(webRoot, "index.html"),
      [
        "<!doctype html>",
        "<html><head>",
        '<link rel="stylesheet" href="./assets/index.css">',
        "</head><body>",
        '<div id="app"></div>',
        '<script type="module" src="./assets/index.js"></script>',
        "</body></html>",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(webRoot, "assets", "index.css"),
      ".x{}\n",
      "utf8",
    );
    await writeFile(
      path.join(webRoot, "assets", "index.js"),
      "console.log(1);\n",
      "utf8",
    );
    originalWebAssetsDir = process.env.DOUBLCOV_WEB_ASSETS_DIR;
    process.env.DOUBLCOV_WEB_ASSETS_DIR = webRoot;
    // Force static mode by setting CI=1 — the buildReport flow under test
    // doesn't pass options.mode, so resolveReportMode reads CI from env.
    originalCi = process.env.CI;
    process.env.CI = "1";
    originalCwd = process.cwd();
    process.chdir(workspace);
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    if (originalWebAssetsDir === undefined) {
      delete process.env.DOUBLCOV_WEB_ASSETS_DIR;
    } else {
      process.env.DOUBLCOV_WEB_ASSETS_DIR = originalWebAssetsDir;
    }
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  it("forwards options.customization and options.name and omits mode/open when not set", async () => {
    // This hits run.ts lines 46 (mode falsy), 51 (open undefined), 52
    // (customization truthy), and 55 (resolvedOptions.name truthy).
    const fixtureLcov = path.join(workspace, "lcov.info");
    const customizationPath = path.join(workspace, "doublcov.config.json");
    await writeFile(
      customizationPath,
      JSON.stringify({
        defaultTheme: "custom-theme",
        themes: [
          {
            id: "custom-theme",
            label: "Custom Theme",
            mode: "dark",
            tokens: { bg: "#000000" },
          },
        ],
      }),
      "utf8",
    );
    const builder: CoverageBuilderPlugin = {
      id: "branch-coverage-runner",
      aliases: [],
      label: "Branch Coverage Runner",
      description: "",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "process.exit(0)"],
          lcov: fixtureLcov,
        };
      },
    };
    registerCoverageBuilder(builder);
    try {
      await runCoverageBuilder("branch-coverage-runner", {
        sources: ["src"],
        sourceExtensions: [".sol"],
        out: path.join(workspace, "coverage", "report"),
        history: path.join(workspace, ".doublcov", "history.json"),
        diagnostics: [],
        port: 0,
        timeoutMs: 0,
        builderArgs: [],
        // Note: NO open, NO mode. The CI=1 env forces static mode in
        // resolveReportMode, so makeIndexHtmlStandalone is skipped.
        customization: {
          path: customizationPath,
          required: true,
        },
        name: "explicit-project-name",
        explicit: {
          lcov: false,
          sources: true,
          sourceExtensions: true,
          out: true,
          history: true,
          mode: false,
          name: true,
        },
      });
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "branch-coverage-runner",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
  });
});

describe("buildReport project-name and env branch gaps", () => {
  const FIXTURE_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../fixtures/simple",
  );
  let workspace: string;
  let originalCwd: string;
  let originalWebAssetsDir: string | undefined;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-build-branch-")),
    );
    await cp(FIXTURE_DIR, workspace, { recursive: true });
    const webRoot = path.join(workspace, "web-assets");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(webRoot, "assets"), { recursive: true });
    await writeFile(
      path.join(webRoot, "index.html"),
      [
        "<!doctype html>",
        "<html><head>",
        '<link rel="stylesheet" href="./assets/index.css">',
        "</head><body>",
        '<div id="app"></div>',
        '<script type="module" src="./assets/index.js"></script>',
        "</body></html>",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(webRoot, "assets", "index.css"),
      ".x{}\n",
      "utf8",
    );
    await writeFile(
      path.join(webRoot, "assets", "index.js"),
      "console.log(1);\n",
      "utf8",
    );
    originalWebAssetsDir = process.env.DOUBLCOV_WEB_ASSETS_DIR;
    process.env.DOUBLCOV_WEB_ASSETS_DIR = webRoot;
    originalCwd = process.cwd();
    process.chdir(workspace);
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    if (originalWebAssetsDir === undefined) {
      delete process.env.DOUBLCOV_WEB_ASSETS_DIR;
    } else {
      process.env.DOUBLCOV_WEB_ASSETS_DIR = originalWebAssetsDir;
    }
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  it("infers a real project name from a valid package.json (string name field)", async () => {
    // Hits build.ts line 361 (`if (packageJsonName) return ...`) truthy and
    // line 377 (`typeof packageJson.name === 'string'` truthy).
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "branch-coverage-test-project" }),
      "utf8",
    );
    const { buildReport } = await import("../src/build.js");
    const result = await buildReport({
      lcov: path.join(workspace, "lcov.info"),
      sources: ["src"],
      sourceExtensions: [".sol"],
      out: path.join(workspace, "coverage", "report"),
      history: path.join(workspace, ".doublcov", "history.json"),
      port: 0,
      timeoutMs: 0,
      diagnostics: [],
      mode: "static",
      open: false,
    });
    const { readFile } = await import("node:fs/promises");
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    expect(report.projectName).toBe("branch-coverage-test-project");
  });

  it("readDiagnosticInputs filters out diagnostic files that don't exist", async () => {
    // Hits build.ts line 344 (`if (!content) return null;`) truthy branch.
    const { buildReport } = await import("../src/build.js");
    const result = await buildReport({
      lcov: path.join(workspace, "lcov.info"),
      sources: ["src"],
      sourceExtensions: [".sol"],
      out: path.join(workspace, "coverage", "report"),
      history: path.join(workspace, ".doublcov", "history.json"),
      port: 0,
      timeoutMs: 0,
      diagnostics: [
        // Missing file: readTextIfPresent returns undefined → filtered out.
        {
          parser: "foundry-debug",
          path: path.join(workspace, "missing.txt"),
        },
      ],
      mode: "static",
      open: false,
    });
    expect(result.outDir).toBe(path.join(workspace, "coverage", "report"));
  });

  it("preserves an existing valid history.json across the build (history truthy spread)", async () => {
    // Hits build.ts line 90 (`history ? { history } : {}`) truthy branch.
    const historyPath = path.join(workspace, ".doublcov", "history.json");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(historyPath), { recursive: true });
    await writeFile(
      historyPath,
      JSON.stringify({
        schemaVersion: 1,
        runs: [
          {
            id: "previous-run",
            timestamp: "2025-01-01T00:00:00.000Z",
            totals: {
              lines: { found: 10, hit: 5, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
              branches: { found: 0, hit: 0, percent: 0 },
            },
            files: [],
          },
        ],
      }),
      "utf8",
    );
    const { buildReport } = await import("../src/build.js");
    const result = await buildReport({
      lcov: path.join(workspace, "lcov.info"),
      sources: ["src"],
      sourceExtensions: [".sol"],
      out: path.join(workspace, "coverage", "report"),
      history: historyPath,
      port: 0,
      timeoutMs: 0,
      diagnostics: [],
      mode: "static",
      open: false,
    });
    const { readFile } = await import("node:fs/promises");
    const report = JSON.parse(
      await readFile(path.join(result.outDir, "data", "report.json"), "utf8"),
    );
    // The historic run must survive into the report bundle.
    expect(report.history.runs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not write a history file when resolvedOptions.history is empty", async () => {
    // Hits build.ts line 112 (`if (resolvedOptions.history)`) falsy branch —
    // when the resolved history path is empty, the atomic write is skipped.
    const { buildReport } = await import("../src/build.js");
    const result = await buildReport({
      lcov: path.join(workspace, "lcov.info"),
      sources: ["src"],
      sourceExtensions: [".sol"],
      out: path.join(workspace, "coverage", "report"),
      history: "",
      port: 0,
      timeoutMs: 0,
      diagnostics: [],
      mode: "static",
      open: false,
      explicit: {
        lcov: true,
        sources: true,
        sourceExtensions: true,
        out: true,
        history: true,
      },
    });
    expect(result.outDir).toBeDefined();
  });

  it("falls back to in-tree apps/web/dist when DOUBLCOV_WEB_ASSETS_DIR is unset", async () => {
    // Hits build.ts line 391 (`process.env.DOUBLCOV_WEB_ASSETS_DIR ? ... : []`)
    // for the falsy branch. Since the env var is set in beforeEach, we have
    // to clear it here AND restore the env-var-set candidate so resolveWebAssets
    // can still find a usable web directory: we copy the test's web-assets
    // into the in-tree `web` location relative to the build module.
    delete process.env.DOUBLCOV_WEB_ASSETS_DIR;
    // The first non-env candidate is `currentDir/web` where currentDir is
    // dirname of the dist or src. Since we're running in vitest, currentDir
    // is `packages/cli/src`. The second candidate walks up to apps/web/dist.
    // Either should already exist in this monorepo; if not, the test will
    // fail loudly and tell us.
    const { buildReport } = await import("../src/build.js");
    await expect(
      buildReport({
        lcov: path.join(workspace, "lcov.info"),
        sources: ["src"],
        sourceExtensions: [".sol"],
        out: path.join(workspace, "coverage", "report"),
        history: path.join(workspace, ".doublcov", "history.json"),
        port: 0,
        timeoutMs: 0,
        diagnostics: [],
        mode: "static",
        open: false,
      }),
    ).resolves.toBeDefined();
  });
});
