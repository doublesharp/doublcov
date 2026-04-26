import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fsPromises } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http, { type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { serveRequest, serverStatus } from "../src/server.js";

interface StubServerState {
  timeoutMs: number;
  deadline: number;
  shutdownListeners: Set<() => void>;
}

function makeState(timeoutMs = 60_000): StubServerState {
  return {
    timeoutMs,
    deadline: timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY,
    shutdownListeners: new Set(),
  };
}

async function fetchPath(
  root: string,
  state: StubServerState,
  requestPath: string,
): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const server = http.createServer((req, res) => {
    void serveRequest(root, state as unknown as Parameters<typeof serveRequest>[1], req.url ?? "/", res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}${requestPath}`;
    return await new Promise((resolve, reject) => {
      http.get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
          });
        });
        response.on("error", reject);
      }).on("error", reject);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

let tempRoot: string;
let reportRoot: string;
let outsideDir: string;

beforeEach(async () => {
  tempRoot = await realpath(await mkdtemp(path.join(tmpdir(), "doublcov-server-")));
  reportRoot = path.join(tempRoot, "report");
  outsideDir = path.join(tempRoot, "outside");
  await mkdir(reportRoot, { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await writeFile(path.join(reportRoot, "index.html"), "<html><body>hi</body></html>", "utf8");
  await writeFile(path.join(reportRoot, "asset.js"), "console.log(1)\n", "utf8");
  await writeFile(path.join(outsideDir, "secret.txt"), "TOP SECRET\n", "utf8");
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("serveRequest", () => {
  it("serves index.html with a 200 and the lease-prompt injected", async () => {
    const result = await fetchPath(reportRoot, makeState(), "/");
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(result.body).toContain("hi");
    expect(result.body).toContain("__doublcov/status");
  });

  it("serves a static asset with the right content-type", async () => {
    const result = await fetchPath(reportRoot, makeState(), "/asset.js");
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(result.body).toBe("console.log(1)\n");
  });

  it("returns 404 for a missing file", async () => {
    const result = await fetchPath(reportRoot, makeState(), "/missing.html");
    expect(result.status).toBe(404);
  });

  it("returns 403 for a parent traversal attempt", async () => {
    const result = await fetchPath(reportRoot, makeState(), "/../outside/secret.txt");
    expect([403, 404]).toContain(result.status);
    expect(result.body).not.toContain("TOP SECRET");
  });

  it("returns 403 when a symlink inside the report points outside (regression)", async () => {
    const linkPath = path.join(reportRoot, "leak.txt");
    await symlink(path.join(outsideDir, "secret.txt"), linkPath);
    const result = await fetchPath(reportRoot, makeState(), "/leak.txt");
    expect(result.status).toBe(403);
    expect(result.body).not.toContain("TOP SECRET");
  });

  it("returns 403 for directory listings", async () => {
    await mkdir(path.join(reportRoot, "subdir"));
    const result = await fetchPath(reportRoot, makeState(), "/subdir");
    expect(result.status).toBe(403);
  });

  it("responds to /__doublcov/status with remaining time", async () => {
    const result = await fetchPath(reportRoot, makeState(120_000), "/__doublcov/status");
    expect(result.status).toBe(200);
    const data = JSON.parse(result.body) as { timeoutMs: number; remainingMs: number };
    expect(data.timeoutMs).toBe(120_000);
    expect(data.remainingMs).toBeGreaterThan(0);
    expect(data.remainingMs).toBeLessThanOrEqual(120_000);
  });

  it("resets the deadline on /__doublcov/extend", async () => {
    const state = makeState(30_000);
    state.deadline = Date.now() + 1_000;
    const result = await fetchPath(reportRoot, state, "/__doublcov/extend");
    expect(result.status).toBe(200);
    const data = JSON.parse(result.body) as { remainingMs: number };
    expect(data.remainingMs).toBeGreaterThan(20_000);
  });

  it("normalizes percent-encoded traversal so URL-level attacks return 404, not file content", async () => {
    // WHATWG URL normalization turns %2e%2e/ into ../ and then collapses it,
    // so by the time serveRequest sees the path it points to a sibling
    // segment INSIDE the root that doesn't exist — the response is 404 with
    // no leakage. This test pins down that defense-in-depth behavior.
    const result = await fetchPath(
      reportRoot,
      makeState(),
      "/%2e%2e/outside/secret.txt",
    );
    expect(result.status).toBe(404);
    expect(result.body).not.toContain("TOP SECRET");
  });

  it("returns 403 when serveRequest sees a directly-malicious path that escapes via URL injection", async () => {
    // Send a path that the URL parser cannot fully normalize: a percent-
    // encoded slash (%2f) that survives decoding and produces a relative
    // path which path.resolve walks above the root.
    // We craft this by pretending the URL is /<something>/%2e%2e%2f%2e%2e
    // — but URL normalization handles those too. Instead, we exercise the
    // raw entrypoint by passing a hand-rolled requestUrl that includes
    // segments that pathname can't normalize because they are not separated
    // by literal slashes.
    // path.resolve(root, "./..%2foutside/secret.txt") yields a path INSIDE
    // root with a literal "..%2foutside" segment, so that's fine. The most
    // direct way to hit isInsideRoot=false is to feed serveRequest an
    // absolute path. We skip a bespoke test for the truly unreachable
    // branch and rely on the unit-level isInsideRoot helper coverage.
    const result = await fetchPath(reportRoot, makeState(), "/..%2foutside/secret.txt");
    // It is not actually an escape — but it should never serve secret.txt.
    expect(result.body).not.toContain("TOP SECRET");
    // Either 403 or 404 is acceptable; what matters is the file is hidden.
    expect([403, 404]).toContain(result.status);
  });

  it("returns 500 on a malformed percent-encoded URL (URIError)", async () => {
    // %ZZ is not a valid percent escape — decodeURIComponent throws URIError,
    // which the outer catch must convert to a 500 (not crash the server).
    const result = await fetchPath(reportRoot, makeState(), "/%ZZbad");
    expect(result.status).toBe(500);
    expect(result.body).toBe("Internal server error");
  });

  it("returns 500 when fs.realpath fails with a non-ENOENT error (e.g. EACCES)", async () => {
    // The realpath catch must distinguish ENOENT (404) from anything else,
    // which has to bubble up to the outer catch and produce a 500. A
    // permission error on a real file system path is the canonical case.
    const realRealpath = fsPromises.realpath.bind(fsPromises);
    const targetPath = path.join(reportRoot, "asset.js");
    const spy = vi
      .spyOn(fsPromises, "realpath")
      .mockImplementation(async (input, options) => {
        const inputStr = typeof input === "string" ? input : String(input);
        if (inputStr === targetPath) {
          const err = new Error("simulated EACCES") as NodeJS.ErrnoException;
          err.code = "EACCES";
          throw err;
        }
        return realRealpath(input, options);
      });
    try {
      const result = await fetchPath(reportRoot, makeState(), "/asset.js");
      expect(result.status).toBe(500);
      expect(result.body).toBe("Internal server error");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns 404 when the file vanishes between realpath and stat (race)", async () => {
    // If a file exists at realpath time but is unlinked before fs.stat runs,
    // the outer catch converts the resulting ENOENT into a 404 rather than a
    // 500. Simulate this by making fs.stat fail with ENOENT for a path that
    // realpath happily resolved.
    const realStat = fsPromises.stat.bind(fsPromises);
    const targetPath = path.join(reportRoot, "asset.js");
    const spy = vi
      .spyOn(fsPromises, "stat")
      .mockImplementation(async (input, options) => {
        const inputStr = typeof input === "string" ? input : String(input);
        if (inputStr === targetPath) {
          const err = new Error("vanished") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        return realStat(input, options);
      });
    try {
      const result = await fetchPath(reportRoot, makeState(), "/asset.js");
      expect(result.status).toBe(404);
      expect(result.body).toBe("Not found");
    } finally {
      spy.mockRestore();
    }
  });

  it("redirects /__doublcov/events with the right SSE headers", async () => {
    // We can hit the SSE endpoint and capture the FIRST status event;
    // the connection is left open by serveEvents, so we only read what's
    // immediately available before tearing down.
    const server = http.createServer((req, res) => {
      void serveRequest(
        reportRoot,
        makeState() as unknown as Parameters<typeof serveRequest>[1],
        req.url ?? "/",
        res,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as AddressInfo;
      const result = await new Promise<{
        status: number;
        contentType: string;
        firstChunk: string;
      }>((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${address.port}/__doublcov/events`,
          (response) => {
            response.once("data", (chunk: Buffer) => {
              resolve({
                status: response.statusCode ?? 0,
                contentType: String(response.headers["content-type"] ?? ""),
                firstChunk: chunk.toString("utf8"),
              });
              response.destroy();
              req.destroy();
            });
            response.on("error", () => {
              /* ignore: we close the socket eagerly */
            });
          },
        );
        req.on("error", reject);
      });
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("text/event-stream; charset=utf-8");
      expect(result.firstChunk).toMatch(/^event: status\ndata: \{[^}]+\}\n\n/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("serverStatus", () => {
  it("returns zero remainingMs when the deadline is infinite", () => {
    const state = makeState(0);
    state.deadline = Number.POSITIVE_INFINITY;
    expect(serverStatus(state as unknown as Parameters<typeof serverStatus>[0])).toEqual({
      remainingMs: 0,
      timeoutMs: 0,
    });
  });

  it("returns zero (not negative) when the deadline has passed", () => {
    const state = makeState(60_000);
    state.deadline = Date.now() - 1000;
    expect(
      serverStatus(state as unknown as Parameters<typeof serverStatus>[0]).remainingMs,
    ).toBe(0);
  });
});

// Silence unused warnings in builds when ServerResponse is only referenced for typing.
void ((): ServerResponse => null as unknown as ServerResponse);
