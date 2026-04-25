import { spawn } from "node:child_process";
import type { BuildOptions, BuilderOptions } from "../args.js";
import { DEFAULT_HISTORY, DEFAULT_OUT, DEFAULT_SOURCES } from "../args.js";
import { buildReport, readReportConfig, type ReportConfig } from "../build.js";
import { openReport } from "../server.js";
import {
  deriveReportOut,
  readBuilderProjectDefaults,
  type BuilderProjectDefaults,
} from "./projectConfig.js";
import { resolveBuilder } from "./registry.js";
import type { CoverageBuilderPlugin } from "./types.js";

export async function runCoverageBuilder(
  builderName: string,
  options: BuilderOptions,
): Promise<void> {
  const builder = resolveBuilder(builderName);
  if (!builder) throw new Error(`Unknown coverage builder "${builderName}".`);

  const [config, projectDefaults] = await Promise.all([
    readReportConfig(options.customization),
    readBuilderProjectDefaults(builderName, builder),
  ]);
  const resolvedOptions = resolveBuilderOptions(
    builder,
    options,
    config,
    projectDefaults,
  );
  const prepared = await builder.prepareRun(resolvedOptions);
  try {
    process.stdout.write(
      `Running ${formatCommand(prepared.command, prepared.args)}\n`,
    );
    await runCommand(prepared.command, prepared.args);

    const buildOptions: BuildOptions = {
      lcov: prepared.lcov,
      sources: resolvedOptions.sources,
      sourceExtensions: resolvedOptions.sourceExtensions,
      out: resolvedOptions.out,
      history: resolvedOptions.history,
      diagnostics: [
        ...resolvedOptions.diagnostics,
        ...(prepared.diagnostics ?? []),
      ],
      ...(options.open !== undefined ? { open: options.open } : {}),
      ...(options.customization
        ? { customization: options.customization }
        : {}),
      ...(resolvedOptions.name ? { name: resolvedOptions.name } : {}),
      explicit: {
        lcov: true,
        sources: true,
        sourceExtensions: true,
        out: true,
        history: true,
        name: true,
      },
    };
    const result = await buildReport(buildOptions);
    if (result.open) await openReport(result.outDir, resolvedOptions.port);
  } finally {
    await prepared.cleanup?.();
  }
}

export function resolveBuilderOptions(
  builder: CoverageBuilderPlugin,
  options: BuilderOptions,
  config: ReportConfig,
  projectDefaults: BuilderProjectDefaults,
): BuilderOptions {
  const lcov = options.explicit?.lcov
    ? options.lcov
    : (config.lcov ??
      projectDefaults.lcov ??
      options.lcov ??
      builder.defaultLcov);
  const out = options.explicit?.out
    ? options.out
    : (config.out ??
      projectDefaults.out ??
      deriveReportOut(
        lcov,
        builder.defaultLcov
          ? deriveReportOut(builder.defaultLcov, DEFAULT_OUT)
          : DEFAULT_OUT,
      ));
  const sources = options.explicit?.sources
    ? options.sources
    : (config.sources ??
      projectDefaults.sources ??
      builder.defaultSources ??
      options.sources ??
      DEFAULT_SOURCES);
  const sourceExtensions = options.explicit?.sourceExtensions
    ? options.sourceExtensions
    : (config.sourceExtensions ??
      projectDefaults.sourceExtensions ??
      builder.defaultExtensions ??
      options.sourceExtensions);
  const history = options.explicit?.history
    ? options.history
    : (config.history ??
      projectDefaults.history ??
      options.history ??
      DEFAULT_HISTORY);
  const name = options.explicit?.name
    ? options.name
    : (config.name ?? projectDefaults.name ?? options.name);

  return {
    ...options,
    ...(lcov ? { lcov } : {}),
    out,
    sources,
    sourceExtensions,
    history,
    ...(name ? { name } : {}),
  };
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const formatted = formatCommand(command, args);
    const child = spawn(command, args, { stdio: "inherit" });

    child.on("error", (error) => {
      reject(new Error(`Could not start ${command}: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (signal) {
        reject(
          new Error(
            `${command} exited from signal ${signal}. Command: ${formatted}`,
          ),
        );
        return;
      }
      reject(
        new Error(
          `${command} exited with status ${code ?? "unknown"}. Command: ${formatted}`,
        ),
      );
    });
  });
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellArg).join(" ");
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
