import {
  buildCoverageBundle,
  parseLcov,
  sanitizeCoverageReportCustomization,
  type CoverageHistory,
  type CoverageReportCustomization,
  type CoverageRun
} from "@0xdoublesharp/doublcov-core";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildOptions, DiagnosticFileOption } from "./args.js";
import { copyDirectory, readJsonIfPresent, readSourceFiles, readTextIfPresent, writeJson, writeJsonAtomic } from "./fs.js";
import { readGitMetadata } from "./git.js";

const currentFile = getCurrentFile();
const currentDir = path.dirname(currentFile);
const require = createRequire(currentFile);
const SEA_WEB_MANIFEST = "web/.doublcov-assets.json";

interface SeaApi {
  isSea?: () => boolean;
  getAsset?: (key: string, encoding?: string) => ArrayBuffer | string;
}

export async function buildReport(options: BuildOptions): Promise<void> {
  const outDir = path.resolve(options.out);
  const webAssets = await resolveWebAssets();
  const [lcov, diagnosticInputs, customization, historyRaw] = await Promise.all([
    readTextIfPresent(options.lcov),
    readDiagnosticInputs(options.diagnostics),
    readCustomization(options.customization),
    readJsonIfPresent<unknown>(options.history)
  ]);
  const history = sanitizeHistory(historyRaw);

  if (!lcov) throw new Error(`Could not read LCOV file at ${options.lcov}.`);
  const lcovSourcePaths = parseLcov(lcov).map((record) => record.sourceFile);
  const sourceFiles = await readSourceFiles(options.sources, {
    extensions: options.sourceExtensions,
    includePaths: lcovSourcePaths
  });

  const git = readGitMetadata();
  const projectName = options.name ?? (await inferProjectName(process.cwd()));
  const bundle = buildCoverageBundle({
    lcov,
    sourceFiles,
    diagnostics: diagnosticInputs,
    ...(customization ? { customization } : {}),
    projectName,
    projectRoot: process.cwd(),
    ...(history ? { history } : {}),
    ...(git.commit ? { commit: git.commit } : {}),
    ...(git.branch ? { branch: git.branch } : {})
  });

  await copyWebAssets(webAssets, outDir);
  await writeJson(path.join(outDir, "data", "report.json"), bundle.report);
  await writeJson(path.join(outDir, "data", "history.json"), bundle.report.history);
  await Promise.all(
    bundle.sourcePayloads.map((payload) => writeJson(path.join(outDir, "data", "files", `${payload.id}.json`), payload))
  );
  if (options.history) await writeJsonAtomic(path.resolve(options.history), bundle.report.history);

  process.stdout.write(
    `Generated ${bundle.report.files.length} file report with ${bundle.report.uncoveredItems.length} uncovered items at ${outDir}\n`
  );
}

async function readCustomization(
  customization: BuildOptions["customization"]
): Promise<CoverageReportCustomization | undefined> {
  if (!customization) return undefined;
  const parsed = await readJsonIfPresent<unknown>(customization.path);
  if (parsed === undefined && customization.required) {
    throw new Error(`Could not read customization file at ${customization.path}.`);
  }
  const base = isRecord(parsed) ? parsed : {};
  const withTheme = customization.defaultTheme
    ? { ...base, defaultTheme: customization.defaultTheme }
    : base;
  return Object.keys(withTheme).length > 0 ? sanitizeCustomization(withTheme) : undefined;
}

export function sanitizeCustomization(input: unknown): CoverageReportCustomization | undefined {
  return sanitizeCoverageReportCustomization(input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeHistory(input: unknown): CoverageHistory | undefined {
  if (!isRecord(input) || !Array.isArray(input.runs)) return undefined;
  const runs = input.runs.map(sanitizeRun).filter((run): run is CoverageRun => run !== null);
  const schemaVersion = input.schemaVersion === 1 ? 1 : 1;
  return { schemaVersion, runs };
}

function sanitizeRun(input: unknown): CoverageRun | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== "string" || typeof input.timestamp !== "string") return null;
  const totals = sanitizeRunTotals(input.totals);
  if (!totals) return null;
  const files = Array.isArray(input.files) ? input.files.map(sanitizeRunFile).filter((file): file is CoverageRun["files"][number] => file !== null) : [];
  return {
    id: input.id,
    timestamp: input.timestamp,
    totals,
    files,
    ...(typeof input.commit === "string" ? { commit: input.commit } : {}),
    ...(typeof input.branch === "string" ? { branch: input.branch } : {})
  };
}

function sanitizeRunTotals(input: unknown): CoverageRun["totals"] | null {
  if (!isRecord(input)) return null;
  const lines = sanitizeTotals(input.lines);
  const functions = sanitizeTotals(input.functions);
  const branches = sanitizeTotals(input.branches);
  if (!lines || !functions || !branches) return null;
  return { lines, functions, branches };
}

function sanitizeTotals(input: unknown): { found: number; hit: number; percent: number } | null {
  if (!isRecord(input)) return null;
  const { found, hit, percent } = input;
  if (typeof found !== "number" || typeof hit !== "number" || typeof percent !== "number") return null;
  return { found, hit, percent };
}

function sanitizeRunFile(input: unknown): CoverageRun["files"][number] | null {
  if (!isRecord(input) || typeof input.path !== "string") return null;
  const lines = sanitizeTotals(input.lines);
  const functions = sanitizeTotals(input.functions);
  const branches = sanitizeTotals(input.branches);
  if (!lines || !functions || !branches) return null;
  const uncovered = isRecord(input.uncovered) ? input.uncovered : {};
  const counts = {
    lines: typeof uncovered.lines === "number" ? uncovered.lines : 0,
    functions: typeof uncovered.functions === "number" ? uncovered.functions : 0,
    branches: typeof uncovered.branches === "number" ? uncovered.branches : 0
  };
  return { path: input.path, lines, functions, branches, uncovered: counts };
}

async function readDiagnosticInputs(
  diagnostics: DiagnosticFileOption[]
): Promise<Array<{ parser: string; content: string }>> {
  return (
    await Promise.all(
      diagnostics.map(async (diagnostic) => {
        const content = await readTextIfPresent(diagnostic.path);
        if (!content) return null;
        return {
          parser: diagnostic.parser,
          content
        };
      })
    )
  ).filter((diagnostic): diagnostic is { parser: string; content: string } => diagnostic !== null);
}

async function inferProjectName(projectRoot: string): Promise<string> {
  const packageJsonName = await readPackageName(path.join(projectRoot, "package.json"));
  if (packageJsonName) return packageJsonName;
  return path.basename(projectRoot);
}

async function readPackageName(packageJsonPath: string): Promise<string | undefined> {
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { name?: unknown };
    return typeof packageJson.name === "string" && packageJson.name.trim()
      ? packageJson.name.trim()
      : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function resolveWebAssets(): Promise<string> {
  if (getSeaWebAssetKeys().length > 0) return "sea:web";

  const candidates = [
    path.resolve(currentDir, "web"),
    path.resolve(currentDir, "../../../apps/web/dist")
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "index.html"));
      return candidate;
    } catch {
      // Keep looking for a usable asset directory.
    }
  }

  throw new Error(
    [
      "Web assets are missing.",
      "For local unpublished use, run `pnpm run build` from the doublcov workspace before running this CLI.",
      `Checked: ${candidates.join(", ")}`
    ].join(" ")
  );
}

async function copyWebAssets(webAssets: string, outDir: string): Promise<void> {
  const seaAssetKeys = getSeaWebAssetKeys();
  if (seaAssetKeys.length === 0) {
    await copyDirectory(webAssets, outDir);
    return;
  }

  const sea = getSeaApi();
  if (!sea?.getAsset) throw new Error("SEA web assets were detected but could not be read.");

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(
    seaAssetKeys.map(async (key) => {
      const relativePath = key.slice("web/".length);
      const asset = sea.getAsset?.(key);
      if (asset === undefined) throw new Error(`Missing SEA asset ${key}.`);
      await fs.mkdir(path.dirname(path.join(outDir, relativePath)), { recursive: true });
      await fs.writeFile(path.join(outDir, relativePath), typeof asset === "string" ? asset : Buffer.from(asset));
    })
  );
}

function getSeaWebAssetKeys(): string[] {
  const sea = getSeaApi();
  if (!sea?.isSea?.() || !sea.getAsset) return [];

  try {
    const manifest = sea.getAsset(SEA_WEB_MANIFEST, "utf8");
    const text = typeof manifest === "string" ? manifest : Buffer.from(manifest).toString("utf8");
    const keys = JSON.parse(text) as unknown;
    if (!Array.isArray(keys)) return [];
    return keys
      .filter((key): key is string => typeof key === "string" && key.startsWith("web/") && key !== SEA_WEB_MANIFEST)
      .sort();
  } catch {
    return [];
  }
}

function getSeaApi(): SeaApi | null {
  try {
    return require("node:sea") as SeaApi;
  } catch {
    return null;
  }
}

function getCurrentFile(): string {
  if (typeof __filename !== "undefined") return __filename;
  return fileURLToPath(import.meta.url);
}
