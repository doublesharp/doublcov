import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  browserOpenCommand,
  detectReportMode,
  launchBrowser,
  openReport,
} from "../src/server.js";

let tempRoot: string;
let reportRoot: string;

beforeEach(async () => {
  process.env.DOUBLCOV_DISABLE_BROWSER_OPEN = "1";
  tempRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "doublcov-server-suite-")),
  );
  reportRoot = path.join(tempRoot, "report");
  await mkdir(reportRoot, { recursive: true });
});

afterEach(async () => {
  delete process.env.DOUBLCOV_DISABLE_BROWSER_OPEN;
  await rm(tempRoot, { recursive: true, force: true });
});

describe("browserOpenCommand", () => {
  it("uses open on macOS", () => {
    expect(
      browserOpenCommand("file:///tmp/report/index.html", "darwin"),
    ).toEqual({
      command: "open",
      args: ["file:///tmp/report/index.html"],
    });
  });

  it("uses cmd start on Windows", () => {
    expect(browserOpenCommand("file:///C:/report/index.html", "win32")).toEqual(
      {
        command: "cmd",
        args: ["/c", "start", "", "file:///C:/report/index.html"],
      },
    );
  });

  it("uses xdg-open on Linux and other platforms", () => {
    expect(
      browserOpenCommand("file:///tmp/report/index.html", "linux"),
    ).toEqual({
      command: "xdg-open",
      args: ["file:///tmp/report/index.html"],
    });
  });
});

describe("detectReportMode", () => {
  it("returns 'standalone' when the index embeds the doublcov-report-data marker", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    await writeFile(
      indexPath,
      '<html><body><script id="doublcov-report-data" type="application/json">{}</script></body></html>',
      "utf8",
    );
    expect(await detectReportMode(indexPath)).toBe("standalone");
  });

  it("returns 'static' when the marker is missing", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    await writeFile(indexPath, "<html><body>plain</body></html>", "utf8");
    expect(await detectReportMode(indexPath)).toBe("static");
  });

  it("does not blow up on a large index.html", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    const filler = "x".repeat(1024 * 1024);
    await writeFile(indexPath, `<html><body>${filler}</body></html>`, "utf8");
    expect(await detectReportMode(indexPath)).toBe("static");
  });
});

describe("launchBrowser failure handling", () => {
  it("writes to stderr and does not throw when the opener cannot be spawned", async () => {
    const writes: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });
    const previous = process.env.DOUBLCOV_DISABLE_BROWSER_OPEN;
    delete process.env.DOUBLCOV_DISABLE_BROWSER_OPEN;
    try {
      launchBrowser("file:///tmp/dummy", {
        command: "doublcov-nonexistent-browser-binary",
        args: ["file:///tmp/dummy"],
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const matched = writes.find((w) =>
        w.includes("Could not open browser automatically"),
      );
      expect(matched, `stderr writes: ${JSON.stringify(writes)}`).toBeDefined();
    } finally {
      spy.mockRestore();
      process.stderr.write = original;
      if (previous !== undefined) {
        process.env.DOUBLCOV_DISABLE_BROWSER_OPEN = previous;
      }
    }
  });
});

describe("openReport", () => {
  it("dispatches static reports through serveReport with a real HTTP listener", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    await writeFile(indexPath, "<html><body>static</body></html>", "utf8");

    const stdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });

    try {
      await openReport(reportRoot, { mode: "static", timeoutMs: 100 });
    } finally {
      stdoutSpy.mockRestore();
    }

    expect(stdoutWrites.some((m) => m.startsWith("Serving "))).toBe(true);
  }, 5_000);

  it("passes an explicit static-server port through to the listener", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    await writeFile(indexPath, "<html><body>static</body></html>", "utf8");

    const stdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    try {
      await openReport(reportRoot, {
        mode: "static",
        port: 0,
        timeoutMs: 100,
      });
    } finally {
      stdoutSpy.mockRestore();
    }

    expect(stdoutWrites.join("")).toMatch(/URL: http:\/\/127\.0\.0\.1:\d+\//);
  }, 5_000);

  it("opens index.html via the file URL when mode is standalone", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    await writeFile(
      indexPath,
      '<html><body><script id="doublcov-report-data">{}</script></body></html>',
      "utf8",
    );

    const stdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      await openReport(reportRoot);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
    expect(stdoutWrites.some((m) => m.startsWith("Opening "))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("rejects if the report directory has no index.html", async () => {
    await expect(openReport(reportRoot)).rejects.toBeDefined();
  });
});
