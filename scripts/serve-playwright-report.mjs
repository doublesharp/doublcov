// @ts-check
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const reportDir = path.join(repoRoot, ".tmp", "playwright-report");
const cliPath = path.join(repoRoot, "packages/cli/dist/index.js");
const port = Number(process.env.PORT ?? 60733);
/** @type {Record<string, string>} */
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

await rm(reportDir, { recursive: true, force: true });
await mkdir(reportDir, { recursive: true });

await run(process.execPath, [
  cliPath,
  "build",
  "--lcov",
  path.join(repoRoot, "fixtures/simple/lcov.info"),
  "--sources",
  path.join(repoRoot, "fixtures/simple/src"),
  "--out",
  reportDir,
  "--history",
  path.join(repoRoot, ".tmp", "playwright-history.json"),
  "--name",
  "Playwright Fixture",
  "--diagnostic",
  `foundry-debug:${path.join(repoRoot, "fixtures/simple/coverage.debug")}`,
]);

await injectUnsafeCustomization(path.join(reportDir, "data/report.json"));
await serveReport(reportDir, port);

/**
 * @param {string} reportPath
 * @returns {Promise<void>}
 */
async function injectUnsafeCustomization(reportPath) {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.customization = {
    defaultTheme: "unsafe-theme",
    themes: [
      {
        id: "unsafe-theme",
        label: "Unsafe Theme",
        mode: "dark",
        tokens: {
          bg: "url(javascript:alert(1))",
          text: "#ffffff",
        },
      },
    ],
    hooks: [
      {
        id: "unsafe-link",
        hook: "report:header",
        label: "Unsafe Link",
        href: "javascript:alert(1)",
      },
      {
        id: "safe-link",
        hook: "report:header",
        label: "Safe Link",
        href: "https://example.test/report",
      },
    ],
    plugins: [
      {
        id: "sidebar-note",
        hooks: [
          {
            id: "sidebar-note",
            hook: "sidebar:panel",
            label: "Plugin Note",
            content: "<strong>rendered as text</strong>",
          },
        ],
      },
    ],
  };
  if (Array.isArray(report.files) && report.files[0]) {
    report.files[0].sourceDataPath =
      "https://example.test/should-not-load.json";
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await replaceEmbeddedJson(
    path.join(path.dirname(path.dirname(reportPath)), "index.html"),
    "doublcov-report-data",
    report,
  );
}

/**
 * @param {string} indexPath
 * @param {string} elementId
 * @param {unknown} payload
 * @returns {Promise<void>}
 */
async function replaceEmbeddedJson(indexPath, elementId, payload) {
  const html = await readFile(indexPath, "utf8");
  const escaped = JSON.stringify(payload)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const pattern = new RegExp(
    `(<script type="application/json" id="${elementId}">)([\\s\\S]*?)(</script>)`,
  );
  await writeFile(
    indexPath,
    html.replace(
      pattern,
      (_match, openTag, _existing, closeTag) =>
        `${openTag}${escaped}${closeTag}`,
    ),
    "utf8",
  );
}

/**
 * @param {string} root
 * @param {number} serverPort
 * @returns {Promise<void>}
 */
function serveReport(root, serverPort) {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestPath = decodeURIComponent(request.url?.split("?")[0] ?? "/");
      const absolutePath = path.resolve(
        root,
        `.${requestPath === "/" ? "/index.html" : requestPath}`,
      );
      const relativePath = path.relative(root, absolutePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      response.setHeader(
        "content-type",
        contentTypes[path.extname(absolutePath)] ?? "application/octet-stream",
      );
      createReadStream(absolutePath)
        .on("error", () => {
          response.writeHead(404);
          response.end("Not found");
        })
        .pipe(response);
    });
    server.on("error", reject);
    server.listen(serverPort, "127.0.0.1", () => {
      process.stdout.write(
        `Serving Playwright report fixture at http://127.0.0.1:${serverPort}\n`,
      );
      resolve();
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} exited from signal ${signal}`
            : `${command} exited with status ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
