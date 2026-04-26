import { sourceExtensionsForLanguages } from "@0xdoublesharp/doublcov-core";
import { promises as fs } from "node:fs";
import path from "node:path";

const ignoredAtAnyDepth = new Set([
  ".git",
  ".hg",
  ".svn",
  ".doublcov",
  ".coverage",
  "node_modules",
]);
const ignoredAtRoot = new Set(["coverage", "dist", "target"]);

export interface ReadSourceFilesOptions {
  root?: string;
  extensions?: string[];
  includePaths?: string[];
}

export async function readTextIfPresent(
  filePath: string | undefined,
): Promise<string | undefined> {
  if (!filePath) return undefined;
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readJsonIfPresent<T>(
  filePath: string | undefined,
): Promise<T | undefined> {
  if (!filePath) return undefined;
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse JSON at ${filePath}: ${reason}`);
  }
}

export async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${suffix}.tmp`);
  try {
    await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true });
    throw error;
  }
}

export async function readSourceFiles(
  inputs: string[],
  options: ReadSourceFilesOptions = {},
): Promise<Array<{ path: string; content: string }>> {
  const root = options.root ?? process.cwd();
  const extensions = new Set(
    (options.extensions ?? sourceExtensionsForLanguages()).map(
      normalizeExtension,
    ),
  );
  const sourceRoots = new Set(inputs.map((input) => path.resolve(root, input)));
  const visited = new Set<string>();
  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    realRoot = root;
  }
  const allowedRealRoots = await realPathsForRoots(sourceRoots, realRoot);
  const inputFiles = await collectFiles(
    [...sourceRoots],
    sourceRoots,
    root,
    realRoot,
    allowedRealRoots,
    visited,
  );
  const includedFiles = await collectExistingFiles(
    options.includePaths ?? [],
    root,
    realRoot,
  );
  const files = [...new Set([...inputFiles, ...includedFiles])];

  return Promise.all(
    files
      .filter((file) => extensions.has(path.extname(file).toLowerCase()))
      .sort()
      .map(async (file) => ({
        path: formatSourcePath(file, root),
        content: await fs.readFile(file, "utf8"),
      })),
  );
}

export async function copyDirectory(
  source: string,
  destination: string,
): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, { recursive: true });
}

async function collectFiles(
  inputs: string[],
  sourceRoots: Set<string>,
  root: string,
  realRoot: string,
  allowedRealRoots: Set<string>,
  visited: Set<string>,
): Promise<string[]> {
  const found: string[] = [];
  for (const input of inputs) {
    let stat;
    try {
      stat = await fs.stat(input);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ELOOP") continue;
      throw error;
    }
    if (stat.isDirectory()) {
      const basename = path.basename(input);
      const isExplicitRoot = sourceRoots.has(input);
      const isTopLevelDirectory = path.dirname(input) === root;
      if (ignoredAtAnyDepth.has(basename) && !isExplicitRoot) continue;
      if (ignoredAtRoot.has(basename) && !isExplicitRoot && isTopLevelDirectory)
        continue;
      let realDirPath: string;
      try {
        realDirPath = await fs.realpath(input);
      } catch {
        realDirPath = input;
      }
      // Reject symlinked directories that resolve outside the project root
      // unless the user explicitly listed them as a source. Otherwise a
      // src/external -> /etc symlink would slurp arbitrary host content
      // into the coverage report.
      if (!isExplicitRoot && !isInsideRealRoot(realDirPath, realRoot)) continue;
      if (visited.has(realDirPath)) continue;
      visited.add(realDirPath);
      const entries = await fs.readdir(input);
      const nested = await collectFiles(
        entries.map((entry) => path.join(input, entry)),
        sourceRoots,
        root,
        realRoot,
        allowedRealRoots,
        visited,
      );
      found.push(...nested);
    } else {
      let realFilePath: string;
      try {
        realFilePath = await fs.realpath(input);
      } catch {
        realFilePath = input;
      }
      if (!isInsideAnyRealRoot(realFilePath, allowedRealRoots)) continue;
      found.push(input);
    }
  }
  return found;
}

async function realPathsForRoots(
  roots: Set<string>,
  realRoot: string,
): Promise<Set<string>> {
  const resolved = new Set<string>([realRoot]);
  await Promise.all(
    [...roots].map(async (root) => {
      try {
        resolved.add(await fs.realpath(root));
      } catch {
        // Missing source roots are ignored later by collectFiles.
      }
    }),
  );
  return resolved;
}

function isInsideAnyRealRoot(target: string, realRoots: Set<string>): boolean {
  for (const realRoot of realRoots) {
    if (isInsideRealRoot(target, realRoot)) return true;
  }
  return false;
}

function isInsideRealRoot(target: string, realRoot: string): boolean {
  if (target === realRoot) return true;
  const rel = path.relative(realRoot, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function collectExistingFiles(
  filePaths: string[],
  root: string,
  realRoot: string,
): Promise<string[]> {
  const found: string[] = [];
  for (const filePath of filePaths) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(root, filePath);
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) continue;
      const realFilePath = await fs.realpath(absolutePath);
      if (isInsideRealRoot(realFilePath, realRoot)) found.push(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return found;
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return trimmed;
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function formatSourcePath(filePath: string, root: string): string {
  const relative = path.relative(root, filePath);
  return (
    isInsidePathRoot(filePath, root) && relative ? relative : filePath
  ).replaceAll(path.sep, "/");
}

function isInsidePathRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
