import { describe, expect, it } from "vitest";
import type { CoverageReport } from "@0xdoublesharp/doublcov-core";
import {
  escapeJsonForHtml,
  formatGeneratedReportMessage,
  replaceLiteralOnce,
  sanitizeCustomization,
  sanitizeHistory,
} from "../src/build.js";

describe("sanitizeCustomization", () => {
  it("keeps valid declarative customization and strips unsafe hrefs or malformed entries", () => {
    expect(
      sanitizeCustomization({
        defaultTheme: " custom ",
        themes: [
          {
            id: "custom",
            label: "Custom",
            mode: "dark",
            tokens: {
              bg: "#000000",
              accent: "url(javascript:alert(1))",
              unknown: "#ffffff",
            },
          },
          { id: "bad" },
        ],
        hooks: [
          {
            id: "docs",
            hook: "report:header",
            label: "Docs",
            href: "https://example.test/docs",
          },
          {
            id: "bad-link",
            hook: "report:header",
            label: "Bad",
            href: "javascript:alert(1)",
          },
          {
            id: "label",
            hook: "report:header",
            label: "Label",
            content: "no link",
          },
          {
            id: "bad-hook",
            hook: "report:unknown",
            label: "Bad",
          },
        ],
        plugins: [
          {
            id: "ci",
            hooks: [
              {
                id: "run",
                hook: "file:toolbar",
                label: "Run",
                href: "/runs/1",
              },
            ],
          },
        ],
      }),
    ).toEqual({
      defaultTheme: "custom",
      themes: [
        {
          id: "custom",
          label: "Custom",
          mode: "dark",
          tokens: {
            bg: "#000000",
          },
        },
      ],
      hooks: [
        {
          id: "docs",
          hook: "report:header",
          label: "Docs",
          href: "https://example.test/docs",
        },
        {
          id: "bad-link",
          hook: "report:header",
          label: "Bad",
        },
        {
          id: "label",
          hook: "report:header",
          label: "Label",
          content: "no link",
        },
      ],
      plugins: [
        {
          id: "ci",
          hooks: [
            {
              id: "run",
              hook: "file:toolbar",
              label: "Run",
              href: "/runs/1",
            },
          ],
        },
      ],
    });
  });
});

describe("sanitizeHistory", () => {
  it("returns undefined for non-object inputs", () => {
    expect(sanitizeHistory(null)).toBeUndefined();
    expect(sanitizeHistory("not history")).toBeUndefined();
    expect(sanitizeHistory(42)).toBeUndefined();
    expect(sanitizeHistory([])).toBeUndefined();
  });

  it("returns undefined when runs is missing or not an array", () => {
    expect(sanitizeHistory({})).toBeUndefined();
    expect(sanitizeHistory({ runs: "nope" })).toBeUndefined();
    expect(sanitizeHistory({ schemaVersion: 1, runs: 7 })).toBeUndefined();
  });

  it("drops malformed run entries while keeping well-formed ones", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "abc",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 0, hit: 0, percent: 0 },
            branches: { found: 0, hit: 0, percent: 0 },
          },
          files: [],
        },
        { id: "missing-timestamp" },
        "not an object",
      ],
    });
    expect(result?.runs).toHaveLength(1);
    expect(result?.runs[0]?.id).toBe("abc");
  });

  it("drops a run whose totals contain non-numeric values", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "bad-totals",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: {
            lines: { found: "10", hit: 5, percent: 50 },
            functions: { found: 0, hit: 0, percent: 0 },
            branches: { found: 0, hit: 0, percent: 0 },
          },
          files: [],
        },
      ],
    });
    expect(result?.runs).toHaveLength(0);
  });

  it("drops a run whose totals field is not an object", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "no-totals-object",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: "not-an-object",
          files: [],
        },
      ],
    });
    expect(result?.runs).toHaveLength(0);
  });

  it("drops malformed file entries inside a run while keeping well-formed ones", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "abc",
          timestamp: "2026-04-24T00:00:00.000Z",
          commit: "deadbeef",
          branch: "main",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 0, hit: 0, percent: 0 },
            branches: { found: 0, hit: 0, percent: 0 },
          },
          files: [
            {
              path: "src/a.ts",
              lines: { found: 4, hit: 2, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
              branches: { found: 0, hit: 0, percent: 0 },
              uncovered: { lines: 2, functions: 0, branches: 0 },
            },
            {
              lines: { found: 4, hit: 2, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
              branches: { found: 0, hit: 0, percent: 0 },
            },
            {
              path: "src/b.ts",
              lines: { found: 4, hit: 2, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
            },
            "not an object",
          ],
        },
      ],
    });
    expect(result?.runs).toHaveLength(1);
    const run = result?.runs[0];
    expect(run?.commit).toBe("deadbeef");
    expect(run?.branch).toBe("main");
    expect(run?.files).toHaveLength(1);
    expect(run?.files[0]).toMatchObject({
      path: "src/a.ts",
      uncovered: { lines: 2, functions: 0, branches: 0 },
    });
  });

  it("defaults uncovered counts to 0 when uncovered is missing or has wrong types", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "abc",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 0, hit: 0, percent: 0 },
            branches: { found: 0, hit: 0, percent: 0 },
          },
          files: [
            {
              path: "src/a.ts",
              lines: { found: 4, hit: 2, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
              branches: { found: 0, hit: 0, percent: 0 },
            },
            {
              path: "src/b.ts",
              lines: { found: 4, hit: 2, percent: 50 },
              functions: { found: 0, hit: 0, percent: 0 },
              branches: { found: 0, hit: 0, percent: 0 },
              uncovered: { lines: "2", functions: null, branches: undefined },
            },
          ],
        },
      ],
    });
    const files = result?.runs[0]?.files ?? [];
    expect(files).toHaveLength(2);
    expect(files[0]?.uncovered).toEqual({
      lines: 0,
      functions: 0,
      branches: 0,
    });
    expect(files[1]?.uncovered).toEqual({
      lines: 0,
      functions: 0,
      branches: 0,
    });
  });

  it("treats run.files as empty when it is not an array", () => {
    const result = sanitizeHistory({
      schemaVersion: 1,
      runs: [
        {
          id: "abc",
          timestamp: "2026-04-24T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 0, hit: 0, percent: 0 },
            branches: { found: 0, hit: 0, percent: 0 },
          },
          files: "not-an-array",
        },
      ],
    });
    expect(result?.runs[0]?.files).toEqual([]);
  });
});

describe("escapeJsonForHtml", () => {
  it("keeps embedded JSON from closing its script tag", () => {
    const escaped = escapeJsonForHtml(
      JSON.stringify({ source: "</script><script>alert(1)</script>" }),
    );
    expect(escaped).not.toContain("</script>");
    expect(JSON.parse(escaped)).toEqual({
      source: "</script><script>alert(1)</script>",
    });
  });
});

describe("replaceLiteralOnce", () => {
  it("does not expand dollar tokens from inlined assets", () => {
    expect(
      replaceLiteralOnce(
        '<script src="app.js"></script>',
        '<script src="app.js"></script>',
        "x$&y$1",
      ),
    ).toBe("x$&y$1");
  });
});

describe("formatGeneratedReportMessage", () => {
  it("prints the absolute index.html path", () => {
    const report = {
      files: [{ id: "one" }, { id: "two" }],
      uncoveredItems: [{ id: "gap" }],
    } as CoverageReport;
    const message = formatGeneratedReportMessage(
      report,
      "/tmp/doublcov/report",
    );

    expect(message).toContain(
      "Generated 2 file report with 1 uncovered items at /tmp/doublcov/report",
    );
    expect(message).toContain("Open report: /tmp/doublcov/report/index.html");
    expect(message).not.toContain("file://");

    const staticMessage = formatGeneratedReportMessage(
      report,
      "/tmp/doublcov/report",
      "static",
    );
    expect(staticMessage).toContain(
      "Open report: doublcov open /tmp/doublcov/report",
    );
    expect(staticMessage).toContain(
      "Static index: /tmp/doublcov/report/index.html",
    );
  });
});
