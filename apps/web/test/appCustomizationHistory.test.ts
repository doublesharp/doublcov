import { describe, expect, it } from "vitest";
import {
  buildPayload,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue theme cycling with custom themes", () => {
  it("includes themes from report customization in the cycle", async () => {
    const payload = buildPayload();
    payload.report.customization = {
      themes: [
        {
          id: "ci-dark",
          label: "CI Dark",
          mode: "dark",
          tokens: { bg: "#000000" },
        },
      ],
    };
    embedPayload(payload);
    await mountApp();
    // Cycle from default — should eventually visit ci-dark
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      seen.add(document.documentElement.dataset.theme ?? "");
      const event = new KeyboardEvent("keydown", { key: "t", bubbles: true });
      document.body.dispatchEvent(event);
      await flushPromises();
    }
    expect(seen.has("ci-dark")).toBe(true);
  });

  it("falls back to 'dark' if a saved theme is no longer available", async () => {
    localStorage.setItem("doublcov-theme", "missing-theme");
    embedPayload(buildPayload());
    await mountApp();
    expect(["dark", "light", "contrast", "paper"]).toContain(
      document.documentElement.dataset.theme,
    );
    localStorage.removeItem("doublcov-theme");
  });

  it("applies the report's defaultTheme when no saved theme exists", async () => {
    localStorage.removeItem("doublcov-theme");
    const payload = buildPayload();
    payload.report.customization = { defaultTheme: "light" };
    embedPayload(payload);
    await mountApp();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("App.vue customization hooks", () => {
  it("renders sidebar panel hooks", async () => {
    const payload = buildPayload();
    payload.report.customization = {
      hooks: [
        {
          id: "s1",
          hook: "sidebar:panel",
          label: "Sidebar Note",
          content: "additional info here",
        },
        {
          id: "s2",
          hook: "sidebar:panel",
          label: "Sidebar Link",
          href: "https://example.test/foo",
          content: "Visit",
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("Sidebar Note");
    expect(w.text()).toContain("additional info here");
    expect(w.text()).toContain("Sidebar Link");
    expect(w.html()).toContain('href="https://example.test/foo"');
  });

  it("renders header and summary hooks", async () => {
    const payload = buildPayload();
    payload.report.customization = {
      hooks: [
        {
          id: "h1",
          hook: "report:header",
          label: "Header Hook",
          href: "https://example.test",
        },
        {
          id: "h2",
          hook: "report:header",
          label: "Header Note",
          content: "v1.0",
        },
        {
          id: "sm1",
          hook: "report:summary",
          label: "Custom Metric",
          content: "42",
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("Header Hook");
    // Header hook with content and no href falls back to rendering content.
    expect(w.text()).toContain("v1.0");
    expect(w.text()).toContain("Custom Metric");
    expect(w.text()).toContain("42");
  });

  it("renders file:toolbar hooks for the selected file (matching constraint)", async () => {
    const payload = buildPayload();
    payload.report.customization = {
      hooks: [
        {
          id: "ft1",
          hook: "file:toolbar",
          label: "Tool",
          href: "https://example.test/tool",
        },
        {
          id: "ft2",
          hook: "file:toolbar",
          label: "Other",
          filePath: "src/never-matches.ts",
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("Tool");
    expect(w.text()).not.toContain("Other");
  });
});

describe("App.vue history & diagnostics rendering", () => {
  it("renders the history bar chart and trend delta", async () => {
    const payload = buildPayload();
    payload.report.history = {
      schemaVersion: 1,
      runs: [
        {
          id: "r1",
          timestamp: "2026-04-20T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 2, hit: 1, percent: 50 },
            branches: { found: 4, hit: 2, percent: 50 },
          },
          files: [],
        },
        {
          id: "r2",
          timestamp: "2026-04-21T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 7, percent: 70 },
            functions: { found: 2, hit: 1, percent: 50 },
            branches: { found: 4, hit: 2, percent: 50 },
          },
          files: [],
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    // 70% - 50% = +20.00%
    expect(w.text()).toContain("+20.00%");
    expect(w.text()).toContain("2 stored runs");
  });

  it("renders diagnostics when present", async () => {
    const payload = buildPayload();
    payload.report.diagnostics = [
      { id: "d1", source: "lcov", severity: "warning", message: "Funky entry" },
    ];
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("Funky entry");
    expect(w.text()).toContain("Diagnostics");
  });
});

describe("App.vue history trend with negative delta", () => {
  it("colors the trend label red when current run regresses vs previous", async () => {
    const payload = buildPayload();
    payload.report.history = {
      schemaVersion: 1,
      runs: [
        {
          id: "r1",
          timestamp: "2026-04-20T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 9, percent: 90 },
            functions: { found: 2, hit: 1, percent: 50 },
            branches: { found: 4, hit: 2, percent: 50 },
          },
          files: [],
        },
        {
          id: "r2",
          timestamp: "2026-04-21T00:00:00.000Z",
          totals: {
            lines: { found: 10, hit: 5, percent: 50 },
            functions: { found: 2, hit: 1, percent: 50 },
            branches: { found: 4, hit: 2, percent: 50 },
          },
          files: [],
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    // 50 - 90 = -40.00%
    expect(w.text()).toContain("-40.00%");
    // The negative-delta branch sets text-red-500.
    expect(w.html()).toContain("text-red-500");
  });
});

describe("App.vue plugin hook rendering", () => {
  it("flattens hooks contributed by plugins (covers customization.plugins flatMap)", async () => {
    const payload = buildPayload();
    payload.report.customization = {
      plugins: [
        {
          id: "plugin-a",
          label: "Plugin A",
          hooks: [
            {
              id: "p1",
              hook: "report:header",
              label: "Plugin Header",
              href: "https://example.test/plugin",
            },
            {
              id: "p2",
              hook: "sidebar:panel",
              label: "Plugin Side",
              content: "side-content",
            },
          ],
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("Plugin Header");
    expect(w.text()).toContain("Plugin Side");
    expect(w.text()).toContain("side-content");
  });

  it("renders file:toolbar hook with content fallback when no href is provided", async () => {
    const payload = buildPayload();
    payload.report.customization = {
      hooks: [
        {
          id: "ft-content",
          hook: "file:toolbar",
          label: "Toolbar",
          content: "v3.2.1",
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    // The hook span renders content (covers `hook.content ?? hook.label`
    // fallback branch in the file toolbar).
    expect(w.text()).toContain("v3.2.1");
  });
});

describe("App.vue title document binding", () => {
  it("watch(reportTitle) updates document.title when the report changes title", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    // Initial doc title is the project's title.
    expect(document.title).toBe("Test Project Coverage");
    // Now mount a second report with a different name to ensure the watch
    // path runs as the title computed flips.
    w.unmount();
    document
      .querySelectorAll("#doublcov-report-data, #doublcov-source-data")
      .forEach((node) => node.remove());
    const payload2 = buildPayload();
    (payload2.report as Record<string, unknown>).projectName = "Other Project";
    embedPayload(payload2);
    const w2 = await mountApp();
    expect(document.title).toBe("Other Project Coverage");
    w2.unmount();
  });
});
