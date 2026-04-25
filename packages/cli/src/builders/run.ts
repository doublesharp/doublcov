import { spawn } from "node:child_process";
import type { BuildOptions, BuilderOptions } from "../args.js";
import { buildReport } from "../build.js";
import { openReport } from "../server.js";
import { resolveBuilder } from "./registry.js";

export async function runCoverageBuilder(builderName: string, options: BuilderOptions): Promise<void> {
  const builder = resolveBuilder(builderName);
  if (!builder) throw new Error(`Unknown coverage builder "${builderName}".`);

  const prepared = await builder.prepareRun(options);
  try {
    process.stdout.write(`Running ${formatCommand(prepared.command, prepared.args)}\n`);
    await runCommand(prepared.command, prepared.args);

    const buildOptions: BuildOptions = {
      lcov: prepared.lcov,
      sources: options.sources,
      sourceExtensions: options.sourceExtensions,
      out: options.out,
      history: options.history,
      diagnostics: [...options.diagnostics, ...(prepared.diagnostics ?? [])],
      ...(options.open !== undefined ? { open: options.open } : {}),
      ...(options.customization ? { customization: options.customization } : {}),
      ...(options.name ? { name: options.name } : {})
    };
    const result = await buildReport(buildOptions);
    if (result.open) await openReport(result.outDir, options.port);
  } finally {
    await prepared.cleanup?.();
  }
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
        reject(new Error(`${command} exited from signal ${signal}. Command: ${formatted}`));
        return;
      }
      reject(new Error(`${command} exited with status ${code ?? "unknown"}. Command: ${formatted}`));
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
