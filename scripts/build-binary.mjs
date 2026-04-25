// @ts-check
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = path.join(root, "packages", "cli");
const requireFromCli = createRequire(path.join(cliRoot, "package.json"));
const { build } = await import(requireFromCli.resolve("esbuild"));
const dist = path.join(cliRoot, "dist");
const seaDir = path.join(dist, "sea");
const binDir = path.join(dist, "bin");
const webDir = path.join(dist, "web");
const platform = process.env.DOUBLCOV_TARGET_PLATFORM ?? process.platform;
const arch = process.env.DOUBLCOV_TARGET_ARCH ?? process.arch;
const target = `${normalizePlatform(platform)}-${normalizeArch(arch)}`;
const executableName = process.platform === "win32" ? `doublcov-${target}.exe` : `doublcov-${target}`;
const executablePath = path.join(binDir, executableName);
const cjsBundlePath = path.join(seaDir, "index.cjs");
const seaConfigPath = path.join(seaDir, "sea-config.json");
const seaBlobPath = path.join(seaDir, "doublcov.blob");
const seaWebManifestKey = "web/.doublcov-assets.json";
const seaWebManifestPath = path.join(seaDir, "web-assets.json");
const sentinelFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

await rm(seaDir, { recursive: true, force: true });
await rm(binDir, { recursive: true, force: true });
await mkdir(seaDir, { recursive: true });
await mkdir(binDir, { recursive: true });

await build({
  entryPoints: [path.join(cliRoot, "src", "index.ts")],
  outfile: cjsBundlePath,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  define: {
    "import.meta.url": JSON.stringify(pathToFileURL(path.join(cliRoot, "src", "index.ts")).href)
  },
  external: ["node:*"]
});

const assets = await collectSeaAssets(webDir);
await writeFile(seaWebManifestPath, `${JSON.stringify(Object.keys(assets).sort())}\n`, "utf8");
assets[seaWebManifestKey] = seaWebManifestPath;
await writeFile(
  seaConfigPath,
  `${JSON.stringify(
    {
      main: cjsBundlePath,
      output: seaBlobPath,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
      assets
    },
    null,
    2
  )}\n`,
  "utf8"
);

await run(process.execPath, ["--experimental-sea-config", seaConfigPath]);
await copyFile(process.execPath, executablePath);
if (process.platform !== "win32") await run("chmod", ["755", executablePath]);

if (process.platform === "darwin") {
  await run("codesign", ["--remove-signature", executablePath]);
}

await run(postjectCommand(), [
  "exec",
  "postject",
  executablePath,
  "NODE_SEA_BLOB",
  seaBlobPath,
  "--sentinel-fuse",
  sentinelFuse,
  ...(process.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : [])
]);

if (process.platform === "darwin") {
  await run("codesign", ["--sign", "-", executablePath]);
}

process.stdout.write(`Built ${executablePath}\n`);

/**
 * @param {string} directory
 * @param {string} [prefix]
 * @returns {Promise<Record<string, string>>}
 */
async function collectSeaAssets(directory, prefix = "web") {
  const entries = await readdir(directory, { withFileTypes: true });
  /** @type {Record<string, string>} */
  const assets = {};
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      Object.assign(assets, await collectSeaAssets(absolutePath, key));
    } else if (entry.isFile()) {
      assets[key] = absolutePath;
    }
  }
  return assets;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(signal ? `${command} exited from signal ${signal}.` : `${command} exited with status ${code}.`));
    });
  });
}

/** @returns {string} */
function postjectCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePlatform(value) {
  if (value === "win32") return "windows";
  if (value === "darwin") return "macos";
  return value;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeArch(value) {
  if (value === "x64") return "x64";
  if (value === "arm64") return "arm64";
  return value;
}
