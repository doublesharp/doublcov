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
import { registerLanguageDefinition } from "@0xdoublesharp/doublcov-core";
import { readSourceFiles, writeJsonAtomic } from "../src/fs.js";

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

describe("writeJsonAtomic", () => {
  it("writes valid JSON and leaves no temp files behind", async () => {
    const target = path.join(tempRoot, "history.json");
    await writeJsonAtomic(target, { schemaVersion: 1, runs: [] });

    const written = JSON.parse(await readFile(target, "utf8"));
    expect(written).toEqual({ schemaVersion: 1, runs: [] });

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
