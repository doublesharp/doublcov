import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoverageBuilder } from "../src/builders/registry.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import type { CoverageBuilderPlugin } from "../src/builders/types.js";
import {
  builderOptions,
  unregisterCoverageBuilder,
} from "./runCoverageBuilderHelpers.js";

describe("runCoverageBuilder command logging", () => {
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

  it("single-quotes args containing shell metacharacters before logging", async () => {
    const builder: CoverageBuilderPlugin = {
      id: "shell-meta-test",
      aliases: [],
      label: "Shell Meta Test",
      description: "",
      async prepareRun() {
        return {
          command: "node",
          args: ["-e", "process.exit(2); /* rm -rf / */", "x|y", "a&&b"],
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
      unregisterCoverageBuilder("shell-meta-test");
    }

    const printed = chunks.join("");
    expect(printed).toContain("'process.exit(2); /* rm -rf / */'");
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
          args: ["-e", "void 'hi'; process.exit(4)"],
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
      unregisterCoverageBuilder("single-quote-test");
    }

    expect(chunks.join("")).toContain(
      String.raw`'void '\''hi'\''; process.exit(4)'`,
    );
  });
});
