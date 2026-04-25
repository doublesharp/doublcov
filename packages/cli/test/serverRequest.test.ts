import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
