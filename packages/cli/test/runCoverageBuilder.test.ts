import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoverageBuilder } from "../src/builders/registry.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";
import {
  builderOptions,
  unregisterCoverageBuilder,
} from "./runCoverageBuilderHelpers.js";

describe("runCoverageBuilder failure paths", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

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
      unregisterCoverageBuilder("failing-test-tool");
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
      unregisterCoverageBuilder("missing-tool");
    }
  });
});
