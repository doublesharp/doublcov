import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { serveReport } from "../src/server.js";

let tempRoot: string;
let reportRoot: string;

beforeEach(async () => {
  process.env.DOUBLCOV_DISABLE_BROWSER_OPEN = "1";
  tempRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "doublcov-server-suite-")),
  );
  reportRoot = path.join(tempRoot, "report");
  await mkdir(reportRoot, { recursive: true });
  await writeFile(
    path.join(reportRoot, "index.html"),
    "<html><body>hi</body></html>",
    "utf8",
  );
});

afterEach(async () => {
  delete process.env.DOUBLCOV_DISABLE_BROWSER_OPEN;
  await rm(tempRoot, { recursive: true, force: true });
});

describe("serveReport lifecycle", () => {
  it("self-terminates when the deadline elapses", async () => {
    const stdoutWrites: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(String(chunk));
        return true;
      });
    try {
      await serveReport(reportRoot, { timeoutMs: 100, open: false });
    } finally {
      spy.mockRestore();
    }

    expect(stdoutWrites.some((w) => w.includes("Stopping report server"))).toBe(
      true,
    );
  }, 5_000);

  it("polls the deadline across multiple 1-second intervals", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const start = Date.now();
    try {
      await serveReport(reportRoot, { timeoutMs: 1_300, open: false });
    } finally {
      stdoutSpy.mockRestore();
    }

    expect(Date.now() - start).toBeGreaterThanOrEqual(1_200);
  }, 6_000);

  it("streams an SSE status event and a shutdown event when the server stops", async () => {
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

    await new Promise((resolve) => setTimeout(resolve, 50));
    const printed = (
      stdoutWrites.find((m) => m.startsWith("URL:")) ?? ""
    ).trim();
    const url = printed.replace(/^URL:\s*/, "");
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

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
    expect(events.body).toMatch(/event: status\ndata: \{[^}]+\}\n\n/);
    expect(events.body).toMatch(/event: shutdown\ndata: \{[^}]+\}\n\n/);
  }, 10_000);

  it("rejects when the index.html is missing", async () => {
    await rm(path.join(reportRoot, "index.html"));
    await expect(
      serveReport(reportRoot, { timeoutMs: 100, open: false }),
    ).rejects.toBeDefined();
  });

  it("throws a clear error when the bound address is a unix socket", async () => {
    await writeFile(
      path.join(reportRoot, "index.html"),
      "<html></html>",
      "utf8",
    );
    const original = http.Server.prototype.address;
    http.Server.prototype.address = function (this: http.Server) {
      const real = original.call(this);
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
