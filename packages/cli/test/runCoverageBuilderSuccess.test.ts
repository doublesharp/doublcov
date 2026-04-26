import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cp, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerCoverageBuilder } from "../src/builders/registry.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";
import {
  builderOptions,
  unregisterCoverageBuilder,
  writeMinimalWebAssets,
} from "./runCoverageBuilderHelpers.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/simple",
);

describe("runCoverageBuilder success path", () => {
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
        unregisterCoverageBuilder("open-on-success");
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
      unregisterCoverageBuilder("happy-path-runner");
    }

    expect(prepareCalled).toBe(true);
    expect(cleanupCalled).toBe(true);
  });
});
