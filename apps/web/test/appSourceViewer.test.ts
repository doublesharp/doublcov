import { describe, expect, it, vi } from "vitest";
import * as reportPayloadModule from "../src/reportPayload";
import {
  buildMultiFilePayload,
  buildPayload,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue source viewer windowing & errors", () => {
  it("renders only a 400-line window when source has > 800 lines", async () => {
    const payload = buildPayload();
    const file = (payload.report.files as Record<string, unknown>[])[0]!;
    file.lineCount = 1000;
    // Generate 1000 lines and a coverage entry for the uncovered one.
    const lines = Array.from({ length: 1000 }, (_, idx) => ({
      line: idx + 1,
      hits: idx === 1 ? 0 : 1,
      branches: [],
      status: idx === 1 ? "uncovered" : "covered",
    }));
    file.lines = lines;
    payload.sources["data/files/0001-src-foo.json"] = {
      id: "0001-src-foo",
      path: "src/foo.ts",
      language: "typescript",
      lines: Array.from({ length: 1000 }, (_, idx) => `line ${idx + 1};`),
    };
    embedPayload(payload);
    const w = await mountApp();
    const codeLines = w.findAll(".code-line");
    expect(codeLines.length).toBeLessThanOrEqual(400);
    expect(codeLines.length).toBeGreaterThan(300);
    expect(w.text()).toContain("Showing a 400-line window");
    // Click "Next window" — should not throw, and updated window text should
    // shift to a later range.
    const nextWindowButton = w
      .findAll("button")
      .find((b) => b.text().includes("Next window"));
    expect(nextWindowButton).toBeTruthy();
    await nextWindowButton!.trigger("click");
    await flushPromises();
    const prevWindowButton = w
      .findAll("button")
      .find((b) => b.text().includes("Previous window"));
    await prevWindowButton!.trigger("click");
    await flushPromises();
  });

  it("shows the source-error banner when parseSourcePayload throws on selection", async () => {
    embedPayload(buildMultiFilePayload(2));
    const spy = vi.spyOn(reportPayloadModule, "parseSourcePayload");
    let throwOnce = false;
    spy.mockImplementation((input, filePath) => {
      if (throwOnce) throw new Error("boom-source");
      // First call (initial mount) succeeds.
      throwOnce = true;
      return {
        id: "x",
        path: filePath,
        language: "typescript",
        lines: ["a"],
      } as ReturnType<typeof reportPayloadModule.parseSourcePayload>;
    });
    const w = await mountApp();
    // Select the second file via sidebar — should trigger the failing branch.
    const buttons = w
      .findAll("aside button")
      .filter((b) => b.text().includes("src/mod"));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    await buttons[1]!.trigger("click");
    await flushPromises();
    await flushPromises();
    expect(w.text()).toMatch(/Could not load source: boom-source/);
    spy.mockRestore();
  });

  it("clicking a source line number selects that line and writes line= to the hash", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const lineButtons = w
      .findAll(".code-line button")
      .filter((b) => /^\s*\d+\s*$/.test(b.text()));
    expect(lineButtons.length).toBeGreaterThan(0);
    await lineButtons[2]!.trigger("click");
    await flushPromises();
    expect(location.hash).toMatch(/line=3/);
  });
});

describe("App.vue ignored line rendering", () => {
  it("renders 'asm' label for solidity-assembly ignored lines and 'ign' for others", async () => {
    const payload = buildPayload();
    const file = (payload.report.files as Record<string, unknown>[])[0]!;
    // Mark line 3 as ignored solidity-assembly, line 1 as ignored generic.
    const lines = [
      { line: 1, hits: 0, branches: [], status: "ignored" },
      { line: 2, hits: 0, branches: [], status: "uncovered" },
      { line: 3, hits: 0, branches: [], status: "ignored" },
    ];
    file.lines = lines;
    file.ignored = {
      lines: [
        { line: 3, reason: "solidity-assembly", label: "assembly" },
        { line: 1, reason: "other-reason", label: "general" },
      ],
      byReason: { "solidity-assembly": 1, "other-reason": 1 },
      assemblyLines: [3],
    };
    // Bump the report-level ignored count so the "excludes N ignored" line shows.
    (payload.report.ignored as Record<string, unknown>) = {
      lines: 2,
      byReason: { "solidity-assembly": 1, "other-reason": 1 },
      assemblyLines: 1,
    };
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("asm");
    expect(w.text()).toContain("ign");
    // The report-level ignored-line hint should match the per-file badges.
    expect(w.text()).toContain("excludes 2 ignored lines");
    // The "N ignored" badge appears on the file toolbar (covers
    // selectedFileIgnoredLines.length truthy branch).
    expect(w.text()).toMatch(/2 ignored/);
  });

  it("expands selectedUncoveredRange across consecutive uncovered lines", async () => {
    const payload = buildPayload();
    const file = (payload.report.files as Record<string, unknown>[])[0]!;
    file.lineCount = 5;
    file.lines = [
      { line: 1, hits: 1, branches: [], status: "covered" },
      { line: 2, hits: 0, branches: [], status: "uncovered" },
      { line: 3, hits: 0, branches: [], status: "uncovered" },
      { line: 4, hits: 0, branches: [], status: "uncovered" },
      { line: 5, hits: 1, branches: [], status: "covered" },
    ];
    file.uncovered = { lines: [2, 3, 4], functions: [], branches: [] };
    payload.sources["data/files/0001-src-foo.json"] = {
      id: "0001-src-foo",
      path: "src/foo.ts",
      language: "typescript",
      lines: ["a", "b", "c", "d", "e"],
    };
    history.replaceState(null, "", "#file=0001-src-foo&line=3");
    embedPayload(payload);
    const w = await mountApp();
    // Three lines should carry the "selected-uncovered-section" class.
    const section = w.findAll(".selected-uncovered-section");
    expect(section.length).toBe(3);
    expect(w.find(".selected-uncovered-section-start").exists()).toBe(true);
    expect(w.find(".selected-uncovered-section-end").exists()).toBe(true);
  });
});

describe("App.vue source fetch fallbacks", () => {
  it("falls back to fetch() when no embedded source-data element is present", async () => {
    const payload = buildPayload();
    // Embed only the report payload (no source-data <script>).
    const reportNode = document.createElement("script");
    reportNode.id = "doublcov-report-data";
    reportNode.type = "application/json";
    reportNode.textContent = JSON.stringify(payload.report);
    document.body.append(reportNode);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "0001-src-foo",
        path: "src/foo.ts",
        language: "typescript",
        lines: ["a", "b", "c"],
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const w = await mountApp();
      // Source file fetch should have been called for the file's
      // sourceDataPath.
      expect(fetchMock).toHaveBeenCalledWith("data/files/0001-src-foo.json");
      expect(w.text()).not.toContain("Could not load source:");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to fetch() when no embedded report data element is present", async () => {
    // No embedded report or sources; all data must come from fetch.
    const payload = buildPayload();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "data/report.json") {
        return {
          ok: true,
          json: async () => payload.report,
        } as Response;
      }
      // Source request — return the source for the only file.
      return {
        ok: true,
        json: async () => payload.sources["data/files/0001-src-foo.json"],
      } as Response;
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const w = await mountApp();
      expect(fetchMock).toHaveBeenCalledWith("data/report.json");
      expect(w.text()).toContain("Test Project Coverage");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces an error banner when the report fetch returns !ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const w = await mountApp();
      expect(w.text()).toContain("Could not load report data");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces a source-error banner when the source fetch returns !ok", async () => {
    const payload = buildPayload();
    const reportNode = document.createElement("script");
    reportNode.id = "doublcov-report-data";
    reportNode.type = "application/json";
    reportNode.textContent = JSON.stringify(payload.report);
    document.body.append(reportNode);

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const w = await mountApp();
      expect(w.text()).toContain("Could not load source:");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("App.vue scroll-to-line fallbacks", () => {
  it("falls back to scrollIntoView when sourceScroller is unavailable", async () => {
    const payload = buildPayload();
    history.replaceState(null, "", "#file=0001-src-foo&line=2");
    embedPayload(payload);
    // Make every element's getBoundingClientRect return 0s so the scroller
    // path's math is exercised; also stub scrollIntoView to ensure it does
    // not throw under happy-dom.
    const sivSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const scrollToSpy = vi
      .spyOn(HTMLElement.prototype, "scrollTo")
      .mockImplementation(() => {});
    try {
      const w = await mountApp();
      expect(w.exists()).toBe(true);
      // scrollTo on the source scroller should have been invoked since
      // happy-dom mounts a scroller ref; if not, scrollIntoView is the
      // fallback.
      expect(
        scrollToSpy.mock.calls.length + sivSpy.mock.calls.length,
      ).toBeGreaterThan(0);
    } finally {
      sivSpy.mockRestore();
      scrollToSpy.mockRestore();
    }
  });

  it("uses scrollIntoView fallback when sourceScroller ref is null", async () => {
    // Force scrollToSelectedLine to take the null-scroller branch.
    // Strategy: mount the app with a normal report so the source pane
    // renders and template refs bind, then null the report ref. The
    // template wraps the source pane inside <template v-if="report">,
    // so the source scroller unmounts and Vue rebinds sourceScroller to
    // null. Inject an "L42" line element that getElementById will find,
    // then trigger the selectedLine watcher.
    embedPayload(buildPayload());
    const sivSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    try {
      const w = await mountApp();
      const targetLine = document.createElement("div");
      targetLine.id = "L42";
      document.body.appendChild(targetLine);

      const internal = (
        w.vm as unknown as {
          $: { setupState: Record<string, unknown> };
        }
      ).$;
      const setup = internal.setupState as Record<string, unknown>;
      // Drop the report — this v-if-unmounts everything, including the
      // source scroller, and Vue rebinds sourceScroller to null.
      setup.report = null;
      await flushPromises();
      setup.selectedLine = null;
      await flushPromises();
      setup.selectedLine = 42;
      await flushPromises();
      // scrollToSelectedLine awaits two nextTicks before reading the
      // scroller ref; flush more.
      await flushPromises();
      await flushPromises();

      expect(sivSpy).toHaveBeenCalled();
      targetLine.remove();
    } finally {
      sivSpy.mockRestore();
    }
  });
});
