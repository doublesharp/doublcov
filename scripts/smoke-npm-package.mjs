// @ts-check
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  cp,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(
  path.join(os.tmpdir(), "doublcov-package-smoke-"),
);
const packDir = path.join(tempRoot, "pack");
const projectDir = path.join(tempRoot, "project");
const npmCacheDir = path.join(tempRoot, "npm-cache");
const npmUserConfigPath = path.join(tempRoot, ".npmrc");
const reportDir = path.join(projectDir, "coverage", "report");

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  await writeFile(npmUserConfigPath, "", "utf8");
  await run(
    "pnpm",
    [
      "--filter",
      "@0xdoublesharp/doublcov",
      "pack",
      "--pack-destination",
      packDir,
    ],
    root,
  );

  const tarball = (await readdir(packDir)).find((file) =>
    file.endsWith(".tgz"),
  );
  if (!tarball)
    throw new Error("Could not find packed @0xdoublesharp/doublcov tarball.");

  await cp(
    path.join(root, "fixtures", "simple"),
    path.join(projectDir, "fixture"),
    { recursive: true },
  );
  await writeFile(
    path.join(projectDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );

  await run(
    "npm",
    ["install", "--ignore-scripts", path.join(packDir, tarball)],
    projectDir,
  );
  await run(
    path.join(
      projectDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "doublcov.cmd" : "doublcov",
    ),
    [
      "build",
      "--lcov",
      "fixture/lcov.info",
      "--sources",
      "fixture/src",
      "--out",
      "coverage/report",
      "--history",
      ".doublcov/history.json",
      "--name",
      "Package Smoke",
      "--no-open",
    ],
    projectDir,
  );

  const reportJsonPath = path.join(reportDir, "data", "report.json");
  if (!existsSync(path.join(reportDir, "index.html")))
    throw new Error("Packed CLI did not emit index.html.");
  if (!existsSync(reportJsonPath))
    throw new Error("Packed CLI did not emit data/report.json.");

  const report = JSON.parse(await readFile(reportJsonPath, "utf8"));
  if (report.projectName !== "Package Smoke")
    throw new Error("Packed CLI emitted unexpected projectName.");
  if (!Array.isArray(report.files) || report.files.length !== 1)
    throw new Error("Packed CLI emitted unexpected files.");

  process.stdout.write(`Packed npm package smoke passed in ${projectDir}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<void>}
 */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: childEnv(command),
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} exited from signal ${signal}.`
            : `${command} exited with status ${code}.`,
        ),
      );
    });
  });
}

/**
 * @param {string} command
 * @returns {NodeJS.ProcessEnv}
 */
function childEnv(command) {
  const env = { ...process.env };
  if (path.basename(command).startsWith("npm")) {
    for (const key of Object.keys(env)) {
      if (key.toLowerCase().startsWith("npm_config_")) delete env[key];
    }
  }
  return {
    ...env,
    npm_config_cache: npmCacheDir,
    npm_config_userconfig: npmUserConfigPath,
    npm_config_update_notifier: "false",
  };
}
