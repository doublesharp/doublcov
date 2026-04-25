import {
  buildCoverageBundle,
  parseLcov,
  sanitizeCoverageReportCustomization,
  type CoverageHistory,
  type CoverageReport,
  type CoverageReportCustomization,
  type CoverageRun,
  type SourceFilePayload,
} from "@0xdoublesharp/doublcov-core";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildOptions, DiagnosticFileOption, ReportMode } from "./args.js";
import {
  copyDirectory,
  readJsonIfPresent,
  readSourceFiles,
  readTextIfPresent,
  writeJson,
  writeJsonAtomic,
} from "./fs.js";
import { readGitMetadata } from "./git.js";

const currentFile = getCurrentFile();
const currentDir = path.dirname(currentFile);
const require = createRequire(currentFile);
const SEA_WEB_MANIFEST = "web/.doublcov-assets.json";

interface SeaApi {
  isSea?: () => boolean;
  getAsset?: (key: string, encoding?: string) => ArrayBuffer | string;
}

export interface BuildReportResult {
  outDir: string;
  open: boolean;
  mode: ReportMode;
}

export interface ReportConfig {
  customization?: CoverageReportCustomization;
  lcov?: string;
  sources?: string[];
  sourceExtensions?: string[];
  out?: string;
  history?: string;
  mode?: ReportMode;
  open?: boolean;
  name?: string;
}

export async function buildReport(
  options: BuildOptions,
): Promise<BuildReportResult> {
  const webAssets = await resolveWebAssets();
  const [diagnosticInputs, config] = await Promise.all([
    readDiagnosticInputs(options.diagnostics),
    readReportConfig(options.customization),
  ]);
  const resolvedOptions = resolveBuildOptions(options, config);
  const outDir = path.resolve(resolvedOptions.out);
  const [lcov, historyRaw] = await Promise.all([
    readTextIfPresent(resolvedOptions.lcov),
    readJsonIfPresent<unknown>(resolvedOptions.history),
  ]);
  const history = sanitizeHistory(historyRaw);
  const open = resolveAutoOpen(options.open, config);
  const mode = resolveReportMode(resolvedOptions.mode, config);

  if (!lcov)
    throw new Error(`Could not read LCOV file at ${resolvedOptions.lcov}.`);
  const lcovSourcePaths = parseLcov(lcov).map((record) => record.sourceFile);
  const sourceFiles = await readSourceFiles(resolvedOptions.sources, {
    extensions: resolvedOptions.sourceExtensions,
    includePaths: lcovSourcePaths,
  });

  const git = readGitMetadata();
  const projectName =
    resolvedOptions.name ?? (await inferProjectName(process.cwd()));
  const bundle = buildCoverageBundle({
    lcov,
    sourceFiles,
    diagnostics: diagnosticInputs,
    ...(config.customization ? { customization: config.customization } : {}),
    projectName,
    projectRoot: process.cwd(),
    ...(history ? { history } : {}),
    ...(git.commit ? { commit: git.commit } : {}),
    ...(git.branch ? { branch: git.branch } : {}),
  });

  await copyWebAssets(webAssets, outDir);
  await writeJson(path.join(outDir, "data", "report.json"), bundle.report);
  await writeJson(
    path.join(outDir, "data", "history.json"),
    bundle.report.history,
  );
  await Promise.all(
    bundle.sourcePayloads.map((payload) =>
      writeJson(
        path.join(outDir, "data", "files", `${payload.id}.json`),
        payload,
      ),
    ),
  );
  if (mode === "standalone") {
    await makeIndexHtmlStandalone(outDir, bundle.report, bundle.sourcePayloads);
  }
  if (resolvedOptions.history)
    await writeJsonAtomic(
      path.resolve(resolvedOptions.history),
      bundle.report.history,
    );

  process.stdout.write(
    formatGeneratedReportMessage(bundle.report, outDir, mode),
  );
  return { outDir, open, mode };
}

export function resolveBuildOptions(
  options: BuildOptions,
  config: ReportConfig,
): BuildOptions {
  const name = options.explicit?.name
    ? options.name
    : (config.name ?? options.name);
  return {
    ...options,
    lcov: options.explicit?.lcov ? options.lcov : (config.lcov ?? options.lcov),
    sources: options.explicit?.sources
      ? options.sources
      : (config.sources ?? options.sources),
    sourceExtensions: options.explicit?.sourceExtensions
      ? options.sourceExtensions
      : (config.sourceExtensions ?? options.sourceExtensions),
    out: options.explicit?.out ? options.out : (config.out ?? options.out),
    history: options.explicit?.history
      ? options.history
      : (config.history ?? options.history),
    ...(options.explicit?.mode
      ? options.mode
        ? { mode: options.mode }
        : {}
      : config.mode
        ? { mode: config.mode }
        : options.mode
          ? { mode: options.mode }
          : {}),
    ...(name ? { name } : {}),
  };
}

export async function readReportConfig(
  customization: BuildOptions["customization"],
): Promise<ReportConfig> {
  if (!customization) return {};
  const parsed = await readJsonIfPresent<unknown>(customization.path);
  if (parsed === undefined && customization.required) {
    throw new Error(
      `Could not read customization file at ${customization.path}.`,
    );
  }
  const base = isRecord(parsed) ? parsed : {};
  const withTheme = customization.defaultTheme
    ? { ...base, defaultTheme: customization.defaultTheme }
    : base;
  const sanitizedCustomization =
    Object.keys(withTheme).length > 0
      ? sanitizeCustomization(withTheme)
      : undefined;
  return {
    ...(sanitizedCustomization
      ? { customization: sanitizedCustomization }
      : {}),
    ...sanitizeReportConfigFields(base),
  };
}

export function sanitizeReportConfigFields(
  input: Record<string, unknown>,
): Omit<ReportConfig, "customization"> {
  const config: Omit<ReportConfig, "customization"> = {};
  if (typeof input.lcov === "string") config.lcov = input.lcov;
  if (typeof input.out === "string") config.out = input.out;
  if (typeof input.history === "string") config.history = input.history;
  if (typeof input.name === "string") config.name = input.name;
  if (input.mode === "standalone" || input.mode === "static")
    config.mode = input.mode;
  if (typeof input.open === "boolean") config.open = input.open;
  const sources = sanitizeStringList(input.sources);
  if (sources) config.sources = sources;
  const extensions = sanitizeStringList(input.extensions);
  if (extensions) config.sourceExtensions = normalizeExtensions(extensions);
  const sourceExtensions = sanitizeStringList(input.sourceExtensions);
  if (sourceExtensions)
    config.sourceExtensions = normalizeExtensions(sourceExtensions);
  return config;
}

export function resolveAutoOpen(
  optionOpen: boolean | undefined,
  config: ReportConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (optionOpen !== undefined) return optionOpen;
  if (isCiEnvironment(env)) return false;
  return config.open ?? true;
}

export function resolveReportMode(
  optionMode: ReportMode | undefined,
  config: ReportConfig,
  env: NodeJS.ProcessEnv = process.env,
): ReportMode {
  if (optionMode) return optionMode;
  if (config.mode) return config.mode;
  return isCiEnvironment(env) ? "static" : "standalone";
}

export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnv(env.CI) || isTruthyEnv(env.GITHUB_ACTIONS);
}

function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

export function sanitizeStringList(input: unknown): string[] | undefined {
  if (typeof input === "string") {
    const values = input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return values.length ? values : undefined;
  }
  if (!Array.isArray(input)) return undefined;
  const values = input.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  return values.length ? values.map((value) => value.trim()) : undefined;
}

export function normalizeExtensions(extensions: string[]): string[] {
  return extensions
    .map((extension) => extension.trim())
    .filter(Boolean)
    .map((extension) =>
      extension.startsWith(".") ? extension : `.${extension}`,
    );
}

export function sanitizeCustomization(
  input: unknown,
): CoverageReportCustomization | undefined {
  return sanitizeCoverageReportCustomization(input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeHistory(input: unknown): CoverageHistory | undefined {
  if (!isRecord(input) || !Array.isArray(input.runs)) return undefined;
  const runs = input.runs
    .map(sanitizeRun)
    .filter((run): run is CoverageRun => run !== null);
  const schemaVersion = input.schemaVersion === 1 ? 1 : 1;
  return { schemaVersion, runs };
}

function sanitizeRun(input: unknown): CoverageRun | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== "string" || typeof input.timestamp !== "string")
    return null;
  const totals = sanitizeRunTotals(input.totals);
  if (!totals) return null;
  const files = Array.isArray(input.files)
    ? input.files
        .map(sanitizeRunFile)
        .filter((file): file is CoverageRun["files"][number] => file !== null)
    : [];
  return {
    id: input.id,
    timestamp: input.timestamp,
    totals,
    files,
    ...(typeof input.commit === "string" ? { commit: input.commit } : {}),
    ...(typeof input.branch === "string" ? { branch: input.branch } : {}),
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

function sanitizeTotals(
  input: unknown,
): { found: number; hit: number; percent: number } | null {
  if (!isRecord(input)) return null;
  const { found, hit, percent } = input;
  if (
    typeof found !== "number" ||
    typeof hit !== "number" ||
    typeof percent !== "number"
  )
    return null;
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
    functions:
      typeof uncovered.functions === "number" ? uncovered.functions : 0,
    branches: typeof uncovered.branches === "number" ? uncovered.branches : 0,
  };
  return { path: input.path, lines, functions, branches, uncovered: counts };
}

async function readDiagnosticInputs(
  diagnostics: DiagnosticFileOption[],
): Promise<Array<{ parser: string; content: string }>> {
  return (
    await Promise.all(
      diagnostics.map(async (diagnostic) => {
        const content = await readTextIfPresent(diagnostic.path);
        if (!content) return null;
        return {
          parser: diagnostic.parser,
          content,
        };
      }),
    )
  ).filter(
    (diagnostic): diagnostic is { parser: string; content: string } =>
      diagnostic !== null,
  );
}

async function inferProjectName(projectRoot: string): Promise<string> {
  const packageJsonName = await readPackageName(
    path.join(projectRoot, "package.json"),
  );
  if (packageJsonName) return packageJsonName;
  return path.basename(projectRoot);
}

async function readPackageName(
  packageJsonPath: string,
): Promise<string | undefined> {
  let text: string;
  try {
    text = await fs.readFile(packageJsonPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const packageJson = JSON.parse(text) as { name?: unknown };
    return typeof packageJson.name === "string" && packageJson.name.trim()
      ? packageJson.name.trim()
      : undefined;
  } catch {
    // package.json is unparseable — name inference is best-effort, so fall
    // back to the directory name rather than crashing the build.
    return undefined;
  }
}

async function resolveWebAssets(): Promise<string> {
  if (getSeaWebAssetKeys().length > 0) return "sea:web";

  const candidates = [
    ...(process.env.DOUBLCOV_WEB_ASSETS_DIR
      ? [path.resolve(process.env.DOUBLCOV_WEB_ASSETS_DIR)]
      : []),
    path.resolve(currentDir, "web"),
    path.resolve(currentDir, "../../../apps/web/dist"),
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
      `Checked: ${candidates.join(", ")}`,
    ].join(" "),
  );
}

async function copyWebAssets(webAssets: string, outDir: string): Promise<void> {
  const seaAssetKeys = getSeaWebAssetKeys();
  if (seaAssetKeys.length === 0) {
    await copyDirectory(webAssets, outDir);
    return;
  }

  const sea = getSeaApi();
  if (!sea?.getAsset)
    throw new Error("SEA web assets were detected but could not be read.");

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(
    seaAssetKeys.map(async (key) => {
      const relativePath = key.slice("web/".length);
      const asset = sea.getAsset?.(key);
      if (asset === undefined) throw new Error(`Missing SEA asset ${key}.`);
      await fs.mkdir(path.dirname(path.join(outDir, relativePath)), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(outDir, relativePath),
        typeof asset === "string" ? asset : Buffer.from(asset),
      );
    }),
  );
}

export async function makeIndexHtmlStandalone(
  outDir: string,
  report: CoverageReport,
  sourcePayloads: SourceFilePayload[],
): Promise<void> {
  const indexPath = path.join(outDir, "index.html");
  let html = await fs.readFile(indexPath, "utf8");
  html = await inlineStylesheets(html, outDir);
  html = await inlineModuleScript(html, outDir, report, sourcePayloads);
  await fs.writeFile(indexPath, html, "utf8");
}

export async function inlineStylesheets(
  html: string,
  outDir: string,
): Promise<string> {
  let nextHtml = html;
  const stylesheetTags = [
    ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g),
  ];
  for (const match of stylesheetTags) {
    const tag = match[0];
    const href = tag.match(/\bhref="([^"]+)"/)?.[1];
    if (!href) continue;
    const css = await fs.readFile(resolveOutputAssetPath(outDir, href), "utf8");
    nextHtml = replaceLiteralOnce(
      nextHtml,
      tag,
      `<style>\n${escapeHtmlRawText(css, "style")}\n</style>`,
    );
  }
  return nextHtml;
}

export async function inlineModuleScript(
  html: string,
  outDir: string,
  report: CoverageReport,
  sourcePayloads: SourceFilePayload[],
): Promise<string> {
  // Match a <script ...></script> tag in either attribute order: vite happens
  // to emit `type="module" ... src="..."`, but a future toolchain change
  // (or a hand-edited index.html) might swap them.
  const tagMatch = html.match(/<script\b[^>]*><\/script>/);
  const tag = tagMatch?.[0];
  if (!tag || !/\btype="module"/.test(tag)) return html;
  const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
  if (!src) return html;

  const js = stripSourceMapComment(
    await fs.readFile(resolveOutputAssetPath(outDir, src), "utf8"),
  );
  const embeddedData = [
    `<script type="application/json" id="doublcov-report-data">${escapeJsonForHtml(JSON.stringify(report))}</script>`,
    `<script type="application/json" id="doublcov-source-data">${escapeJsonForHtml(JSON.stringify(sourcePayloadsByPath(report, sourcePayloads)))}</script>`,
  ].join("\n");
  return replaceLiteralOnce(
    html,
    tag,
    `${embeddedData}\n<script type="module">\n${escapeHtmlRawText(js, "script")}\n</script>`,
  );
}

function sourcePayloadsByPath(
  report: CoverageReport,
  sourcePayloads: SourceFilePayload[],
): Record<string, SourceFilePayload> {
  const byId = new Map(sourcePayloads.map((payload) => [payload.id, payload]));
  const byPath: Record<string, SourceFilePayload> = {};
  for (const file of report.files) {
    const payload = byId.get(file.id);
    if (payload) byPath[file.sourceDataPath] = payload;
  }
  return byPath;
}

function resolveOutputAssetPath(outDir: string, assetPath: string): string {
  return path.join(outDir, assetPath.replace(/^\.\//, "").replace(/^\//, ""));
}

function stripSourceMapComment(js: string): string {
  return js.replace(/\n\/\/# sourceMappingURL=.*\s*$/, "");
}

export function escapeJsonForHtml(json: string): string {
  return json
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function replaceLiteralOnce(
  input: string,
  search: string,
  replacement: string,
): string {
  // Native String#replace with an empty needle prepends the replacement at the
  // zero-width match at index 0. For a literal-rewrite helper that's a footgun:
  // callers expect "needle not present means no-op". Treat empty needle as no-op.
  if (search === "") return input;
  return input.replace(search, () => replacement);
}

export function formatGeneratedReportMessage(
  report: CoverageReport,
  outDir: string,
  mode: ReportMode = "standalone",
): string {
  const indexPath = path.join(outDir, "index.html");
  const lines = [
    `Generated ${report.files.length} file report with ${report.uncoveredItems.length} uncovered items at ${outDir}`,
  ];
  if (mode === "static") {
    lines.push(`Open report: doublcov open ${outDir}`);
    lines.push(`Static index: ${indexPath}`);
  } else {
    lines.push(`Open report: ${indexPath}`);
  }
  return `${lines.join("\n")}\n`;
}

export function escapeHtmlRawText(
  text: string,
  elementName: "script" | "style",
): string {
  return text.replace(
    new RegExp(`</${elementName}`, "gi"),
    `<\\/${elementName}`,
  );
}

function getSeaWebAssetKeys(): string[] {
  const sea = getSeaApi();
  if (!sea?.isSea?.() || !sea.getAsset) return [];

  try {
    const manifest = sea.getAsset(SEA_WEB_MANIFEST, "utf8");
    const text =
      typeof manifest === "string"
        ? manifest
        : Buffer.from(manifest).toString("utf8");
    const keys = JSON.parse(text) as unknown;
    if (!Array.isArray(keys)) return [];
    return keys
      .filter(
        (key): key is string =>
          typeof key === "string" &&
          key.startsWith("web/") &&
          key !== SEA_WEB_MANIFEST,
      )
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
