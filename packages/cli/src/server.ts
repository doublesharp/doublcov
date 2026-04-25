import { createReadStream, promises as fs } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import path from "node:path";
import type { Socket } from "node:net";
import { pathToFileURL } from "node:url";
import { DEFAULT_SERVE_TIMEOUT_MS, type ReportMode } from "./args.js";
import { injectServerLeasePrompt } from "./serverClient.js";
import {
  contentType,
  formatDuration,
  isInsideRoot,
} from "./serverHelpers.js";

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

export async function serveRequest(
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
    let realTarget: string;
    try {
      realTarget = await fs.realpath(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sendText(response, 404, "Not found");
        return;
      }
      throw error;
    }
    if (!isInsideRoot(realTarget, root)) {
      sendText(response, 403, "Forbidden");
      return;
    }
    const stat = await fs.stat(realTarget);
    if (stat.isDirectory()) {
      sendText(response, 403, "Forbidden");
      return;
    }
    const headers = {
      "content-type": contentType(realTarget),
      "cache-control": "no-store",
    };
    if (path.basename(realTarget) === "index.html") {
      const html = await fs.readFile(realTarget, "utf8");
      response.writeHead(200, headers);
      response.end(injectServerLeasePrompt(html, root));
      return;
    }
    response.writeHead(200, headers);
    createReadStream(realTarget).pipe(response);
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

export function serverStatus(state: ServerState): {
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
