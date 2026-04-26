import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerLanguageDefinition } from "@0xdoublesharp/doublcov-core";
import { readSourceFiles } from "../src/fs.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await realpath(await mkdtemp(path.join(tmpdir(), "doublcov-fs-")));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("readSourceFiles discovery", () => {
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

    expect(files.map((file) => file.path)).toEqual(
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

    expect(files.map((file) => file.path)).toEqual(["src/real.ts"]);
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

  it("normalizes extensions with no leading dot and mixed case", async () => {
    await mkdir(path.join(tempRoot, "src"), { recursive: true });
    await writeFile(path.join(tempRoot, "src", "a.TS"), "a\n", "utf8");
    await writeFile(path.join(tempRoot, "src", "b.ts"), "b\n", "utf8");
    await writeFile(path.join(tempRoot, "src", "c.js"), "c\n", "utf8");

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: ["ts", ".TS"],
    });

    expect(files.map((file) => file.path).sort()).toEqual([
      "src/a.TS",
      "src/b.ts",
    ]);
  });

  it("ignores empty extension filters while matching valid extensions", async () => {
    await mkdir(path.join(tempRoot, "src"), { recursive: true });
    await writeFile(path.join(tempRoot, "src", "f.ts"), "x\n", "utf8");

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: ["", "   ", ".ts"],
    });

    expect(files.map((file) => file.path)).toEqual(["src/f.ts"]);
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

  it("includes a file when the user explicitly passes node_modules as a source root", async () => {
    const explicit = path.join(tempRoot, "node_modules");
    await mkdir(explicit, { recursive: true });
    await writeFile(path.join(explicit, "vendored.ts"), "v\n", "utf8");

    const files = await readSourceFiles(["node_modules"], {
      root: tempRoot,
      extensions: [".ts"],
    });

    expect(files.map((file) => file.path)).toEqual([
      "node_modules/vendored.ts",
    ]);
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

  it("returns an empty list when the inputs array is empty", async () => {
    const files = await readSourceFiles([], {
      root: tempRoot,
      extensions: [".ts"],
    });

    expect(files).toEqual([]);
  });
});
