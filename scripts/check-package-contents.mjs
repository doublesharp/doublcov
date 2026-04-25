// @ts-check
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_PATTERNS = [
  /^package\/dist\/bin\//,
  /^package\/dist\/sea\//,
  /^package\/src\//,
  /^package\/test\//,
  /\.tsbuildinfo$/,
  /^package\/vitest\.config\./,
  /^package\/tsconfig\./,
  /^package\/\.npmignore$/,
  /^package\/node_modules\//,
];
const MAX_TARBALL_BYTES = 5 * 1024 * 1024;

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "doublcov-pack-check-"));
try {
  await run(
    "pnpm",
    [
      "--filter",
      "@0xdoublesharp/doublcov",
      "pack",
      "--pack-destination",
      tempRoot,
    ],
    root,
  );
  const tarball = (await readdir(tempRoot)).find((file) =>
    file.endsWith(".tgz"),
  );
  if (!tarball) throw new Error("No tarball produced by pnpm pack.");
  const tarballPath = path.join(tempRoot, tarball);

  const { size } = await stat(tarballPath);
  if (size > MAX_TARBALL_BYTES) {
    throw new Error(
      `Tarball ${tarball} is ${size} bytes, exceeds budget of ${MAX_TARBALL_BYTES}.`,
    );
  }

  const entries = await listTarballEntries(tarballPath);
  const offenders = entries.filter((entry) =>
    FORBIDDEN_PATTERNS.some((pattern) => pattern.test(entry)),
  );
  if (offenders.length > 0) {
    throw new Error(
      `Tarball contains forbidden entries:\n  ${offenders.join("\n  ")}`,
    );
  }

  process.stdout.write(
    `Package contents OK: ${tarball} (${size} bytes, ${entries.length} entries)\n`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

/**
 * @param {string} tarballPath
 * @returns {Promise<string[]>}
 */
function listTarballEntries(tarballPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-tzf", tarballPath]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`tar exited with status ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(
        stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<void>}
 */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
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
