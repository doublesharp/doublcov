import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export type ResolveAttempt =
  | { kind: "ok"; realPath: string }
  | { kind: "forbidden" }
  | { kind: "not-found" };

export type RequestPath =
  | { kind: "ok"; path: string }
  | { kind: "bad-request" };

export function normalizeRequestPath(requestUrl: string | undefined): RequestPath {
  try {
    const rawPath = decodeURIComponent(requestUrl?.split("?")[0] ?? "/");
    return { kind: "ok", path: rawPath === "/" ? "/index.html" : rawPath };
  } catch {
    return { kind: "bad-request" };
  }
}

export async function resolveServedPath(root: string, requestPath: string): Promise<ResolveAttempt> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    return { kind: "not-found" };
  }

  const candidatePath = path.resolve(realRoot, `.${requestPath}`);
  let realPath: string;
  try {
    realPath = await fs.realpath(candidatePath);
  } catch {
    return { kind: "not-found" };
  }
  const relative = path.relative(realRoot, realPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { kind: "forbidden" };
  }
  try {
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) return { kind: "not-found" };
  } catch {
    return { kind: "not-found" };
  }
  return { kind: "ok", realPath };
}

export async function openReport(reportDir: string, port: number): Promise<void> {
  const root = await fs.realpath(path.resolve(reportDir));
  await fs.access(path.join(root, "index.html"));

  const server = createServer(async (request, response) => {
    const requestedPath = normalizeRequestPath(request.url);
    if (requestedPath.kind === "bad-request") {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    const result = await resolveServedPath(root, requestedPath.path);

    if (result.kind === "forbidden") {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (result.kind === "not-found") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(result.realPath)] ?? "application/octet-stream"
    });
    createReadStream(result.realPath).pipe(response);
  });

  server.on("error", (error) => {
    process.stderr.write(`Could not start preview server: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Serving ${root} at http://127.0.0.1:${port}\n`);
  });
}
