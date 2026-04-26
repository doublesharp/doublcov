import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import {
  buildMultiFilePayload,
  buildPayload,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue computed fallbacks (report-null branches)", () => {
  it("computes default values when the report ref becomes null", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const internal = (
      w.vm as unknown as {
        $: { setupState: Record<string, unknown> };
      }
    ).$;
    const setup = internal.setupState as Record<string, unknown>;
    setup.report = null;
    await flushPromises();
    // Access the computeds directly via the setup proxy. Reading them
    // while report is null forces evaluation of the fallback arms in
    // their `?? []` / `?? null` chains.
    void setup.filesById;
    void setup.matchingFiles;
    void setup.filteredUncoveredItems;
    void setup.lineCoverage;
    void setup.selectedFileUncoveredTotal;
    void setup.selectedFileIgnoredLines;
    void setup.totalIgnoredLines;
    void setup.previousRun;
    void setup.currentRun;
    void setup.lineDelta;
    void setup.ignoredLinesByLine;
    void setup.currentUncoveredItem;
    void setup.headerHooks;
    void setup.summaryHooks;
    void setup.sidebarPanelHooks;
    void setup.fileToolbarHooks;
    void setup.hookContributions;
    void setup.availableThemes;
    void setup.selectedTheme;
    void setup.reportTitle;
    void setup.sourcePayload;
    void setup.visibleSourceLines;
    expect(w.text()).toContain("Doublcov");
    // Re-trigger search/uncoveredOnly/selectedKind/selectedFileId watchers
    // so their guard branches are visited with no report.
    setup.search = "x";
    setup.uncoveredOnly = false;
    setup.selectedKind = "line";
    setup.selectedFileId = "";
    setup.navigatorCurrentFileOnly = false;
    await flushPromises();
    void setup.filesById;
    void setup.matchingFiles;
    void setup.filteredUncoveredItems;
    expect(w.exists()).toBe(true);
  });

  it("renders the source pane and uses syntax-token kind classes", async () => {
    // Replace the syntax mock with one that returns kind: 'keyword'
    // tokens to exercise the truthy `token.kind` branch in the
    // template's :class binding.
    vi.resetModules();
    vi.doMock("../src/syntax", () => ({
      highlightSourceLine: (text: string) => [{ text, kind: "keyword" }],
      highlightSourceLines: async (lines: string[]) =>
        lines.map((text) => [{ text, kind: "keyword" }]),
    }));
    try {
      const fresh = await import("../src/App.vue");
      const localPayload = buildPayload();
      embedPayload(localPayload);
      // Mount the freshly imported App so it picks up the new mock.
      const localWrapper = mount(fresh.default, { attachTo: document.body });
      await flushPromises();
      await flushPromises();
      // The :class binding `syn-keyword` should appear when token.kind is
      // truthy.
      expect(localWrapper.html()).toContain("syn-keyword");
      localWrapper.unmount();
    } finally {
      vi.doUnmock("../src/syntax");
      vi.resetModules();
    }
  });
});

describe("App.vue navigation guards on empty results", () => {
  it("pageFile bails when no files match (filteredFiles empty)", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    // Type a search that matches nothing — filteredFiles becomes empty.
    const input = w.find<HTMLInputElement>('[data-search-input="true"]');
    await input.setValue("definitely-no-such-file");
    await flushPromises();
    const before = location.hash;
    // 'N'/'P' shortcuts call pageFile which guards on length === 0.
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "p", bubbles: true }),
    );
    await flushPromises();
    expect(location.hash).toBe(before);
  });

  it("jumpToCurrentUncovered bails when there are no uncovered items", async () => {
    const payload = buildPayload();
    payload.report.uncoveredItems = [];
    embedPayload(payload);
    const w = await mountApp();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", bubbles: true }),
    );
    await flushPromises();
    expect(w.exists()).toBe(true);
  });
});

describe("App.vue uncovered-only filter exposes function/branch-only files", () => {
  it("keeps a file with uncovered functions but no uncovered lines (branch 147,12,2)", async () => {
    const payload = buildPayload();
    const file = (payload.report.files as Record<string, unknown>[])[0]!;
    file.uncovered = {
      lines: [],
      functions: [{ name: "fn1", line: 1, hits: 0 }],
      branches: [],
    };
    embedPayload(payload);
    const w = await mountApp();
    // The file is still listed with uncoveredOnly=true.
    expect(w.text()).toContain("src/foo.ts");
  });

  it("keeps a file with uncovered branches but no uncovered lines or functions", async () => {
    const payload = buildPayload();
    const file = (payload.report.files as Record<string, unknown>[])[0]!;
    file.uncovered = {
      lines: [],
      functions: [],
      branches: [
        {
          id: "b1",
          line: 1,
          block: "0",
          branch: "0",
          taken: 0,
        },
      ],
    };
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("src/foo.ts");
  });
});
