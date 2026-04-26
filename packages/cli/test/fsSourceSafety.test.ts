import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fsPromises } from "node:fs";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSourceFiles } from "../src/fs.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await realpath(await mkdtemp(path.join(tmpdir(), "doublcov-fs-")));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("readSourceFiles root and symlink safety", () => {
  it("does not traverse into symlinked cycles", async () => {
    const srcDir = path.join(tempRoot, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "real.ts"), "real\n", "utf8");
    await symlink(srcDir, path.join(srcDir, "loop"));

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: [".ts"],
    });

    expect(files.map((file) => file.path)).toContain("src/real.ts");
  });

  it("does not follow a symlinked directory that resolves outside the project root", async () => {
    const srcDir = path.join(tempRoot, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "real.ts"), "inside\n", "utf8");

    const outsideRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-outside-")),
    );
    try {
      await writeFile(path.join(outsideRoot, "secret.ts"), "leak\n", "utf8");
      await symlink(outsideRoot, path.join(srcDir, "external"));

      const files = await readSourceFiles(["src"], {
        root: tempRoot,
        extensions: [".ts"],
      });
      const paths = files.map((file) => file.path);
      expect(paths).toContain("src/real.ts");
      expect(paths.some((p) => p.includes("secret.ts"))).toBe(false);
      expect(files.every((file) => !file.content.includes("leak"))).toBe(true);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("does not follow a symlinked source file that resolves outside the project root", async () => {
    const srcDir = path.join(tempRoot, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "real.ts"), "inside\n", "utf8");

    const outsideRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-outside-file-")),
    );
    try {
      const outsideFile = path.join(outsideRoot, "secret.ts");
      await writeFile(outsideFile, "leak\n", "utf8");
      await symlink(outsideFile, path.join(srcDir, "secret.ts"));

      const files = await readSourceFiles(["src"], {
        root: tempRoot,
        extensions: [".ts"],
      });
      expect(files.map((file) => file.path)).toEqual(["src/real.ts"]);
      expect(files.every((file) => !file.content.includes("leak"))).toBe(true);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("does not include LCOV-discovered include paths outside the root", async () => {
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
      expect(files).toEqual([]);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("includes an outside file when the user explicitly passes it as a source", async () => {
    const otherRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-explicit-other-")),
    );
    try {
      await writeFile(path.join(otherRoot, "outside.ts"), "x\n", "utf8");
      const files = await readSourceFiles(
        [path.join(otherRoot, "outside.ts")],
        {
          root: tempRoot,
          extensions: [".ts"],
        },
      );
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe(
        path.join(otherRoot, "outside.ts").replaceAll(path.sep, "/"),
      );
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("falls back gracefully when the project root itself does not exist", async () => {
    const ghostRoot = path.join(tempRoot, "does", "not", "exist");
    const files = await readSourceFiles(["src"], {
      root: ghostRoot,
      extensions: [".ts"],
    });
    expect(files).toEqual([]);
  });

  it("rethrows non-ENOENT/ELOOP stat errors", async () => {
    const longSegment = "x".repeat(300);
    const veryLong = path.join(tempRoot, "src", longSegment);
    await mkdir(path.join(tempRoot, "src"), { recursive: true });

    await expect(
      readSourceFiles([veryLong], {
        root: tempRoot,
        extensions: [".ts"],
      }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/ENAMETOOLONG|EILSEQ|EINVAL/),
    });
  });

  it("allows a child symlink whose realpath equals the project root", async () => {
    const srcDir = path.join(tempRoot, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "real.ts"), "ok\n", "utf8");
    await symlink(tempRoot, path.join(srcDir, "back"));

    const files = await readSourceFiles(["src"], {
      root: tempRoot,
      extensions: [".ts"],
    });

    expect(files.map((file) => file.path)).toContain("src/real.ts");
  });

  it("falls back to the input path when fs.realpath throws on a directory entry", async () => {
    const srcDir = path.join(tempRoot, "src");
    const childDir = path.join(srcDir, "child");
    await mkdir(childDir, { recursive: true });
    await writeFile(path.join(childDir, "leaf.ts"), "x\n", "utf8");

    const realRealpath = fsPromises.realpath.bind(fsPromises);
    const spy = vi
      .spyOn(fsPromises, "realpath")
      .mockImplementation(async (target, options) => {
        const targetStr = typeof target === "string" ? target : String(target);
        if (targetStr === childDir) {
          const err = new Error("simulated EACCES") as NodeJS.ErrnoException;
          err.code = "EACCES";
          throw err;
        }
        return realRealpath(target, options);
      });
    try {
      const files = await readSourceFiles(["src"], {
        root: tempRoot,
        extensions: [".ts"],
      });
      expect(files.map((file) => file.path)).toContain("src/child/leaf.ts");
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to the input path when fs.realpath throws on a file entry", async () => {
    const srcDir = path.join(tempRoot, "src");
    await mkdir(srcDir, { recursive: true });
    const target = path.join(srcDir, "leaf.ts");
    await writeFile(target, "x\n", "utf8");

    const realRealpath = fsPromises.realpath.bind(fsPromises);
    const spy = vi
      .spyOn(fsPromises, "realpath")
      .mockImplementation(async (input, options) => {
        const inputStr = typeof input === "string" ? input : String(input);
        if (inputStr === target) {
          const err = new Error("simulated EACCES") as NodeJS.ErrnoException;
          err.code = "EACCES";
          throw err;
        }
        return realRealpath(input, options);
      });
    try {
      const files = await readSourceFiles(["src"], {
        root: tempRoot,
        extensions: [".ts"],
      });
      expect(files.map((file) => file.path)).toContain("src/leaf.ts");
    } finally {
      spy.mockRestore();
    }
  });

  it("treats a root that is itself a symlink as the canonical root via realpath", async () => {
    const innerRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-real-")),
    );
    try {
      await mkdir(path.join(innerRoot, "src"), { recursive: true });
      await writeFile(path.join(innerRoot, "src", "real.ts"), "ok\n", "utf8");

      const linkedRoot = path.join(tempRoot, "linked-root");
      await symlink(innerRoot, linkedRoot);

      const files = await readSourceFiles(["src"], {
        root: linkedRoot,
        extensions: [".ts"],
      });
      expect(files.map((file) => file.path)).toContain("src/real.ts");
    } finally {
      await rm(innerRoot, { recursive: true, force: true });
    }
  });
});
