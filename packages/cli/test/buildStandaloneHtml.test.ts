import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SourceFilePayload } from "@0xdoublesharp/doublcov-core";
import {
  buildReport,
  escapeHtmlRawText,
  inlineModuleScript,
  inlineStylesheets,
  makeIndexHtmlStandalone,
  replaceLiteralOnce,
} from "../src/build.js";
import {
  EMPTY_REPORT,
  FIXTURE_DIR,
  writeMinimalWebAssets,
} from "./buildTestHelpers.js";

describe("escapeHtmlRawText", () => {
  it("neutralizes a stray </style> in inlined CSS", () => {
    const escaped = escapeHtmlRawText(
      ".x{}/*</style><script>alert(1)*/",
      "style",
    );
    expect(escaped).not.toMatch(/<\/style/i);
    expect(escaped).toContain("<\\/style");
  });

  it("neutralizes a stray </script> in inlined JS, including weird casing", () => {
    const escaped = escapeHtmlRawText(
      'const s = "</ScRiPt>"; const t = "</script>";',
      "script",
    );
    expect(escaped).not.toMatch(/<\/script/i);
  });

  it("does not touch the other element name", () => {
    expect(escapeHtmlRawText("</style>", "script")).toBe("</style>");
  });

  it("escapes </script regardless of trailing character", () => {
    expect(escapeHtmlRawText("a</script ", "script")).not.toMatch(/<\/script/);
    expect(escapeHtmlRawText("a</script\t", "script")).not.toMatch(/<\/script/);
    expect(escapeHtmlRawText("a</script\n", "script")).not.toMatch(/<\/script/);
    expect(escapeHtmlRawText("a</script>", "script")).not.toMatch(/<\/script/);
    expect(escapeHtmlRawText("a</script", "script")).not.toMatch(/<\/script/);
    expect(escapeHtmlRawText("a</scriptz", "script")).not.toMatch(/<\/script/);
  });

  it("escapes uppercase </STYLE> in inlined CSS", () => {
    const escaped = escapeHtmlRawText("/* </STYLE> */", "style");
    expect(escaped).not.toMatch(/<\/style/i);
    expect(escaped).toContain("<\\/style");
  });
});

describe("replaceLiteralOnce edge cases", () => {
  it("only replaces the first occurrence when the needle appears multiple times", () => {
    expect(replaceLiteralOnce("xx-xx-xx", "xx", "Y")).toBe("Y-xx-xx");
  });

  it("returns the original string when the needle is not found", () => {
    expect(replaceLiteralOnce("hello", "world", "X")).toBe("hello");
  });

  it("preserves the input when the needle is empty rather than prepending", () => {
    expect(replaceLiteralOnce("hello", "", "X")).toBe("hello");
  });
});

describe("inlineStylesheets", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-style-")),
    );
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("strips link-tag attributes by replacing the entire tag", async () => {
    await mkdir(path.join(workspace, "assets"), { recursive: true });
    await writeFile(
      path.join(workspace, "assets", "x.css"),
      ".a{color:red}",
      "utf8",
    );
    const inlined = await inlineStylesheets(
      [
        "<head>",
        '<link rel="stylesheet" crossorigin integrity="sha384-x" href="./assets/x.css">',
        "</head>",
      ].join("\n"),
      workspace,
    );
    expect(inlined).not.toMatch(/<link\b/);
    expect(inlined).not.toContain("crossorigin");
    expect(inlined).not.toContain("integrity");
    expect(inlined).toContain("<style>");
    expect(inlined).toContain(".a{color:red}");
  });

  it("escapes uppercase </STYLE> sequences inside inlined CSS", async () => {
    await mkdir(path.join(workspace, "assets"), { recursive: true });
    await writeFile(
      path.join(workspace, "assets", "x.css"),
      "/* </STYLE> */\n.x{}",
      "utf8",
    );
    const inlined = await inlineStylesheets(
      '<link rel="stylesheet" href="./assets/x.css">',
      workspace,
    );
    const closing = (inlined.match(/<\/style/gi) ?? []).length;
    expect(closing).toBe(1);
    expect(inlined).toContain("<\\/style");
  });

  it("skips link tags without an href attribute instead of throwing", async () => {
    const html = '<link rel="stylesheet">';
    const inlined = await inlineStylesheets(html, workspace);
    expect(inlined).toBe(html);
  });
});

describe("inlineModuleScript", () => {
  const sourcePayloads: SourceFilePayload[] = [];
  let workspace: string;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-script-")),
    );
    await mkdir(path.join(workspace, "assets"), { recursive: true });
    await writeFile(
      path.join(workspace, "assets", "app.js"),
      'console.log("hi");\n',
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("inlines the script even when src= comes before type=module", async () => {
    const html = '<script src="./assets/app.js" type="module"></script>';
    const inlined = await inlineModuleScript(
      html,
      workspace,
      EMPTY_REPORT,
      sourcePayloads,
    );
    expect(inlined).not.toContain('src="./assets/app.js"');
    expect(inlined).toContain('id="doublcov-report-data"');
    expect(inlined).toContain('id="doublcov-source-data"');
    expect(inlined).toContain('console.log("hi");');
  });

  it("inlines the script when type=module comes before src=", async () => {
    const html =
      '<script type="module" crossorigin src="./assets/app.js"></script>';
    const inlined = await inlineModuleScript(
      html,
      workspace,
      EMPTY_REPORT,
      sourcePayloads,
    );
    expect(inlined).not.toContain('src="./assets/app.js"');
    expect(inlined).toContain('console.log("hi");');
  });

  it("returns the original HTML when no module script is present", async () => {
    const html = '<script src="./assets/legacy.js"></script>';
    const inlined = await inlineModuleScript(
      html,
      workspace,
      EMPTY_REPORT,
      sourcePayloads,
    );
    expect(inlined).toBe(html);
  });

  it("returns the original HTML when the module script lacks a src", async () => {
    const html = '<script type="module"></script>';
    const inlined = await inlineModuleScript(
      html,
      workspace,
      EMPTY_REPORT,
      sourcePayloads,
    );
    expect(inlined).toBe(html);
  });
});

describe("makeIndexHtmlStandalone", () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-standalone-")),
    );
    await mkdir(path.join(outDir, "assets"), { recursive: true });
    await writeFile(
      path.join(outDir, "assets", "x.css"),
      ".body{color:red}",
      "utf8",
    );
    await writeFile(
      path.join(outDir, "assets", "x.js"),
      'window.__doublcov="ok";',
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("inlines stylesheet and module script and rewrites index.html in place", async () => {
    await writeFile(
      path.join(outDir, "index.html"),
      [
        "<!doctype html>",
        "<html><head>",
        '<link rel="stylesheet" href="./assets/x.css">',
        '<script type="module" src="./assets/x.js"></script>',
        "</head><body></body></html>",
      ].join("\n"),
      "utf8",
    );
    await makeIndexHtmlStandalone(outDir, EMPTY_REPORT, []);
    const after = await readFile(path.join(outDir, "index.html"), "utf8");
    expect(after).toContain(".body{color:red}");
    expect(after).toContain('window.__doublcov="ok";');
    expect(after).not.toMatch(/<link\b/);
    expect(after).not.toMatch(/src=".\/assets\/x\.js"/);
  });
});

describe("buildReport standalone HTML output", () => {
  let workspace: string;
  let originalCwd: string;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let originalWebAssetsDir: string | undefined;

  beforeEach(async () => {
    workspace = await realpath(
      await mkdtemp(path.join(tmpdir(), "doublcov-build-standalone-")),
    );
    await cp(FIXTURE_DIR, workspace, { recursive: true });
    await writeMinimalWebAssets(path.join(workspace, "web-assets"));
    originalWebAssetsDir = process.env.DOUBLCOV_WEB_ASSETS_DIR;
    process.env.DOUBLCOV_WEB_ASSETS_DIR = path.join(workspace, "web-assets");
    originalCwd = process.cwd();
    process.chdir(workspace);
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    if (originalWebAssetsDir === undefined) {
      delete process.env.DOUBLCOV_WEB_ASSETS_DIR;
    } else {
      process.env.DOUBLCOV_WEB_ASSETS_DIR = originalWebAssetsDir;
    }
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  function baseOptions() {
    return {
      lcov: path.join(workspace, "lcov.info"),
      sources: ["src"],
      sourceExtensions: [".sol"],
      out: path.join(workspace, "coverage", "report"),
      history: path.join(workspace, ".doublcov", "history.json"),
      port: 0,
      timeoutMs: 60_000,
      diagnostics: [],
      mode: "standalone" as const,
      open: false,
    };
  }

  it("inlines stylesheets and scripts without leaving external asset tags", async () => {
    const result = await buildReport(baseOptions());
    const indexHtml = await readFile(
      path.join(result.outDir, "index.html"),
      "utf8",
    );
    expect(indexHtml).not.toMatch(/<link[^>]*rel="stylesheet"/);
    expect(indexHtml).not.toMatch(/<script[^>]+type="module"[^>]+src=/);
    expect(indexHtml).toContain("<style>");
    expect(indexHtml).toContain('<script type="module">');
    expect(indexHtml).toContain('id="doublcov-report-data"');
  });

  it("does not introduce premature raw-text closing tags while inlining", async () => {
    const result = await buildReport(baseOptions());
    const indexHtml = await readFile(
      path.join(result.outDir, "index.html"),
      "utf8",
    );
    const closingStyle = (indexHtml.match(/<\/style>/g) ?? []).length;
    const openingStyle = (indexHtml.match(/<style>/g) ?? []).length;
    expect(closingStyle).toBe(openingStyle);

    const scriptOpens = (indexHtml.match(/<script\b[^>]*>/g) ?? []).length;
    const scriptCloses = (indexHtml.match(/<\/script>/g) ?? []).length;
    expect(scriptOpens).toBe(scriptCloses);
  });
});
