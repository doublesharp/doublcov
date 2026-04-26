import { parseCommand, helpText } from "./args.js";
import { buildReport } from "./build.js";
import { runCoverageBuilder } from "./builders/run.js";
import { openReport, serveReport } from "./server.js";

export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const command = parseCommand(argv);
  if (command.name === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (command.name === "build") {
    const result = await buildReport(command.options);
    if (result.open)
      await openReport(result.outDir, {
        mode: result.mode,
        port: command.options.port,
        timeoutMs: command.options.timeoutMs,
      });
    return;
  }
  if (command.name === "builder") {
    await runCoverageBuilder(command.builder, command.options);
    return;
  }
  if (command.name === "serve") {
    await serveReport(command.reportDir, {
      port: command.port,
      timeoutMs: command.timeoutMs,
      open: true,
    });
    return;
  }
  await openReport(command.reportDir, {
    port: command.port,
    timeoutMs: command.timeoutMs,
  });
}

export async function run(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  try {
    await main(argv);
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
