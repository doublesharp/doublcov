#!/usr/bin/env node
import { parseCommand, helpText } from "./args.js";
import { buildReport } from "./build.js";
import { runCoverageBuilder } from "./builders/run.js";
import { openReport } from "./server.js";

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (command.name === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (command.name === "build") {
    const result = await buildReport(command.options);
    if (result.open) await openReport(result.outDir);
    return;
  }
  if (command.name === "builder") {
    await runCoverageBuilder(command.builder, command.options);
    return;
  }
  await openReport(command.reportDir, command.port);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
