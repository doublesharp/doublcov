import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type BrowserOpenCommand = { command: string; args: string[] };

export function browserOpenCommand(target: string, os = platform()): BrowserOpenCommand {
  if (os === "darwin") return { command: "open", args: [target] };
  if (os === "win32") return { command: "cmd", args: ["/c", "start", "", target] };
  return { command: "xdg-open", args: [target] };
}

export async function openReport(reportDir: string, _port?: number): Promise<void> {
  const root = await fs.realpath(path.resolve(reportDir));
  const indexPath = path.join(root, "index.html");
  await fs.access(indexPath);
  const url = pathToFileURL(indexPath).href;
  process.stdout.write(`Opening ${indexPath}\n`);
  launchBrowser(url);
}

function launchBrowser(target: string): void {
  const opener = browserOpenCommand(target);
  const child = spawn(opener.command, opener.args, {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", (error) => {
    process.stderr.write(`Could not open browser automatically: ${error.message}\n`);
  });
  child.unref();
}
