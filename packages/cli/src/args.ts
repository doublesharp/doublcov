import { DEFAULT_SOURCE_EXTENSIONS } from "@0xdoublesharp/doublcov-core";
import { isBuilderCommand, resolveBuilder } from "./builders/registry.js";

export interface BuildOptions {
  lcov: string;
  sources: string[];
  sourceExtensions: string[];
  out: string;
  history: string;
  mode?: ReportMode;
  port: number;
  timeoutMs: number;
  open?: boolean;
  name?: string;
  customization?: CustomizationFileOption;
  diagnostics: DiagnosticFileOption[];
  explicit?: ExplicitBuildOptions;
}

export type ReportMode = "standalone" | "static";

export interface ExplicitBuildOptions {
  lcov?: boolean;
  sources?: boolean;
  sourceExtensions?: boolean;
  out?: boolean;
  history?: boolean;
  mode?: boolean;
  open?: boolean;
  name?: boolean;
}

export interface CustomizationFileOption {
  path: string;
  defaultTheme?: string;
  required: boolean;
}

export interface DiagnosticFileOption {
  parser: string;
  path: string;
}

export interface BuilderOptions extends Omit<BuildOptions, "lcov"> {
  lcov?: string;
  port: number;
  timeoutMs: number;
  builderArgs: string[];
}

export const DEFAULT_LCOV = "lcov.info";
export const DEFAULT_OUT = "coverage/report";
export const DEFAULT_SOURCES = ["src"];
const DEFAULT_SOURCE_EXTENSIONS_TEXT = DEFAULT_SOURCE_EXTENSIONS.map(
  (extension) => extension.replace(/^\./, ""),
).join(",");
export const DEFAULT_HISTORY = ".doublcov/history.json";
const DEFAULT_PORT = 0;
export const DEFAULT_SERVE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CUSTOMIZATION = "doublcov.config.json";
const VALUE_FLAGS = new Set([
  "bytecode",
  "customization",
  "debug",
  "diagnostic",
  "dir",
  "extensions",
  "history",
  "lcov",
  "mode",
  "name",
  "out",
  "port",
  "sources",
  "theme",
  "timeout",
]);

export type CliCommand =
  | { name: "build"; options: BuildOptions }
  | { name: "builder"; builder: string; options: BuilderOptions }
  | { name: "open"; reportDir: string; port: number; timeoutMs: number }
  | { name: "serve"; reportDir: string; port: number; timeoutMs: number }
  | { name: "help" };

export function parseCommand(argv: string[]): CliCommand {
  const [command = "help", ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h")
    return { name: "help" };
  if (hasCommandHelp(rest)) return { name: "help" };
  if (command === "build") return { name: "build", options: parseBuild(rest) };
  if (isBuilderCommand(command))
    return {
      name: "builder",
      builder: command,
      options: parseBuilder(command, rest),
    };
  if (command === "open") return parseOpen(rest);
  if (command === "serve") return parseServe(rest);
  throw new Error(`Unknown command "${command}".`);
}

function parseBuild(argv: string[]): BuildOptions {
  const values = parseFlags(argv, new Set(["open", "no-open"]));
  const lcov = values.lcov ?? DEFAULT_LCOV;
  const out = values.out ?? DEFAULT_OUT;
  const sources = values.sources ? parseList(values.sources) : DEFAULT_SOURCES;
  const sourceExtensions = values.extensions
    ? parseList(values.extensions)
    : [...DEFAULT_SOURCE_EXTENSIONS];
  const customization = parseCustomizationFileOption(values);
  const open = parseOpenFlag(values);
  const mode = parseReportMode(values.mode);
  return {
    lcov,
    sources,
    sourceExtensions,
    out,
    history: values.history ?? DEFAULT_HISTORY,
    ...(mode ? { mode } : {}),
    port: parsePort(values.port),
    timeoutMs: parseTimeout(values.timeout),
    ...(open !== undefined ? { open } : {}),
    customization,
    diagnostics: parseDiagnosticFileOptions(argv, values),
    ...(values.name ? { name: values.name } : {}),
    explicit: {
      lcov: values.lcov !== undefined,
      sources: values.sources !== undefined,
      sourceExtensions: values.extensions !== undefined,
      out: values.out !== undefined,
      history: values.history !== undefined,
      mode: values.mode !== undefined,
      open: open !== undefined,
      name: values.name !== undefined,
    },
  };
}

function parseBuilder(command: string, argv: string[]): BuilderOptions {
  const builder = resolveBuilder(command);
  const { cliArgs, passthroughArgs } = splitPassthrough(argv);
  const values = parseFlags(cliArgs, new Set(["open", "no-open"]));
  const out = values.out ?? DEFAULT_OUT;
  const sources = values.sources
    ? parseList(values.sources)
    : (builder?.defaultSources ?? DEFAULT_SOURCES);
  const sourceExtensions = values.extensions
    ? parseList(values.extensions)
    : (builder?.defaultExtensions ?? [...DEFAULT_SOURCE_EXTENSIONS]);
  const customization = parseCustomizationFileOption(values);
  const open = parseOpenFlag(values);
  const mode = parseReportMode(values.mode);
  return {
    ...(values.lcov ? { lcov: values.lcov } : {}),
    sources,
    sourceExtensions,
    out,
    ...(mode ? { mode } : {}),
    ...(open !== undefined ? { open } : {}),
    port: parsePort(values.port),
    timeoutMs: parseTimeout(values.timeout),
    history: values.history ?? DEFAULT_HISTORY,
    builderArgs: passthroughArgs,
    customization,
    diagnostics: parseDiagnosticFileOptions(cliArgs, values),
    ...(values.name ? { name: values.name } : {}),
    explicit: {
      lcov: values.lcov !== undefined,
      sources: values.sources !== undefined,
      sourceExtensions: values.extensions !== undefined,
      out: values.out !== undefined,
      history: values.history !== undefined,
      mode: values.mode !== undefined,
      open: open !== undefined,
      name: values.name !== undefined,
    },
  };
}

function parseReportMode(value: string | undefined): ReportMode | undefined {
  if (value === undefined) return undefined;
  if (value === "standalone" || value === "static") return value;
  throw new Error(`Invalid --mode "${value}". Expected standalone or static.`);
}

function parseOpenFlag(
  values: Record<string, string | undefined>,
): boolean | undefined {
  if (values["no-open"] !== undefined) return false;
  if (values.open === undefined) return undefined;
  if (values.open === "true") return true;
  if (values.open === "false") return false;
  throw new Error(`Invalid --open "${values.open}". Expected true or false.`);
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCustomizationFileOption(
  values: Record<string, string | undefined>,
): CustomizationFileOption {
  return {
    path: values.customization ?? DEFAULT_CUSTOMIZATION,
    required: Boolean(values.customization),
    ...(values.theme ? { defaultTheme: values.theme } : {}),
  };
}

function parseDiagnosticFileOptions(
  argv: string[],
  values: Record<string, string | undefined>,
): DiagnosticFileOption[] {
  const diagnostics = readFlagValues(argv, "diagnostic").map(
    parseDiagnosticFileOption,
  );
  if (values.debug)
    diagnostics.push({ parser: "foundry-debug", path: values.debug });
  if (values.bytecode)
    diagnostics.push({ parser: "foundry-bytecode", path: values.bytecode });
  return diagnostics;
}

function parseDiagnosticFileOption(value: string): DiagnosticFileOption {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(
      `Invalid diagnostic input "${value}". Expected <parser>:<path>.`,
    );
  }
  return {
    parser: value.slice(0, separatorIndex),
    path: value.slice(separatorIndex + 1),
  };
}

function readFlagValues(argv: string[], flagName: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const flag = arg.slice(2);
    const separatorIndex = flag.indexOf("=");
    const key = separatorIndex === -1 ? flag : flag.slice(0, separatorIndex);
    if (key !== flagName) continue;
    if (separatorIndex !== -1) {
      values.push(flag.slice(separatorIndex + 1));
      continue;
    }
    // parseFlags() runs before readFlagValues() and already throws
    // "Missing value for --<flag>" when the flag is registered in
    // VALUE_FLAGS without a following value, so argv[index + 1] is
    // guaranteed to exist and not start with "--" here.
    values.push(argv[index + 1]!);
    index += 1;
  }
  return values;
}

function parseOpen(argv: string[]): CliCommand {
  const values = parseFlags(argv);
  const positional = firstPositional(argv);
  return {
    name: "open",
    reportDir: positional ?? values.dir ?? DEFAULT_OUT,
    port: parsePort(values.port),
    timeoutMs: parseTimeout(values.timeout),
  };
}

function parseServe(argv: string[]): CliCommand {
  const values = parseFlags(argv);
  const positional = firstPositional(argv);
  return {
    name: "serve",
    reportDir: positional ?? values.dir ?? DEFAULT_OUT,
    port: parsePort(values.port),
    timeoutMs: parseTimeout(values.timeout),
  };
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SERVE_TIMEOUT_MS;
  const match = value.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(
      `Invalid --timeout "${value}". Expected a duration such as 30m, 1h, or 0.`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  const multiplier =
    unit === "h"
      ? 60 * 60 * 1000
      : unit === "m"
        ? 60 * 1000
        : unit === "s"
          ? 1000
          : 1;
  return amount * multiplier;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const parsed = Number(value);
  if (
    value.trim() === "" ||
    !/^\d+$/.test(value.trim()) ||
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    parsed > 65535
  ) {
    throw new Error(
      `Invalid --port "${value}". Expected an integer between 0 and 65535.`,
    );
  }
  return parsed;
}

function parseFlags(
  argv: string[],
  booleanFlags = new Set<string>(),
): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const flag = arg.slice(2);
    const separatorIndex = flag.indexOf("=");
    const key = separatorIndex === -1 ? flag : flag.slice(0, separatorIndex);
    const inlineValue =
      separatorIndex === -1 ? undefined : flag.slice(separatorIndex + 1);
    if (!key) continue;
    if (booleanFlags.has(key)) {
      flags[key] = inlineValue ?? "true";
      continue;
    }
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (VALUE_FLAGS.has(key) && (!next || next.startsWith("--"))) {
      throw new Error(`Missing value for --${key}.`);
    }
    flags[key] = next?.startsWith("--") ? undefined : next;
    if (next && !next.startsWith("--")) index += 1;
  }
  return flags;
}

function splitPassthrough(argv: string[]): {
  cliArgs: string[];
  passthroughArgs: string[];
} {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1) return { cliArgs: argv, passthroughArgs: [] };
  return {
    cliArgs: argv.slice(0, separatorIndex),
    passthroughArgs: argv.slice(separatorIndex + 1),
  };
}

function hasCommandHelp(argv: string[]): boolean {
  const separatorIndex = argv.indexOf("--");
  const cliArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  return cliArgs.includes("--help") || cliArgs.includes("-h");
}

function firstPositional(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      if (!arg.includes("=")) index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

export function helpText(): string {
  return `Doublcov

Usage:
  doublcov forge -- --exclude-tests --ir-minimum
  doublcov foundry -- --exclude-tests --ir-minimum
  doublcov hardhat
  doublcov vite
  doublcov jest
  doublcov v8
  doublcov pytest
  doublcov cargo-llvm-cov
  doublcov lcov-capture
  doublcov build
  doublcov build --mode static
  doublcov build --no-open
  doublcov open

Builder options:
  --lcov <path>       Override the LCOV path produced by the builder
  --sources <paths>   Comma-separated source directories or files. Defaults depend on the builder
  --extensions <exts> Comma-separated source extensions. Default: ${DEFAULT_SOURCE_EXTENSIONS_TEXT}
  --out <path>        Static report output directory. Default: coverage/report
  --mode <mode>       Output mode: standalone or static. Default: standalone locally, static in CI
  --history <path>    History JSON file to read and update. Default: .doublcov/history.json
  --name <name>       Project/codebase name shown in the generated report title
  --customization <path> Theme and UI hook JSON file
  --theme <id>        Default report theme. Uses ${DEFAULT_CUSTOMIZATION} when --customization is omitted
  --diagnostic <in>   Optional parser-tagged diagnostics as <parser>:<path>
  --debug <path>      Alias for --diagnostic foundry-debug:<path>
  --bytecode <path>   Alias for --diagnostic foundry-bytecode:<path>
  --open              Open the generated report index.html. Default outside CI
  --no-open           Do not open the generated report. Default in CI and GitHub Actions
  --port <number>     Local server port for static reports. Use 0 for an available port. Default: 0
  --timeout <duration> Static server lifetime before shutdown. Default: 30m
  --                  Pass all remaining arguments to the underlying builder

Build options:
  --lcov <path>       LCOV file from any supported coverage tool. Default: lcov.info
  --sources <paths>   Comma-separated source directories or files. Default: src
  --extensions <exts> Comma-separated source extensions. Default: ${DEFAULT_SOURCE_EXTENSIONS_TEXT}
  --out <path>        Static report output directory. Default: coverage/report
  --mode <mode>       Output mode: standalone or static. Default: standalone locally, static in CI
  --history <path>    History JSON file to read and update. Default: .doublcov/history.json
  --name <name>       Project/codebase name shown in the generated report title
  --customization <path> Theme and UI hook JSON file
  --theme <id>        Default report theme. Uses ${DEFAULT_CUSTOMIZATION} when --customization is omitted
  --diagnostic <in>   Optional parser-tagged diagnostics as <parser>:<path>
  --debug <path>      Alias for --diagnostic foundry-debug:<path>
  --bytecode <path>   Alias for --diagnostic foundry-bytecode:<path>
  --open              Open the generated report index.html. Default outside CI
  --no-open           Do not open the generated report. Default in CI and GitHub Actions
  --port <number>     Local server port for static reports. Use 0 for an available port. Default: 0
  --timeout <duration> Static server lifetime before shutdown. Default: 30m

Open options:
  --port <number>     Local server port for static reports. Use 0 for an available port. Default: 0
  --timeout <duration> Static server lifetime before shutdown. Default: 30m

Builder defaults:
  CLI flags override ${DEFAULT_CUSTOMIZATION}. Builder commands also read project config such as package.json,
  foundry.toml, Hardhat source paths, Jest/Vitest/c8 config, .solcover.js, and pyproject.toml.
  If --out is not configured, the report is written to a report directory next to the resolved LCOV file.
`;
}
