// @ts-check
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(repoRoot, ".tmp", "playwright-report");
const cliPath = path.join(repoRoot, "packages/cli/dist/index.js");
const port = Number(process.env.PORT ?? 60733);

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
  `foundry-debug:${path.join(repoRoot, "fixtures/simple/coverage.debug")}`
]);

await injectUnsafeCustomization(path.join(reportDir, "data/report.json"));
await run(process.execPath, [cliPath, "open", reportDir, "--port", String(port)]);

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
          text: "#ffffff"
        }
      }
    ],
    hooks: [
      {
        id: "unsafe-link",
        hook: "report:header",
        label: "Unsafe Link",
        href: "javascript:alert(1)"
      },
      {
        id: "safe-link",
        hook: "report:header",
        label: "Safe Link",
        href: "https://example.test/report"
      }
    ],
    plugins: [
      {
        id: "sidebar-note",
        hooks: [
          {
            id: "sidebar-note",
            hook: "sidebar:panel",
            label: "Plugin Note",
            content: "<strong>rendered as text</strong>"
          }
        ]
      }
    ]
  };
  if (Array.isArray(report.files) && report.files[0]) {
    report.files[0].sourceDataPath = "https://example.test/should-not-load.json";
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
      reject(new Error(signal ? `${command} exited from signal ${signal}` : `${command} exited with status ${code ?? "unknown"}`));
    });
  });
}
