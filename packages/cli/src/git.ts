import { execFileSync } from "node:child_process";

export interface GitMetadata {
  commit?: string;
  branch?: string;
}

export function readGitMetadata(cwd = process.cwd()): GitMetadata {
  const commit = runGit(["rev-parse", "HEAD"], cwd);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return {
    ...(commit ? { commit } : {}),
    ...(branch ? { branch } : {}),
  };
}

function runGit(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}
