import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserOpenCommand, isLivePreviewRequest, resolveServedPath } from "../src/server.js";

let tempRoot: string;
let reportDir: string;
let outsideDir: string;

beforeEach(async () => {
  tempRoot = await realpath(await mkdtemp(path.join(tmpdir(), "doublcov-server-")));
  reportDir = path.join(tempRoot, "report");
  outsideDir = path.join(tempRoot, "outside");
  await mkdir(reportDir);
  await mkdir(outsideDir);
  await writeFile(path.join(reportDir, "index.html"), "<html>ok</html>", "utf8");
  await writeFile(path.join(reportDir, "data.txt"), "hello", "utf8");
  await writeFile(path.join(outsideDir, "secret.txt"), "leaked", "utf8");
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("resolveServedPath", () => {
  it("serves files inside the report root", async () => {
    const result = await resolveServedPath(reportDir, "/index.html");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.realPath).toBe(path.join(reportDir, "index.html"));
  });

  it("returns not-found for missing files", async () => {
    const result = await resolveServedPath(reportDir, "/nope.html");
    expect(result.kind).toBe("not-found");
  });

  it("forbids requests that resolve via symlink outside the root", async () => {
    await symlink(path.join(outsideDir, "secret.txt"), path.join(reportDir, "leak.txt"));
    const result = await resolveServedPath(reportDir, "/leak.txt");
    expect(result.kind).toBe("forbidden");
  });

  it("forbids ../ traversal that points outside the root", async () => {
    const result = await resolveServedPath(reportDir, "/../outside/secret.txt");
    // path.resolve normalizes ../ before realpath, so this lands outside the root.
    expect(result.kind).toBe("forbidden");
  });

  it("forbids sibling directories with the same path prefix", async () => {
    const sibling = path.join(tempRoot, "report-other");
    await mkdir(sibling);
    await writeFile(path.join(sibling, "secret.txt"), "same prefix", "utf8");

    const result = await resolveServedPath(reportDir, "/../report-other/secret.txt");
    expect(result.kind).toBe("forbidden");
  });

  it("returns not-found for directories rather than serving them", async () => {
    await mkdir(path.join(reportDir, "subdir"));
    const result = await resolveServedPath(reportDir, "/subdir");
    expect(result.kind).toBe("not-found");
  });
});

describe("browserOpenCommand", () => {
  it("uses open on macOS", () => {
    expect(browserOpenCommand("http://127.0.0.1:60732", "darwin")).toEqual({
      command: "open",
      args: ["http://127.0.0.1:60732"]
    });
  });

  it("uses cmd start on Windows", () => {
    expect(browserOpenCommand("http://127.0.0.1:60732", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "http://127.0.0.1:60732"]
    });
  });

  it("uses xdg-open on Linux and other platforms", () => {
    expect(browserOpenCommand("http://127.0.0.1:60732", "linux")).toEqual({
      command: "xdg-open",
      args: ["http://127.0.0.1:60732"]
    });
  });
});

describe("isLivePreviewRequest", () => {
  it("matches the live preview heartbeat endpoint", () => {
    expect(isLivePreviewRequest("/__doublcov/live")).toBe(true);
    expect(isLivePreviewRequest("/__doublcov/live?ts=1")).toBe(true);
  });

  it("does not match regular report files", () => {
    expect(isLivePreviewRequest("/index.html")).toBe(false);
    expect(isLivePreviewRequest("/data/report.json")).toBe(false);
    expect(isLivePreviewRequest(undefined)).toBe(false);
  });
});
