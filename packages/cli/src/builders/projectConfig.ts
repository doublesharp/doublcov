import { promises as fs } from "node:fs";
import path from "node:path";
import type { ReportConfig } from "../build.js";
import {
  normalizeExtensions,
  sanitizeReportConfigFields,
  sanitizeStringList,
} from "../build.js";
import { readJsonIfPresent, readTextIfPresent } from "../fs.js";
import type { CoverageBuilderPlugin } from "./types.js";

export type BuilderProjectDefaults = Omit<
  ReportConfig,
  "customization" | "open"
>;

export async function readBuilderProjectDefaults(
  builderName: string,
  builder: CoverageBuilderPlugin,
  cwd = process.cwd(),
): Promise<BuilderProjectDefaults> {
  const [packageDefaults, nativeDefaults] = await Promise.all([
    readPackageDefaults(builderName, builder, cwd),
    readNativeBuilderDefaults(builder, cwd),
  ]);
  return mergeDefaults(nativeDefaults, packageDefaults);
}

export function deriveReportOut(
  lcov: string | undefined,
  fallback: string,
): string {
  if (!lcov) return fallback;
  const directory = path.dirname(lcov);
  // path.join always returns "report" or `${directory}/report`; the second
  // arg is a non-empty string, so the result is never "". The trailing
  // `|| "report"` would shadow that case, but it is unreachable.
  return path.join(directory === "." ? "" : directory, "report");
}

function mergeDefaults(
  ...configs: BuilderProjectDefaults[]
): BuilderProjectDefaults {
  const merged: BuilderProjectDefaults = {};
  for (const config of configs) {
    Object.assign(merged, config);
    if (config.sources) merged.sources = config.sources;
    if (config.sourceExtensions)
      merged.sourceExtensions = config.sourceExtensions;
  }
  return merged;
}

async function readPackageDefaults(
  builderName: string,
  builder: CoverageBuilderPlugin,
  cwd: string,
): Promise<BuilderProjectDefaults> {
  const packageJson = await readJsonIfPresent<Record<string, unknown>>(
    path.join(cwd, "package.json"),
  );
  if (!isRecord(packageJson)) return {};

  const toolDefaults = readPackageToolDefaults(builder, packageJson);
  const doublcov = isRecord(packageJson.doublcov) ? packageJson.doublcov : {};
  const builderDefaults = readNestedBuilderDefaults(doublcov, [
    builderName,
    builder.id,
    ...builder.aliases,
  ]);
  return mergeDefaults(
    toolDefaults,
    sanitizeReportConfigFields(doublcov),
    builderDefaults,
  );
}

function readPackageToolDefaults(
  builder: CoverageBuilderPlugin,
  packageJson: Record<string, unknown>,
): BuilderProjectDefaults {
  if (
    builder.id === "jest" &&
    isRecord(packageJson.jest) &&
    typeof packageJson.jest.coverageDirectory === "string"
  ) {
    return lcovInDirectory(packageJson.jest.coverageDirectory);
  }

  if (builder.id === "c8" && isRecord(packageJson.c8)) {
    const reportDir =
      stringValue(packageJson.c8["report-dir"]) ??
      stringValue(packageJson.c8.reportDir);
    return reportDir ? lcovInDirectory(reportDir) : {};
  }

  if (
    builder.id === "vite" &&
    isRecord(packageJson.vitest) &&
    isRecord(packageJson.vitest.coverage)
  ) {
    const reportDir = stringValue(packageJson.vitest.coverage.reportsDirectory);
    return reportDir ? lcovInDirectory(reportDir) : {};
  }

  return {};
}

function readNestedBuilderDefaults(
  config: Record<string, unknown>,
  names: string[],
): BuilderProjectDefaults {
  const builders = isRecord(config.builders) ? config.builders : {};
  for (const name of names) {
    const candidate = builders[name];
    if (isRecord(candidate)) return sanitizeReportConfigFields(candidate);
  }
  return {};
}

async function readNativeBuilderDefaults(
  builder: CoverageBuilderPlugin,
  cwd: string,
): Promise<BuilderProjectDefaults> {
  switch (builder.id) {
    case "foundry":
      return readFoundryDefaults(cwd);
    case "hardhat":
      return readHardhatDefaults(cwd);
    case "vite":
      return readVitestDefaults(cwd);
    case "jest":
      return readJestDefaults(cwd);
    case "c8":
      return readC8Defaults(cwd);
    case "pytest":
      return readPytestDefaults(cwd);
    default:
      return {};
  }
}

async function readFoundryDefaults(
  cwd: string,
): Promise<BuilderProjectDefaults> {
  const text = await readTextIfPresent(path.join(cwd, "foundry.toml"));
  if (!text) return {};
  const sections = parseSimpleToml(text);
  const profile = sections.get("profile.default") ?? sections.get("") ?? {};
  const doublcov = mergeDefaults(
    sanitizeReportConfigFields(sections.get("doublcov") ?? {}),
    sanitizeReportConfigFields(sections.get("profile.default.doublcov") ?? {}),
  );
  const sources = sanitizeStringList(profile.src);
  return mergeDefaults(sources ? { sources } : {}, doublcov);
}

async function readHardhatDefaults(
  cwd: string,
): Promise<BuilderProjectDefaults> {
  const configPath = await firstExisting(cwd, [
    "hardhat.config.ts",
    "hardhat.config.js",
    "hardhat.config.mjs",
    "hardhat.config.cjs",
  ]);
  const hardhatText = configPath
    ? await readTextIfPresent(configPath)
    : undefined;
  const solcoverText = await readTextIfPresent(path.join(cwd, ".solcover.js"));
  return mergeDefaults(
    solcoverText ? readSolcoverTextDefaults(solcoverText) : {},
    hardhatText ? readHardhatTextDefaults(hardhatText) : {},
  );
}

function readHardhatTextDefaults(text: string): BuilderProjectDefaults {
  const sources = matchObjectString(text, "paths", "sources");
  const doublcovObject = extractObjectLiteral(text, "doublcov");
  return mergeDefaults(
    sources ? { sources: [sources] } : {},
    doublcovObject ? parseSimpleObjectDefaults(doublcovObject) : {},
  );
}

function readSolcoverTextDefaults(text: string): BuilderProjectDefaults {
  const reportDir =
    matchObjectString(text, "", "coverageDir") ??
    matchObjectString(text, "", "coverageDirectory");
  return reportDir ? lcovInDirectory(reportDir) : {};
}

async function readVitestDefaults(
  cwd: string,
): Promise<BuilderProjectDefaults> {
  const configPath = await firstExisting(cwd, [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
  ]);
  const text = configPath ? await readTextIfPresent(configPath) : undefined;
  const reportDir = text
    ? matchObjectString(text, "coverage", "reportsDirectory")
    : undefined;
  return reportDir ? lcovInDirectory(reportDir) : {};
}

async function readJestDefaults(cwd: string): Promise<BuilderProjectDefaults> {
  const json = await readJsonIfPresent<Record<string, unknown>>(
    path.join(cwd, "jest.config.json"),
  );
  if (isRecord(json) && typeof json.coverageDirectory === "string")
    return lcovInDirectory(json.coverageDirectory);

  const configPath = await firstExisting(cwd, [
    "jest.config.js",
    "jest.config.mjs",
    "jest.config.cjs",
    "jest.config.ts",
  ]);
  const text = configPath ? await readTextIfPresent(configPath) : undefined;
  const reportDir = text
    ? matchObjectString(text, "", "coverageDirectory")
    : undefined;
  return reportDir ? lcovInDirectory(reportDir) : {};
}

async function readC8Defaults(cwd: string): Promise<BuilderProjectDefaults> {
  const json =
    (await readJsonIfPresent<Record<string, unknown>>(
      path.join(cwd, ".c8rc.json"),
    )) ??
    (await readJsonIfPresent<Record<string, unknown>>(path.join(cwd, ".c8rc")));
  if (!isRecord(json)) return {};
  const reportDir =
    stringValue(json["report-dir"]) ?? stringValue(json.reportDir);
  return reportDir ? lcovInDirectory(reportDir) : {};
}

async function readPytestDefaults(
  cwd: string,
): Promise<BuilderProjectDefaults> {
  const text = await readTextIfPresent(path.join(cwd, "pyproject.toml"));
  if (!text) return {};
  const sections = parseSimpleToml(text);
  const lcov = stringValue(sections.get("tool.coverage.lcov")?.output);
  return lcov ? { lcov, out: deriveReportOut(lcov, "coverage/report") } : {};
}

function lcovInDirectory(directory: string): BuilderProjectDefaults {
  const lcov = path.join(directory, "lcov.info");
  return { lcov, out: deriveReportOut(lcov, "coverage/report") };
}

async function firstExisting(
  cwd: string,
  candidates: string[],
): Promise<string | undefined> {
  for (const candidate of candidates) {
    const fullPath = path.join(cwd, candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // Try the next conventional config filename.
    }
  }
  return undefined;
}

function parseSimpleToml(text: string): Map<string, Record<string, unknown>> {
  const rootSection: Record<string, unknown> = {};
  const sections = new Map<string, Record<string, unknown>>([
    ["", rootSection],
  ]);
  let current = rootSection;
  const rawLines = text.split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index += 1) {
    // `index < rawLines.length`, so `rawLines[index]` is never undefined; the
    // non-null assertion removes a dead `?? ""` branch.
    const line = stripTomlComment(rawLines[index]!).trim();
    if (!line) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section?.[1]) {
      current = sections.get(section[1]) ?? {};
      sections.set(section[1], current);
      continue;
    }
    // The capture groups (.+) and ([A-Za-z0-9_.-]+) are non-empty when the
    // regex matches, so assignment[1] and assignment[2] are always strings.
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!assignment) continue;
    let valueText = assignment[2]!;
    // If this is the start of a multi-line array, accumulate until the closing
    // bracket so parseSimpleValue can split entries across lines.
    if (
      valueText.trimStart().startsWith("[") &&
      !hasMatchingClosingBracket(valueText)
    ) {
      const collected = [valueText];
      while (index + 1 < rawLines.length) {
        index += 1;
        // Same in-bounds guarantee as the outer loop.
        const next = stripTomlComment(rawLines[index]!);
        collected.push(next);
        if (next.includes("]")) break;
      }
      valueText = collected.join(" ");
    }
    current[assignment[1]!] = parseSimpleValue(valueText);
  }
  return sections;
}

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === "#" && !inSingle && !inDouble)
      return line.slice(0, index);
  }
  return line;
}

function hasMatchingClosingBracket(value: string): boolean {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (!inSingle && !inDouble) {
      if (char === "[") depth += 1;
      else if (char === "]") {
        depth -= 1;
        if (depth === 0) return true;
      }
    }
  }
  return false;
}

function parseSimpleValue(value: string): unknown {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^["'](.*)["']$/);
  if (quoted) return quoted[1];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((entry) => parseSimpleValue(entry))
      .filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      );
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

function parseSimpleObjectDefaults(text: string): BuilderProjectDefaults {
  const values: Record<string, unknown> = {};
  for (const key of ["lcov", "out", "history", "name"]) {
    const value = matchObjectString(text, "", key);
    if (value) values[key] = value;
  }
  const sources = matchObjectArray(text, "sources");
  if (sources) values.sources = sources;
  const extensions =
    matchObjectArray(text, "extensions") ??
    matchObjectArray(text, "sourceExtensions");
  if (extensions) values.sourceExtensions = normalizeExtensions(extensions);
  return sanitizeReportConfigFields(values);
}

function extractObjectLiteral(text: string, key: string): string | undefined {
  const match = new RegExp(`(?<![A-Za-z0-9_$])${key}\\s*:\\s*\\{`, "m").exec(
    text,
  );
  if (!match) return undefined;
  let depth = 0;
  for (
    let index = match.index + match[0].lastIndexOf("{");
    index < text.length;
    index += 1
  ) {
    const char = text[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(match.index, index + 1);
  }
  return undefined;
}

function matchObjectString(
  text: string,
  objectKey: string,
  property: string,
): string | undefined {
  const haystack = objectKey
    ? (extractObjectLiteral(text, objectKey) ?? "")
    : text;
  const match = new RegExp(
    `(?<![A-Za-z0-9_$])${property}\\s*[:=]\\s*["']([^"']+)["']`,
    "m",
  ).exec(haystack);
  return match?.[1];
}

function matchObjectArray(
  text: string,
  property: string,
): string[] | undefined {
  const match = new RegExp(
    `(?<![A-Za-z0-9_$])${property}\\s*[:=]\\s*\\[([^\\]]+)\\]`,
    "m",
  ).exec(text);
  if (!match?.[1]) return undefined;
  return match[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
