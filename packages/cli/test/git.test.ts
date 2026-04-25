import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readGitMetadata } from "../src/git.js";

function gitInit(cwd: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test User"], {
    cwd,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "commit.gpgsign", "false"], {
    cwd,
    stdio: "ignore",
  });
}

function gitCommit(cwd: string, file = "README.md", msg = "init"): string {
  writeFileSync(join(cwd, file), "hello\n");
  execFileSync("git", ["add", file], { cwd, stdio: "ignore" });
  execFileSync("git", ["commit", "-q", "-m", msg], { cwd, stdio: "ignore" });
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  }).trim();
}

describe("readGitMetadata", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doublcov-git-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty object when run in a non-git directory", () => {
    expect(readGitMetadata(tempDir)).toEqual({});
  });

  it("returns empty object in a fresh repo with no commits", () => {
    gitInit(tempDir);
    // No commits yet -- rev-parse HEAD fails.
    expect(readGitMetadata(tempDir)).toEqual({});
  });

  it("returns commit and branch in a normal repo", () => {
    gitInit(tempDir);
    const sha = gitCommit(tempDir);
    const meta = readGitMetadata(tempDir);
    expect(meta.commit).toBe(sha);
    expect(meta.branch).toBe("main");
  });

  it("trims trailing whitespace from git output", () => {
    gitInit(tempDir);
    const sha = gitCommit(tempDir);
    const meta = readGitMetadata(tempDir);
    expect(meta.commit).not.toMatch(/\s/);
    expect(meta.branch).not.toMatch(/\s/);
    expect(meta.commit).toBe(sha);
  });

  it("omits branch (treats as detached) when HEAD is detached", () => {
    gitInit(tempDir);
    const sha = gitCommit(tempDir);
    // Detach HEAD by checking out the sha directly.
    execFileSync("git", ["checkout", "-q", "--detach", sha], {
      cwd: tempDir,
      stdio: "ignore",
    });
    const meta = readGitMetadata(tempDir);
    expect(meta.commit).toBe(sha);
    // Bug fix: must not surface the literal string "HEAD" as a branch.
    expect(meta.branch).toBeUndefined();
  });

  it("works with a path containing spaces", () => {
    const spaced = mkdtempSync(join(tmpdir(), "doublcov has spaces "));
    try {
      gitInit(spaced);
      const sha = gitCommit(spaced);
      const meta = readGitMetadata(spaced);
      expect(meta.commit).toBe(sha);
      expect(meta.branch).toBe("main");
    } finally {
      rmSync(spaced, { recursive: true, force: true });
    }
  });

  it("does not throw when given a path that does not exist", () => {
    const missing = join(tempDir, "does", "not", "exist");
    expect(() => readGitMetadata(missing)).not.toThrow();
    expect(readGitMetadata(missing)).toEqual({});
  });
});
