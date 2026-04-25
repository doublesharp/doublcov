import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  contentType,
  formatDuration,
  isInsideRoot,
  shellQuote,
} from "../src/serverHelpers.js";
import { injectServerLeasePrompt } from "../src/serverClient.js";

describe("isInsideRoot", () => {
  const root = path.resolve("/tmp/report-root");

  it("returns true for the root itself", () => {
    expect(isInsideRoot(root, root)).toBe(true);
  });

  it("returns true for a child path", () => {
    expect(isInsideRoot(path.join(root, "index.html"), root)).toBe(true);
    expect(isInsideRoot(path.join(root, "data", "report.json"), root)).toBe(
      true,
    );
  });

  it("returns false for a sibling that shares a prefix", () => {
    expect(isInsideRoot("/tmp/report-root-evil/file", root)).toBe(false);
  });

  it("returns false for a parent escape", () => {
    expect(isInsideRoot("/tmp/elsewhere", root)).toBe(false);
  });
});

describe("contentType", () => {
  it("recognizes the documented extensions", () => {
    expect(contentType("foo.html")).toBe("text/html; charset=utf-8");
    expect(contentType("foo.js")).toBe("text/javascript; charset=utf-8");
    expect(contentType("foo.mjs")).toBe("text/javascript; charset=utf-8");
    expect(contentType("foo.css")).toBe("text/css; charset=utf-8");
    expect(contentType("foo.json")).toBe("application/json; charset=utf-8");
    expect(contentType("foo.svg")).toBe("image/svg+xml");
    expect(contentType("foo.png")).toBe("image/png");
    expect(contentType("foo.wasm")).toBe("application/wasm");
  });

  it("is case-insensitive on the extension", () => {
    expect(contentType("foo.HTML")).toBe("text/html; charset=utf-8");
    expect(contentType("FOO.PNG")).toBe("image/png");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(contentType("foo.bin")).toBe("application/octet-stream");
    expect(contentType("README")).toBe("application/octet-stream");
  });
});

describe("formatDuration", () => {
  it("uses h/m/s units when the value divides evenly", () => {
    expect(formatDuration(60 * 60 * 1000)).toBe("1h");
    expect(formatDuration(2 * 60 * 60 * 1000)).toBe("2h");
    expect(formatDuration(5 * 60 * 1000)).toBe("5m");
    expect(formatDuration(30 * 1000)).toBe("30s");
  });

  it("falls back to ms for non-divisible values", () => {
    expect(formatDuration(1500)).toBe("1500ms");
    expect(formatDuration(123)).toBe("123ms");
  });

  it("does not collapse 0 to 0h (regression)", () => {
    // 0 is divisible by every unit; the largest-unit greedy match would say "0h".
    // We want a stable, meaningful result for 0.
    expect(formatDuration(0)).toBe("0ms");
  });

  it("handles values that fall between unit boundaries", () => {
    expect(formatDuration(999)).toBe("999ms");
    expect(formatDuration(60_001)).toBe("60001ms");
    expect(formatDuration(3_600_001)).toBe("3600001ms");
  });
});

describe("shellQuote", () => {
  it("does not quote a clean identifier-style path", () => {
    expect(shellQuote("/tmp/report")).toBe("/tmp/report");
    expect(shellQuote("coverage/report")).toBe("coverage/report");
    expect(shellQuote("a-b_c.d")).toBe("a-b_c.d");
  });

  it("single-quotes paths with spaces or shell metacharacters", () => {
    expect(shellQuote("with space")).toBe("'with space'");
    expect(shellQuote("a$b")).toBe("'a$b'");
    expect(shellQuote("`back`")).toBe("'`back`'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes the empty string so it doesn't disappear in argv", () => {
    // The regex requires at least one char, so empty must be wrapped.
    expect(shellQuote("")).toBe("''");
  });

  it("handles a single-quote-only string", () => {
    expect(shellQuote("'")).toBe("''\\'''");
  });

  it("preserves backslashes verbatim inside single quotes", () => {
    expect(shellQuote("a\\b")).toBe("'a\\b'");
  });

  it("survives mixed double/single quotes and backslashes", () => {
    expect(shellQuote(`a"b'c\\d`)).toBe(`'a"b'\\''c\\d'`);
  });
});

describe("injectServerLeasePrompt", () => {
  it("inserts the script before the closing </body> tag when present", () => {
    const result = injectServerLeasePrompt(
      "<html><body>hello</body></html>",
      "/tmp/report",
    );
    expect(result).toContain("</body>");
    expect(result.indexOf("<script>")).toBeLessThan(result.indexOf("</body>"));
    expect(result).toContain("doublcov open /tmp/report");
  });

  it("appends the script when no </body> tag exists", () => {
    const result = injectServerLeasePrompt("<html>broken</html>", "/tmp/r");
    expect(result.startsWith("<html>broken</html>")).toBe(true);
    expect(result).toContain("<script>");
  });

  it("escapes the report directory inside the embedded script", () => {
    const result = injectServerLeasePrompt(
      "<html><body></body></html>",
      "/tmp/with space/report",
    );
    expect(result).toContain("'/tmp/with space/report'");
  });

  it("safely encodes a directory containing a closing-script-tag attempt", () => {
    const result = injectServerLeasePrompt(
      "<html><body></body></html>",
      "/tmp/</script><img src=x onerror=alert(1)>/r",
    );
    expect(result).not.toMatch(/<script[^>]*>[^<]*<\/script>\s*<img/);
  });

  it("only replaces the first </body> when multiple exist", () => {
    // Documents current behavior: a string-replace replaces the first match only.
    const html = "<html><body>a</body><body>b</body></html>";
    const result = injectServerLeasePrompt(html, "/tmp/r");
    // The injected script should appear before the FIRST </body>.
    const firstBody = result.indexOf("</body>");
    const scriptIdx = result.indexOf("<script>");
    expect(scriptIdx).toBeGreaterThanOrEqual(0);
    expect(scriptIdx).toBeLessThan(firstBody);
    // And the second </body> must still exist (only first replaced).
    expect(result.lastIndexOf("</body>")).toBeGreaterThan(firstBody);
  });

  it("survives quotes, apostrophes, backslashes, and newlines in the report path", () => {
    const weird = `path/with"quote/and'apos\\backslash\nnewline`;
    const result = injectServerLeasePrompt("<html><body></body></html>", weird);
    // The JSON-encoded restartCommand must survive a JSON.parse round trip
    // when extracted from the script body (i.e. it's valid embedded JSON).
    const match = result.match(/const restartCommand = (.+);\n/);
    expect(match).not.toBeNull();
    const decoded = JSON.parse(
      (match as RegExpMatchArray)[1]
        .replaceAll("\\u003c", "<")
        .replaceAll("\\u003e", ">")
        .replaceAll("\\u0026", "&"),
    ) as string;
    // We expect the decoded command to begin with "doublcov open " and contain
    // a single-quoted, shell-escaped form of the weird path.
    expect(decoded.startsWith("doublcov open ")).toBe(true);
    // Newline must not appear as a raw newline in the embedded JSON literal.
    expect((match as RegExpMatchArray)[1]).not.toContain("\n");
  });

  it("does not introduce a literal </script> when path contains </script>", () => {
    const result = injectServerLeasePrompt(
      "<html><body></body></html>",
      "</script><script>alert(1)</script>",
    );
    // Count </script> occurrences — there must be exactly one (the closing one
    // belonging to the injected <script>...).
    const closeCount = result.match(/<\/script>/g)?.length ?? 0;
    expect(closeCount).toBe(1);
  });
});
