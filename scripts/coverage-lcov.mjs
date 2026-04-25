#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const coverageRoot = path.join(repoRoot, "coverage");

/**
 * @typedef {object} CoveragePackage
 * @property {string} filter
 * @property {string} packageDir
 * @property {string} reportDir
 * @property {string} vitestReportDir
 */

/** @type {CoveragePackage[]} */
const packages = [
  {
    filter: "@0xdoublesharp/doublcov-core",
    packageDir: "packages/coverage-core",
    reportDir: "coverage/core",
    vitestReportDir: "../../coverage/core",
  },
  {
    filter: "@0xdoublesharp/doublcov",
    packageDir: "packages/cli",
    reportDir: "coverage/cli",
    vitestReportDir: "../../coverage/cli",
  },
  {
    filter: "@0xdoublesharp/doublcov-web",
    packageDir: "apps/web",
    reportDir: "coverage/web",
    vitestReportDir: "../../coverage/web",
  },
];

await rm(coverageRoot, { force: true, recursive: true });
await mkdir(coverageRoot, { recursive: true });

// Dependent packages import the core package through its package exports, which
// point at dist/. Build it first so coverage also works from fresh CI checkouts.
await run("pnpm", ["--filter", "@0xdoublesharp/doublcov-core", "run", "build"]);

for (const packageConfig of packages) {
  await run("pnpm", [
    "--filter",
    packageConfig.filter,
    "exec",
    "vitest",
    "run",
    "--coverage",
    "--coverage.reporter=lcov",
    `--coverage.reportsDirectory=${packageConfig.vitestReportDir}`,
  ]);
}

/** @type {string[]} */
const lcovParts = [];
for (const packageConfig of packages) {
  const lcovPath = path.join(repoRoot, packageConfig.reportDir, "lcov.info");
  lcovParts.push(
    rewriteRelativeSourcePaths(
      await readFile(lcovPath, "utf8"),
      packageConfig.packageDir,
    ),
  );
}

const mergedLcov = lcovParts
  .map((part) => part.trimEnd())
  .filter(Boolean)
  .join("\n");

await writeFile(path.join(coverageRoot, "lcov.info"), `${mergedLcov}\n`);
console.log(
  `Wrote ${path.relative(repoRoot, path.join(coverageRoot, "lcov.info"))}`,
);

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} failed with signal ${signal}`
            : `${command} ${args.join(" ")} failed with exit code ${code}`,
        ),
      );
    });
  });
}

/**
 * @param {string} lcov
 * @param {string} packageDir
 */
function rewriteRelativeSourcePaths(lcov, packageDir) {
  return lcov.replace(/^SF:(.+)$/gm, (line, sourcePath) => {
    if (path.isAbsolute(sourcePath) || /^[a-zA-Z]:[\\/]/.test(sourcePath)) {
      return line;
    }
    const normalizedSourcePath = sourcePath.replaceAll("\\", "/");
    if (
      normalizedSourcePath.startsWith(`${packageDir}/`) ||
      normalizedSourcePath.startsWith("packages/") ||
      normalizedSourcePath.startsWith("apps/")
    ) {
      return `SF:${normalizedSourcePath}`;
    }
    return `SF:${packageDir}/${normalizedSourcePath}`;
  });
}
