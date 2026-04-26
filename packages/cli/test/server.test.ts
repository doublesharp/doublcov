import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fsPromises } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import {
  browserOpenCommand,
  detectReportMode,
  launchBrowser,
  openReport,
  serveRequest,
  serveReport,
} from "../src/server.js";

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

  it("does not blow up on a large index.html (~1MB)", async () => {
    const indexPath = path.join(reportRoot, "index.html");
    // Build a ~1MB body without the marker so we hit "static".
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
    // The outer beforeEach sets DOUBLCOV_DISABLE_BROWSER_OPEN=1 to keep the
    // serveReport tests from spawning a browser; we must clear it here so
    // launchBrowser actually tries to spawn the (deliberately bad) binary.
    const previous = process.env.DOUBLCOV_DISABLE_BROWSER_OPEN;
    delete process.env.DOUBLCOV_DISABLE_BROWSER_OPEN;
    try {
      // ENOENT: the spawned binary does not exist on any reasonable PATH.
      launchBrowser("file:///tmp/dummy", {
        command: "doublcov-nonexistent-browser-binary",
        args: ["file:///tmp/dummy"],
      });
      // Wait one microtask + a little real time for the child error event.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const matched = writes.find((w) =>
        w.includes("Could not open browser automatically"),
      );
      expect(matched, `stderr writes: ${JSON.stringify(writes)}`).toBeDefined();
    } finally {
      spy.mockRestore();
      // Restore original write reference for safety.
      process.stderr.write = original;
      if (previous !== undefined) {
        process.env.DOUBLCOV_DISABLE_BROWSER_OPEN = previous;
      }
    }
  });
});

describe("serveReport lifecycle", () => {
  beforeEach(async () => {
    await writeFile(
      path.join(reportRoot, "index.html"),
      "<html><body>hi</body></html>",
      "utf8",
    );
  });

  it("self-terminates when the deadline elapses", async () => {
    const stdoutWrites: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    try {
      // 100ms timeout — should self-shutdown well within the test timeout.
      await serveReport(reportRoot, { timeoutMs: 100, open: false });
    } finally {
      spy.mockRestore();
    }
    const announced = stdoutWrites.some((w) =>
      w.includes("Stopping report server"),
    );
    expect(announced).toBe(true);
  }, 5_000);

  it("polls the deadline across multiple 1-second intervals", async () => {
    // timeoutMs > 1000 means the first checkDeadline timer fires after 1000ms
    // and finds time still remaining, so it must re-arm itself (the recursive
    // setTimeout branch at the bottom of waitForShutdown).
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const start = Date.now();
    try {
      await serveReport(reportRoot, { timeoutMs: 1_300, open: false });
    } finally {
      stdoutSpy.mockRestore();
    }
    const elapsed = Date.now() - start;
    // We must have actually waited at least ~1.3s — proves the recursion ran.
    expect(elapsed).toBeGreaterThanOrEqual(1_200);
  }, 6_000);

  it("streams an SSE status event and a shutdown event when the server stops", async () => {
    // Start a server with a short deadline to keep the test fast.
    const stdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    let done!: () => void;
    const finished = new Promise<void>((resolve) => {
      done = resolve;
    });

    const servePromise = (async () => {
      try {
        await serveReport(reportRoot, { timeoutMs: 200, open: false });
      } finally {
        done();
      }
    })();

    // Wait briefly for the URL to be printed.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const printed = (
      stdoutWrites.find((m) => m.startsWith("URL:")) ?? ""
    ).trim();
    const url = printed.replace(/^URL:\s*/, "");
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    // Open the SSE endpoint and capture events.
    const events = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        http
          .get(`${url}__doublcov/events`, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (c: Buffer) => chunks.push(c));
            response.on("end", () => {
              resolve({
                status: response.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
            response.on("error", reject);
          })
          .on("error", reject);
      },
    );

    await Promise.race([
      finished,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("server did not stop")), 5_000),
      ),
    ]);
    await servePromise;
    stdoutSpy.mockRestore();

    expect(events.status).toBe(200);
    // The status event should arrive first.
    expect(events.body).toMatch(/event: status\ndata: \{[^}]+\}\n\n/);
    // And then a shutdown event when the server expired.
    expect(events.body).toMatch(/event: shutdown\ndata: \{[^}]+\}\n\n/);
  }, 10_000);

  it("rejects when the index.html is missing", async () => {
    await rm(path.join(reportRoot, "index.html"));
    await expect(
      serveReport(reportRoot, { timeoutMs: 100, open: false }),
    ).rejects.toBeDefined();
  });

  it("throws a clear error when the bound address is a unix socket (not AddressInfo)", async () => {
    // server.address() returns a string when the server is bound to a UNIX
    // pipe rather than a TCP port. serveReport assumes TCP, so it must fail
    // loudly rather than silently emit a malformed URL. We patch
    // http.Server.prototype.address so it returns a string after listen()
    // has bound the socket — listen()'s callback still fires normally.
    await writeFile(
      path.join(reportRoot, "index.html"),
      "<html></html>",
      "utf8",
    );
    const original = http.Server.prototype.address;
    http.Server.prototype.address = function (this: http.Server) {
      const real = original.call(this);
      // Only swap once we are actually bound (real returns AddressInfo).
      return typeof real === "object" && real !== null
        ? "/tmp/fake.sock"
        : real;
    } as typeof http.Server.prototype.address;
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await expect(
        serveReport(reportRoot, { timeoutMs: 100, open: false }),
      ).rejects.toThrow(/local server address/);
    } finally {
      http.Server.prototype.address = original;
      stdoutSpy.mockRestore();
    }
  });

  it("does not print a countdown when the server timeout is disabled", async () => {
    const stdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    const stopTimer = setTimeout(() => {
      process.emit("SIGINT");
    }, 100);
    try {
      await serveReport(reportRoot, { timeoutMs: 0, open: false, port: 0 });
    } finally {
      clearTimeout(stopTimer);
      stdoutSpy.mockRestore();
    }
    expect(stdoutWrites.join("")).not.toContain("Server will stop after");
  }, 5_000);

  it("uses the default timeout when no timeout is passed", async () => {
    const stdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    const stopTimer = setTimeout(() => {
      process.emit("SIGTERM");
    }, 100);
    try {
      await serveReport(reportRoot, { open: false, port: 0 });
    } finally {
      clearTimeout(stopTimer);
      stdoutSpy.mockRestore();
    }
    expect(stdoutWrites.join("")).toContain("Server will stop after 30m");
  }, 5_000);
});

describe("openReport", () => {
  it("dispatches static reports through serveReport with a real HTTP listener", async () => {
    // For mode === "static", openReport should spin up a server we can hit.
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

    const printed = stdoutWrites.some((m) => m.startsWith("Serving "));
    expect(printed).toBe(true);
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
    const opening = stdoutWrites.some((m) => m.startsWith("Opening "));
    expect(opening).toBe(true);
    // Let the spawned child a moment to error out (the system "open" /
    // "xdg-open" may or may not exist; either way openReport must not throw).
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("rejects if the report directory has no index.html", async () => {
    await expect(openReport(reportRoot)).rejects.toBeDefined();
  });
});

describe("serveRequest lease endpoints", () => {
  it("keeps an unlimited server unlimited when /__doublcov/extend is requested", async () => {
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
      const address = server.address() as import("node:net").AddressInfo;
      const result = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          http
            .get(
              `http://127.0.0.1:${address.port}/__doublcov/extend`,
              (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
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
      expect(JSON.parse(result.body)).toEqual({
        timeoutMs: 0,
        remainingMs: 0,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
