import { createReadStream, promises as fs } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import path from "node:path";
import type { Socket } from "node:net";
import { pathToFileURL } from "node:url";
import { DEFAULT_SERVE_TIMEOUT_MS, type ReportMode } from "./args.js";

export type BrowserOpenCommand = { command: string; args: string[] };

export interface OpenReportOptions {
  mode?: ReportMode;
  port?: number;
  timeoutMs?: number;
}

export interface ServeReportOptions {
  port?: number;
  timeoutMs?: number;
  open?: boolean;
}

interface ServerState {
  timeoutMs: number;
  deadline: number;
  shutdownListeners: Set<() => void>;
}

export function browserOpenCommand(
  target: string,
  os = platform(),
): BrowserOpenCommand {
  if (os === "darwin") return { command: "open", args: [target] };
  if (os === "win32")
    return { command: "cmd", args: ["/c", "start", "", target] };
  return { command: "xdg-open", args: [target] };
}

export async function openReport(
  reportDir: string,
  options: OpenReportOptions = {},
): Promise<void> {
  const root = await fs.realpath(path.resolve(reportDir));
  const indexPath = path.join(root, "index.html");
  await fs.access(indexPath);

  const mode = options.mode ?? (await detectReportMode(indexPath));
  if (mode === "static") {
    await serveReport(root, {
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
      open: true,
    });
    return;
  }

  const url = pathToFileURL(indexPath).href;
  process.stdout.write(`Opening ${indexPath}\n`);
  launchBrowser(url);
}

export async function serveReport(
  reportDir: string,
  options: ServeReportOptions = {},
): Promise<void> {
  const root = await fs.realpath(path.resolve(reportDir));
  const indexPath = path.join(root, "index.html");
  await fs.access(indexPath);

  const sockets = new Set<Socket>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_SERVE_TIMEOUT_MS;
  const state: ServerState = {
    timeoutMs,
    deadline: timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY,
    shutdownListeners: new Set(),
  };
  const server = createServer((request, response) => {
    void serveRequest(root, state, request.url ?? "/", response);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not determine local server address.");
  const url = `http://127.0.0.1:${address.port}/`;
  process.stdout.write(`Serving ${root}\n`);
  process.stdout.write(`URL: ${url}\n`);
  if (timeoutMs > 0)
    process.stdout.write(
      `Server will stop after ${formatDuration(timeoutMs)} unless extended in the browser.\n`,
    );
  process.stdout.write("Press Ctrl+C to stop.\n");
  if (options.open ?? true) launchBrowser(url);

  await waitForShutdown(server, sockets, state);
}

async function detectReportMode(indexPath: string): Promise<ReportMode> {
  const html = await fs.readFile(indexPath, "utf8");
  return html.includes('id="doublcov-report-data"') ? "standalone" : "static";
}

async function serveRequest(
  root: string,
  state: ServerState,
  requestUrl: string,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(requestUrl, "http://127.0.0.1/");
    if (url.pathname === "/__doublcov/status") {
      sendJson(response, serverStatus(state));
      return;
    }
    if (url.pathname === "/__doublcov/extend") {
      state.deadline =
        state.timeoutMs > 0
          ? Date.now() + state.timeoutMs
          : Number.POSITIVE_INFINITY;
      sendJson(response, serverStatus(state));
      return;
    }
    if (url.pathname === "/__doublcov/events") {
      serveEvents(response, state);
      return;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const targetPath = path.resolve(
      root,
      decodedPath === "/" ? "index.html" : `.${decodedPath}`,
    );
    if (!isInsideRoot(targetPath, root)) {
      sendText(response, 403, "Forbidden");
      return;
    }
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      sendText(response, 403, "Forbidden");
      return;
    }
    const headers = {
      "content-type": contentType(targetPath),
      "cache-control": "no-store",
    };
    if (path.basename(targetPath) === "index.html") {
      const html = await fs.readFile(targetPath, "utf8");
      response.writeHead(200, headers);
      response.end(injectServerLeasePrompt(html, root));
      return;
    }
    response.writeHead(200, headers);
    createReadStream(targetPath).pipe(response);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    sendText(response, 500, "Internal server error");
  }
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendText(
  response: ServerResponse,
  status: number,
  text: string,
): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function serverStatus(state: ServerState): {
  remainingMs: number;
  timeoutMs: number;
} {
  const remainingMs = Number.isFinite(state.deadline)
    ? Math.max(0, state.deadline - Date.now())
    : 0;
  return { remainingMs, timeoutMs: state.timeoutMs };
}

function serveEvents(response: ServerResponse, state: ServerState): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  response.write(
    `event: status\ndata: ${JSON.stringify(serverStatus(state))}\n\n`,
  );
  const notify = (): void => {
    response.write(
      `event: shutdown\ndata: ${JSON.stringify({ message: "Server stopped." })}\n\n`,
    );
    response.end();
  };
  state.shutdownListeners.add(notify);
  response.on("close", () => state.shutdownListeners.delete(notify));
}

function isInsideRoot(targetPath: string, root: string): boolean {
  const relative = path.relative(root, targetPath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs")
    return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

function waitForShutdown(
  server: ReturnType<typeof createServer>,
  sockets: Set<Socket>,
  state: ServerState,
): Promise<void> {
  return new Promise((resolve) => {
    let shuttingDown = false;
    let timeout: NodeJS.Timeout | undefined;
    const shutdown = (): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      if (timeout) clearTimeout(timeout);
      process.stdout.write("Stopping report server...\n");
      for (const listener of state.shutdownListeners) listener();
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
        process.off(signal, shutdown);
      server.close(() => resolve());
      setTimeout(() => {
        for (const socket of sockets) socket.destroy();
      }, 250);
    };

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
      process.once(signal, shutdown);
    if (state.timeoutMs > 0) {
      const checkDeadline = (): void => {
        const remaining = state.deadline - Date.now();
        if (remaining <= 0) {
          shutdown();
          return;
        }
        timeout = setTimeout(checkDeadline, Math.min(remaining, 1000));
      };
      timeout = setTimeout(checkDeadline, Math.min(state.timeoutMs, 1000));
    }
  });
}

function injectServerLeasePrompt(html: string, reportDir: string): string {
  const restartCommand = `doublcov open ${shellQuote(reportDir)}`;
  const script = `<script>
(() => {
  const restartCommand = ${JSON.stringify(restartCommand)};
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:12px 14px;border:1px solid #334155;border-radius:8px;background:#111827;color:#e5e7eb;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)";
  root.hidden = true;
  const text = document.createElement("div");
  const command = document.createElement("code");
  command.style.cssText = "display:block;margin-top:8px;padding:6px 8px;border-radius:6px;background:#020617;color:#bfdbfe;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-all";
  command.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Extend session";
  button.style.cssText = "margin-top:8px;padding:6px 10px;border:1px solid #60a5fa;border-radius:6px;background:#1d4ed8;color:white;font:inherit;cursor:pointer";
  root.append(text, command, button);
  document.addEventListener("DOMContentLoaded", () => document.body.append(root));

  const warningWindowMs = 10 * 60 * 1000;
  const format = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? minutes + "m " + String(seconds).padStart(2, "0") + "s" : seconds + "s";
  };
  let serverConfirmed = false;
  const render = (status) => {
    if (!status || !status.timeoutMs) return;
    serverConfirmed = true;
    if (status.remainingMs > warningWindowMs) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    text.textContent = "Local report server stops in " + format(status.remainingMs) + ".";
  };
  const stopped = () => {
    if (!serverConfirmed) {
      root.remove();
      return;
    }
    root.hidden = false;
    text.textContent = "The local report server has stopped. Run doublcov open again to reload source data.";
    command.textContent = restartCommand;
    command.hidden = false;
    button.hidden = true;
  };
  const refresh = async () => {
    try {
      const response = await fetch("/__doublcov/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status failed");
      render(await response.json());
    } catch {
      stopped();
    }
  };
  button.addEventListener("click", async () => {
    const response = await fetch("/__doublcov/extend", { method: "POST", cache: "no-store" });
    if (response.ok) render(await response.json());
  });
  if ("EventSource" in window) {
    const events = new EventSource("/__doublcov/events");
    events.addEventListener("shutdown", stopped);
    events.onerror = () => {
      events.close();
      stopped();
    };
  }
  refresh();
  setInterval(refresh, 5000);
})();
</script>`;
  return html.includes("</body>")
    ? html.replace("</body>", `${script}\n</body>`)
    : `${html}\n${script}`;
}

function formatDuration(ms: number): string {
  if (ms % (60 * 60 * 1000) === 0) return `${ms / (60 * 60 * 1000)}h`;
  if (ms % (60 * 1000) === 0) return `${ms / (60 * 1000)}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function launchBrowser(target: string): void {
  const opener = browserOpenCommand(target);
  const child = spawn(opener.command, opener.args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", (error) => {
    process.stderr.write(
      `Could not open browser automatically: ${error.message}\n`,
    );
  });
  child.unref();
}
