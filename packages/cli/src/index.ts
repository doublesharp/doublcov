#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    // fileURLToPath only throws for non-file-protocol URLs; import.meta.url
    // is always a file:// URL when this module is loaded by Node, so this
    // branch is defensive belt-and-suspenders rather than a code path we can
    // reach from a vitest import. Returning false keeps the bin guard from
    // running run() in unexpected loaders (e.g. data: URLs in the future).
    return false;
  }
}

// The bin guard below is only true when this file was invoked directly as a
// script (`node dist/index.js`); when the test harness imports it as a
// module, isDirectExecution() returns false and the guarded `await run()`
// never executes. Covered by the bin-script smoke test in CI rather than by
// unit tests.
if (isDirectExecution()) {
  await run();
}
