// @ts-check
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { get } from "node:https";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repository = input("repository") || "doublesharp/doublcov";
const version = input("version") || "latest";
const command = input("command");
const args = parseArgs(input("args"));
const installOnly = input("install-only").toLowerCase() === "true";
const asset = assetName();
const cacheDir = path.join(
  os.tmpdir(),
  "doublcov-action",
  sanitize(version),
  process.platform,
  process.arch,
);
const executablePath = path.join(
  cacheDir,
  process.platform === "win32" ? "doublcov.exe" : "doublcov",
);
const baseUrl =
  version === "latest"
    ? `https://github.com/${repository}/releases/latest/download`
    : `https://github.com/${repository}/releases/download/${version}`;
const maxDownloadAttempts = 4;

await mkdir(cacheDir, { recursive: true });
await download(`${baseUrl}/${asset}`, executablePath);
if (process.platform !== "win32") await chmod(executablePath, 0o755);
await verifyChecksum(`${baseUrl}/SHA256SUMS`, executablePath, asset);

await appendIfPresent(process.env.GITHUB_PATH, `${cacheDir}${os.EOL}`);
await appendIfPresent(
  process.env.GITHUB_OUTPUT,
  `path=${executablePath}${os.EOL}`,
);

if (!installOnly) {
  const doublcovArgs = withCiOpenDefault(command ? [command, ...args] : args);
  await run(executablePath, doublcovArgs);
}

/**
 * @param {string} name
 * @returns {string}
 */
function input(name) {
  return (
    process.env[`INPUT_${name.toUpperCase().replaceAll("-", "_")}`]?.trim() ??
    ""
  );
}

/** @returns {string} */
function assetName() {
  const platform = normalizePlatform(process.platform);
  const arch = normalizeArch(process.arch);
  if (!platform || !arch)
    throw new Error(
      `Unsupported platform for Doublcov binary: ${process.platform}/${process.arch}`,
    );
  return platform === "windows"
    ? `doublcov-${platform}-${arch}.exe`
    : `doublcov-${platform}-${arch}`;
}

/**
 * @param {NodeJS.Platform} value
 * @returns {"linux" | "macos" | "windows" | undefined}
 */
function normalizePlatform(value) {
  if (value === "linux") return "linux";
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  return undefined;
}

/**
 * @param {NodeJS.Architecture} value
 * @returns {"x64" | "arm64" | undefined}
 */
function normalizeArch(value) {
  if (value === "x64") return "x64";
  if (value === "arm64") return "arm64";
  return undefined;
}

/**
 * @param {string} url
 * @param {string} destination
 * @param {number} [redirects]
 * @returns {Promise<void>}
 */
async function download(url, destination, redirects = 0) {
  let lastError;
  for (let attempt = 1; attempt <= maxDownloadAttempts; attempt += 1) {
    try {
      await downloadOnce(url, destination, redirects);
      return;
    } catch (caught) {
      lastError = caught;
      if (!shouldRetryDownload(caught) || attempt === maxDownloadAttempts)
        break;
      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(
        `Download failed; retrying in ${delayMs}ms (${attempt}/${maxDownloadAttempts}): ${caught instanceof Error ? caught.message : String(caught)}`,
      );
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * @param {string} url
 * @param {string} destination
 * @param {number} redirects
 * @returns {Promise<void>}
 */
async function downloadOnce(url, destination, redirects) {
  if (redirects > 5)
    throw new Error(`Too many redirects while downloading ${url}`);
  await new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          "user-agent": "doublcov-github-action",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const redirect = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && redirect) {
          response.resume();
          download(
            new URL(redirect, url).toString(),
            destination,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to download ${url}: HTTP ${statusCode}`));
          return;
        }
        const file = createWriteStream(destination, { mode: 0o755 });
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

/**
 * @param {unknown} caught
 * @returns {boolean}
 */
function shouldRetryDownload(caught) {
  if (!(caught instanceof Error)) return false;
  return (
    /\bHTTP (?:408|429|5\d\d)\b/.test(caught.message) ||
    /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)\b/.test(caught.message)
  );
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} checksumUrl
 * @param {string} binaryPath
 * @param {string} binaryAsset
 * @returns {Promise<void>}
 */
async function verifyChecksum(checksumUrl, binaryPath, binaryAsset) {
  const checksumPath = path.join(path.dirname(binaryPath), "SHA256SUMS");
  await download(checksumUrl, checksumPath);
  const checksums = await readFile(checksumPath, "utf8");
  const line = checksums
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(
      (entry) =>
        entry.endsWith(` ${binaryAsset}`) || entry.endsWith(` *${binaryAsset}`),
    );
  if (!line) throw new Error(`SHA256SUMS did not include ${binaryAsset}.`);
  const expected = line.split(/\s+/)[0];
  const actual = createHash("sha256")
    .update(await readFile(binaryPath))
    .digest("hex");
  if (actual !== expected)
    throw new Error(`Checksum mismatch for ${binaryAsset}.`);
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function parseArgs(value) {
  const args = [];
  let current = "";
  let quote = "";
  let escaping = false;
  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += "\\";
  if (quote) throw new Error("Unterminated quote in Doublcov action args.");
  if (current) args.push(current);
  return args;
}

/**
 * @param {string[]} commandArgs
 * @returns {string[]}
 */
function withCiOpenDefault(commandArgs) {
  const commandName = commandArgs[0];
  if (!commandName || commandName === "open" || hasOpenFlag(commandArgs))
    return commandArgs;
  return [commandName, "--no-open", ...commandArgs.slice(1)];
}

/**
 * @param {string[]} commandArgs
 * @returns {boolean}
 */
function hasOpenFlag(commandArgs) {
  return commandArgs.some(
    (arg) =>
      arg === "--open" || arg === "--no-open" || arg.startsWith("--open="),
  );
}

/**
 * @param {string | undefined} filePath
 * @param {string} contents
 * @returns {Promise<void>}
 */
async function appendIfPresent(filePath, contents) {
  if (!filePath) return;
  await appendFile(filePath, contents, "utf8");
}

/**
 * @param {string} commandPath
 * @param {string[]} commandArgs
 * @returns {Promise<void>}
 */
function run(commandPath, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandPath, commandArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `doublcov exited from signal ${signal}.`
            : `doublcov exited with status ${code}.`,
        ),
      );
    });
  });
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitize(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
