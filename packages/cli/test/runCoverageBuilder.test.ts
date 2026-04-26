import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderOptions } from "../src/args.js";
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  coverageBuilders,
  registerCoverageBuilder,
} from "../src/builders/registry.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";

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

async function writeMinimalWebAssets(root: string): Promise<void> {
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(
    path.join(root, "index.html"),
    [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<link rel="stylesheet" href="./assets/index.css">',
      "</head>",
      "<body>",
      '<div id="app"></div>',
      '<script type="module" src="./assets/index.js"></script>',
      "</body>",
      "</html>",
    ].join("\n"),
    "utf8",
  );
  await writeFile(path.join(root, "assets", "index.css"), ".app{}\n", "utf8");
  await writeFile(
    path.join(root, "assets", "index.js"),
    'console.log("doublcov test asset");\n',
    "utf8",
  );
}

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

describe("runCoverageBuilder success path", () => {
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
      await mkdtemp(path.join(tmpdir(), "doublcov-runner-")),
    );
    await cp(FIXTURE_DIR, workspace, { recursive: true });
    await writeMinimalWebAssets(path.join(workspace, "web-assets"));
    originalWebAssetsDir = process.env.DOUBLCOV_WEB_ASSETS_DIR;
    process.env.DOUBLCOV_WEB_ASSETS_DIR = path.join(workspace, "web-assets");
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

  it("invokes openReport with the resolved mode/port when result.open is true", async () => {
    // Spy on the server module so the success path triggers openReport
    // without actually launching a browser.
    const serverModule = await import("../src/server.js");
    const openSpy = vi
      .spyOn(serverModule, "openReport")
      .mockResolvedValue(undefined);
    try {
      const fixtureLcov = path.join(workspace, "lcov.info");
      const builder: CoverageBuilderPlugin = {
        id: "open-on-success",
        aliases: [],
        label: "Open On Success",
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
        await runCoverageBuilder(
          "open-on-success",
          builderOptions({
            lcov: fixtureLcov,
            sources: ["src"],
            sourceExtensions: [".sol"],
            out: path.join(workspace, "coverage", "report"),
            history: path.join(workspace, ".doublcov", "history.json"),
            open: true,
            mode: "static",
            port: 0,
            timeoutMs: 60_000,
            explicit: {
              lcov: true,
              sources: true,
              sourceExtensions: true,
              out: true,
              history: true,
              name: false,
            },
          }),
        );
      } finally {
        const index = coverageBuilders.findIndex(
          (candidate) => candidate.id === "open-on-success",
        );
        if (index !== -1) coverageBuilders.splice(index, 1);
      }
      expect(openSpy).toHaveBeenCalledTimes(1);
      const [reportDir, opts] = openSpy.mock.calls[0] ?? [];
      expect(reportDir).toBe(path.join(workspace, "coverage", "report"));
      expect(opts).toMatchObject({ mode: "static", port: 0 });
    } finally {
      openSpy.mockRestore();
    }
  });

  it("runs prepareRun, the command, then buildReport without opening when open=false", async () => {
    let prepareCalled = false;
    let cleanupCalled = false;
    const fixtureLcov = path.join(workspace, "lcov.info");
    const builder: CoverageBuilderPlugin = {
      id: "happy-path-runner",
      aliases: [],
      label: "Happy Path Runner",
      description: "Runs successfully and produces an LCOV file",
      async prepareRun() {
        prepareCalled = true;
        return {
          // Use a no-op command; we already have a real lcov.info from the
          // fixture so buildReport can succeed without a real coverage tool.
          command: "node",
          args: ["-e", "process.exit(0)"],
          lcov: fixtureLcov,
          cleanup: async () => {
            cleanupCalled = true;
          },
        };
      },
    };
    registerCoverageBuilder(builder);
    try {
      await runCoverageBuilder(
        "happy-path-runner",
        builderOptions({
          lcov: fixtureLcov,
          sources: ["src"],
          sourceExtensions: [".sol"],
          out: path.join(workspace, "coverage", "report"),
          history: path.join(workspace, ".doublcov", "history.json"),
          open: false,
          // Force static mode so buildReport doesn't try to inline the
          // standalone HTML (avoids needing a particular index.html shape).
          mode: "static",
          explicit: {
            lcov: true,
            sources: true,
            sourceExtensions: true,
            out: true,
            history: true,
            name: false,
          },
        }),
      );
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "happy-path-runner",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
    expect(prepareCalled).toBe(true);
    expect(cleanupCalled).toBe(true);
  });
});

describe("runCoverageBuilder argument quoting", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let chunks: string[];

  beforeEach(() => {
    chunks = [];
    writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(
          typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
        );
        return true;
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("single-quotes args containing shell metacharacters (;, |, &&) before logging", async () => {
    const builder: CoverageBuilderPlugin = {
      id: "shell-meta-test",
      aliases: [],
      label: "Shell Meta Test",
      description: "",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "process.exit(2); rm -rf /", "x|y", "a&&b"],
          lcov: "/tmp/never-written.lcov",
        };
      },
    };
    registerCoverageBuilder(builder);
    try {
      await expect(
        runCoverageBuilder("shell-meta-test", builderOptions()),
      ).rejects.toThrow(/exited with status/);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "shell-meta-test",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
    const printed = chunks.join("");
    // Each metachar-bearing arg must be inside single quotes; the dangerous
    // tokens must NOT appear unescaped on the command line.
    expect(printed).toContain("'process.exit(2); rm -rf /'");
    expect(printed).toContain("'x|y'");
    expect(printed).toContain("'a&&b'");
  });

  it("escapes embedded single quotes via the '\\'' shell sequence", async () => {
    const builder: CoverageBuilderPlugin = {
      id: "single-quote-test",
      aliases: [],
      label: "Single Quote Test",
      description: "",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "console.log('hi'); process.exit(4)"],
          lcov: "/tmp/never-written.lcov",
        };
      },
    };
    registerCoverageBuilder(builder);
    try {
      await expect(
        runCoverageBuilder("single-quote-test", builderOptions()),
      ).rejects.toThrow(/exited with status 4/);
    } finally {
      const index = coverageBuilders.findIndex(
        (candidate) => candidate.id === "single-quote-test",
      );
      if (index !== -1) coverageBuilders.splice(index, 1);
    }
    const printed = chunks.join("");
    // The literal "'\\''" sequence is how POSIX shell escapes a single quote
    // inside a single-quoted string. The arg must round-trip safely.
    expect(printed).toContain(
      String.raw`'console.log('\''hi'\''); process.exit(4)'`,
    );
  });
});

describe("runCoverageBuilder error handling and cleanup", () => {
  it("surfaces prepareRun errors before spawning a command", async () => {
    const builder: CoverageBuilderPlugin = {
      id: "prepare-rejects",
      aliases: [],
      label: "Prepare Rejects",
      description: "",
      async prepareRun() {
        throw new Error("prepare boom");
      },
    };
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
