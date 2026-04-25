import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/build.js", () => ({
  buildReport: vi.fn(),
}));
vi.mock("../src/builders/run.js", () => ({
  runCoverageBuilder: vi.fn(),
}));
vi.mock("../src/server.js", () => ({
  openReport: vi.fn(),
  serveReport: vi.fn(),
}));

import { buildReport } from "../src/build.js";
import { runCoverageBuilder } from "../src/builders/run.js";
import { main, run } from "../src/index.js";
import { openReport, serveReport } from "../src/server.js";

const mockedBuild = vi.mocked(buildReport);
const mockedRunBuilder = vi.mocked(runCoverageBuilder);
const mockedOpen = vi.mocked(openReport);
const mockedServe = vi.mocked(serveReport);

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutChunks: string[];
let stderrChunks: string[];
const originalExitCode = process.exitCode;

beforeEach(() => {
  stdoutChunks = [];
  stderrChunks = [];
  stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdoutChunks.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      return true;
    });
  stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderrChunks.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      return true;
    });
  process.exitCode = undefined;
  mockedBuild.mockReset();
  mockedRunBuilder.mockReset();
  mockedOpen.mockReset();
  mockedServe.mockReset();
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = originalExitCode;
});

describe("main()", () => {
  it("prints help text for no args", async () => {
    await main([]);
    expect(stdoutChunks.join("")).toMatch(/Doublcov/);
    expect(mockedBuild).not.toHaveBeenCalled();
  });

  it("prints help text for --help and -h", async () => {
    await main(["--help"]);
    await main(["-h"]);
    await main(["help"]);
    const all = stdoutChunks.join("");
    // Three help prints.
    expect(all.match(/Doublcov/g)?.length).toBe(3);
  });

  it("invokes buildReport for the build command", async () => {
    mockedBuild.mockResolvedValue({
      open: false,
      outDir: "coverage/report",
      mode: "standalone",
    } as Awaited<ReturnType<typeof buildReport>>);
    await main(["build"]);
    expect(mockedBuild).toHaveBeenCalledTimes(1);
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it("opens the report after build when result.open is true", async () => {
    mockedBuild.mockResolvedValue({
      open: true,
      outDir: "coverage/report",
      mode: "static",
    } as Awaited<ReturnType<typeof buildReport>>);
    await main(["build"]);
    expect(mockedOpen).toHaveBeenCalledWith(
      "coverage/report",
      expect.objectContaining({ mode: "static" }),
    );
  });

  it("invokes runCoverageBuilder for builder commands", async () => {
    mockedRunBuilder.mockResolvedValue(undefined);
    await main(["forge", "--", "--exclude-tests"]);
    expect(mockedRunBuilder).toHaveBeenCalledTimes(1);
    expect(mockedRunBuilder.mock.calls[0]?.[0]).toBe("forge");
  });

  it("invokes serveReport for the serve command", async () => {
    mockedServe.mockResolvedValue(undefined);
    await main(["serve", "coverage/report", "--port", "0"]);
    expect(mockedServe).toHaveBeenCalledTimes(1);
    expect(mockedServe.mock.calls[0]?.[0]).toBe("coverage/report");
    expect(mockedServe.mock.calls[0]?.[1]).toMatchObject({ open: true });
  });

  it("invokes openReport for the open command", async () => {
    mockedOpen.mockResolvedValue(undefined);
    await main(["open", "coverage/report"]);
    expect(mockedOpen).toHaveBeenCalledTimes(1);
    expect(mockedOpen.mock.calls[0]?.[0]).toBe("coverage/report");
  });

  it("throws on an unknown command", async () => {
    await expect(main(["totally-bogus-cmd"])).rejects.toThrow(
      /Unknown command "totally-bogus-cmd"/,
    );
  });
});

describe("run()", () => {
  it("writes parseCommand errors to stderr and sets exit code 1", async () => {
    await run(["totally-bogus-cmd"]);
    expect(stderrChunks.join("")).toMatch(/Unknown command "totally-bogus-cmd"/);
    expect(process.exitCode).toBe(1);
  });

  it("writes buildReport errors to stderr and sets exit code 1", async () => {
    mockedBuild.mockRejectedValue(new Error("kaboom"));
    await run(["build"]);
    expect(stderrChunks.join("")).toMatch(/kaboom/);
    expect(process.exitCode).toBe(1);
  });

  it("writes runCoverageBuilder errors to stderr and sets exit code 1", async () => {
    mockedRunBuilder.mockRejectedValue(new Error("builder failed"));
    await run(["forge"]);
    expect(stderrChunks.join("")).toMatch(/builder failed/);
    expect(process.exitCode).toBe(1);
  });

  it("stringifies non-Error throwables", async () => {
    mockedBuild.mockRejectedValue("a string failure");
    await run(["build"]);
    expect(stderrChunks.join("")).toMatch(/a string failure/);
    expect(process.exitCode).toBe(1);
  });

  it("succeeds with exit code unset for the help command", async () => {
    await run(["--help"]);
    expect(stderrChunks.join("")).toBe("");
    expect(process.exitCode).toBeUndefined();
  });
});
