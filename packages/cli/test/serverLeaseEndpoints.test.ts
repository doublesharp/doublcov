import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { serveRequest } from "../src/server.js";

let tempRoot: string;
let reportRoot: string;

beforeEach(async () => {
  tempRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "doublcov-server-suite-")),
  );
  reportRoot = path.join(tempRoot, "report");
  await mkdir(reportRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
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
