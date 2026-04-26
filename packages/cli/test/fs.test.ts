import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  readJsonIfPresent,
  readTextIfPresent,
  writeJsonAtomic,
} from "../src/fs.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await realpath(await mkdtemp(path.join(tmpdir(), "doublcov-fs-")));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("readTextIfPresent", () => {
  it("returns undefined when path is undefined", async () => {
    expect(await readTextIfPresent(undefined)).toBeUndefined();
  });

  it("returns undefined when the file is missing", async () => {
    const missing = path.join(tempRoot, "does-not-exist.txt");
    expect(await readTextIfPresent(missing)).toBeUndefined();
  });

  it("rethrows non-ENOENT errors", async () => {
    const dir = path.join(tempRoot, "as-a-dir");
    await mkdir(dir, { recursive: true });
    await expect(readTextIfPresent(dir)).rejects.toMatchObject({
      code: expect.stringMatching(/EISDIR|EACCES/),
    });
  });
});

describe("readJsonIfPresent", () => {
  it("returns undefined when path is undefined", async () => {
    expect(await readJsonIfPresent(undefined)).toBeUndefined();
  });

  it("returns undefined when the file is missing", async () => {
    const missing = path.join(tempRoot, "missing.json");
    expect(await readJsonIfPresent(missing)).toBeUndefined();
  });

  it("rethrows non-ENOENT read errors", async () => {
    const dir = path.join(tempRoot, "as-dir");
    await mkdir(dir, { recursive: true });
    await expect(readJsonIfPresent(dir)).rejects.toMatchObject({
      code: expect.stringMatching(/EISDIR|EACCES/),
    });
  });

  it("includes the file path in the error when JSON is malformed", async () => {
    const bad = path.join(tempRoot, "bad.json");
    await writeFile(bad, "{ not json }", "utf8");
    await expect(readJsonIfPresent(bad)).rejects.toThrow(
      new RegExp(bad.replace(/[/\\]/g, "[/\\\\]")),
    );
  });
});

describe("writeJsonAtomic", () => {
  it("writes valid JSON and leaves no temp files behind", async () => {
    const target = path.join(tempRoot, "history.json");
    await writeJsonAtomic(target, { schemaVersion: 1, runs: [] });

    const written = JSON.parse(await readFile(target, "utf8"));
    expect(written).toEqual({ schemaVersion: 1, runs: [] });

    const remaining = await readdir(tempRoot);
    expect(remaining.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });

  it("cleans up the temp file when the destination is an existing directory", async () => {
    const target = path.join(tempRoot, "target");
    await mkdir(target, { recursive: true });
    await expect(
      writeJsonAtomic(target, { schemaVersion: 1, runs: [] }),
    ).rejects.toThrow();
    const remaining = await readdir(tempRoot);
    expect(remaining.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });

  it("never leaves the destination as a partial document under concurrent writes", async () => {
    const target = path.join(tempRoot, "history.json");
    const writers = Array.from({ length: 12 }, (_, index) =>
      writeJsonAtomic(target, {
        schemaVersion: 1,
        runs: [{ id: `r-${index}` }],
      }),
    );
    await Promise.all(writers);

    const text = await readFile(target, "utf8");
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.runs)).toBe(true);

    const remaining = await readdir(tempRoot);
    expect(remaining.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });
});
