import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerLanguageDefinition } from "@0xdoublesharp/doublcov-core";
import {
  readJsonIfPresent,
  readSourceFiles,
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

describe("readSourceFiles", () => {
  it("includes source files inside a nested directory whose name happens to match an ignored-at-root entry", async () => {
    await mkdir(path.join(tempRoot, "src", "coverage"), { recursive: true });
    await writeFile(
      path.join(tempRoot, "src", "coverage", "helpers.ts"),
      "export const x = 1;\n",
      "utf8",
    );
    await writeFile(
      path.join(tempRoot, "src", "index.ts"),
      "export const y = 2;\n",
      "utf8",
    );

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: [".ts"],
    });
    const paths = files.map((file) => file.path);

    expect(paths).toEqual(
      expect.arrayContaining(["src/coverage/helpers.ts", "src/index.ts"]),
    );
  });

  it("still skips node_modules at any depth", async () => {
    await mkdir(path.join(tempRoot, "src", "node_modules", "junk"), {
      recursive: true,
    });
    await writeFile(
      path.join(tempRoot, "src", "node_modules", "junk", "garbage.ts"),
      "garbage\n",
      "utf8",
    );
    await writeFile(path.join(tempRoot, "src", "real.ts"), "real\n", "utf8");

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: [".ts"],
    });
    const paths = files.map((file) => file.path);

    expect(paths).toEqual(["src/real.ts"]);
  });

  it("skips a top-level coverage directory but not a nested src/coverage", async () => {
    await mkdir(path.join(tempRoot, "coverage"), { recursive: true });
    await writeFile(
      path.join(tempRoot, "coverage", "report.ts"),
      "irrelevant\n",
      "utf8",
    );
    await mkdir(path.join(tempRoot, "src", "coverage"), { recursive: true });
    await writeFile(
      path.join(tempRoot, "src", "coverage", "helpers.ts"),
      "ok\n",
      "utf8",
    );

    const files = await readSourceFiles([".", "src"], {
      root: tempRoot,
      extensions: [".ts"],
    });
    const paths = files.map((file) => file.path);

    expect(paths).toContain("src/coverage/helpers.ts");
    expect(paths).not.toContain("coverage/report.ts");
  });

  it("uses language extensions registered at read time", async () => {
    registerLanguageDefinition({
      id: "fixture-source",
      label: "Fixture Source",
      extensions: [".fixture-source"],
    });
    await mkdir(path.join(tempRoot, "src"), { recursive: true });
    await writeFile(
      path.join(tempRoot, "src", "main.fixture-source"),
      "ok\n",
      "utf8",
    );

    const files = await readSourceFiles(["src"], { root: tempRoot });

    expect(files.map((file) => file.path)).toContain("src/main.fixture-source");
  });
});

describe("readTextIfPresent", () => {
  it("returns undefined when path is undefined", async () => {
    expect(await readTextIfPresent(undefined)).toBeUndefined();
  });

  it("returns undefined when the file is missing", async () => {
    const missing = path.join(tempRoot, "does-not-exist.txt");
    expect(await readTextIfPresent(missing)).toBeUndefined();
  });

  it("rethrows non-ENOENT errors (e.g. EISDIR for directories)", async () => {
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

  it("includes the file path in the error when JSON is malformed", async () => {
    const bad = path.join(tempRoot, "bad.json");
    await writeFile(bad, "{ not json }", "utf8");
    await expect(readJsonIfPresent(bad)).rejects.toThrow(
      new RegExp(bad.replace(/[/\\]/g, "[/\\\\]")),
    );
  });
});

describe("readSourceFiles", () => {
  it("normalizes extensions with no leading dot and mixed case", async () => {
    await mkdir(path.join(tempRoot, "src"), { recursive: true });
    await writeFile(path.join(tempRoot, "src", "a.TS"), "a\n", "utf8");
    await writeFile(path.join(tempRoot, "src", "b.ts"), "b\n", "utf8");
    await writeFile(path.join(tempRoot, "src", "c.js"), "c\n", "utf8");

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: ["ts", ".TS"],
    });
    const paths = files.map((file) => file.path).sort();
    expect(paths).toEqual(["src/a.TS", "src/b.ts"]);
  });

  it("ignores includePaths that do not exist", async () => {
    await mkdir(path.join(tempRoot, "src"), { recursive: true });
    await writeFile(path.join(tempRoot, "src", "real.ts"), "real\n", "utf8");

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: [".ts"],
      includePaths: ["src/missing.ts", "another/missing.ts"],
    });
    expect(files.map((file) => file.path)).toEqual(["src/real.ts"]);
  });

  it("does not traverse into symlinked cycles", async () => {
    const srcDir = path.join(tempRoot, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "real.ts"), "real\n", "utf8");
    // Create a symlink that points back at its parent — would loop forever
    // if collectFiles followed symlinked directories without protection.
    await symlink(srcDir, path.join(srcDir, "loop"));

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: [".ts"],
    });
    expect(files.map((file) => file.path)).toContain("src/real.ts");
  });

  it("falls back to absolute path when a file resolves outside the root", async () => {
    const otherRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-other-")),
    );
    try {
      await writeFile(path.join(otherRoot, "outside.ts"), "x\n", "utf8");
      const files = await readSourceFiles([], {
        root: tempRoot,
        extensions: [".ts"],
        includePaths: [path.join(otherRoot, "outside.ts")],
      });
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe(
        path
          .join(otherRoot, "outside.ts")
          .replaceAll(path.sep, "/"),
      );
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("includes a file when the user explicitly passes node_modules as a source root", async () => {
    const explicit = path.join(tempRoot, "node_modules");
    await mkdir(explicit, { recursive: true });
    await writeFile(path.join(explicit, "vendored.ts"), "v\n", "utf8");

    const files = await readSourceFiles(["node_modules"], {
      root: tempRoot,
      extensions: [".ts"],
    });
    expect(files.map((file) => file.path)).toEqual(["node_modules/vendored.ts"]);
  });

  it("includes a file when the user explicitly passes coverage as a source root", async () => {
    const explicit = path.join(tempRoot, "coverage");
    await mkdir(explicit, { recursive: true });
    await writeFile(path.join(explicit, "report.ts"), "r\n", "utf8");

    const files = await readSourceFiles(["coverage"], {
      root: tempRoot,
      extensions: [".ts"],
    });
    expect(files.map((file) => file.path)).toEqual(["coverage/report.ts"]);
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
    // The actual target is a path occupied by a directory, so the rename
    // will fail with EISDIR/EPERM. The error must propagate AND the .tmp
    // file must not be left lingering.
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
