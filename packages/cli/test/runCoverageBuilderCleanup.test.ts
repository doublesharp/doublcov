import { describe, expect, it } from "vitest";
import { registerCoverageBuilder } from "../src/builders/registry.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";
import {
  builderOptions,
  unregisterCoverageBuilder,
} from "./runCoverageBuilderHelpers.js";

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
      unregisterCoverageBuilder("prepare-rejects");
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
      unregisterCoverageBuilder("self-killing");
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
      unregisterCoverageBuilder("cleanup-on-failure");
    }
  });
});
