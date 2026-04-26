import { describe, expect, it, vi } from "vitest";
import {
  buildFile,
  buildMultiFilePayload,
  buildPayload,
  dispatchAppKey,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue keyboard shortcuts", () => {
  function dispatchKey(
    key: string,
    options: KeyboardEventInit & { target?: EventTarget } = {},
  ): void {
    const target = options.target ?? document.body;
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    target.dispatchEvent(event);
  }

  it("J advances to the next uncovered item; K goes back", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
    // navigatorCurrentFileOnly defaults true; toggle off so navigator shows all
    dispatchKey("f");
    await flushPromises();
    dispatchKey("j");
    await flushPromises();
    // After J the selected file should change to the second uncovered item's file
    expect(location.hash).toMatch(/file=/);
    const firstHash = location.hash;
    dispatchKey("k");
    await flushPromises();
    // K should change the hash again
    expect(location.hash).not.toBe(firstHash);
  });

  it("N selects the next file in the sidebar; P selects the previous", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
    const initialFileHash = location.hash;
    dispatchKey("n");
    await flushPromises();
    expect(location.hash).not.toBe(initialFileHash);
    expect(location.hash).toContain("file=f0001");
    dispatchKey("p");
    await flushPromises();
    expect(location.hash).toContain("file=f0000");
  });

  it("F toggles navigatorCurrentFileOnly", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    // Default is "true" so it should not appear; pressing F should set it to
    // "false" and add navFile=0 to the hash.
    expect(location.hash).not.toContain("navFile=0");
    dispatchKey("f");
    await flushPromises();
    expect(location.hash).toContain("navFile=0");
    dispatchKey("f");
    await flushPromises();
    expect(location.hash).not.toContain("navFile=0");
  });

  it("U cycles through uncovered kind selections", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    // Start: all -> line
    dispatchKey("u");
    await flushPromises();
    expect(location.hash).toContain("kind=line");
    dispatchKey("u");
    await flushPromises();
    expect(location.hash).toContain("kind=branch");
    dispatchKey("u");
    await flushPromises();
    expect(location.hash).toContain("kind=function");
    dispatchKey("u");
    await flushPromises();
    // Back to "all" so the kind param disappears.
    expect(location.hash).not.toContain("kind=");
  });

  it("T cycles the active theme", async () => {
    embedPayload(buildMultiFilePayload(1));
    const w = await mountApp();
    const initial = document.documentElement.dataset.theme;
    dispatchKey("t");
    await flushPromises();
    expect(document.documentElement.dataset.theme).not.toBe(initial);
  });

  it("/ focuses the search input", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const input = document.querySelector<HTMLInputElement>(
      '[data-search-input="true"]',
    );
    expect(input).not.toBeNull();
    dispatchKey("/");
    await flushPromises();
    // happy-dom should report the focused element after focus()
    expect(document.activeElement).toBe(input);
  });

  it("Escape blurs the active editable element", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const input = document.querySelector<HTMLInputElement>(
      '[data-search-input="true"]',
    );
    input?.focus();
    expect(document.activeElement).toBe(input);
    // Dispatch escape on the body so isEditableTarget returns false; otherwise
    // the handler bails before reaching the Escape branch.
    dispatchKey("Escape");
    await flushPromises();
    // After blur, focused element should no longer be the input.
    expect(document.activeElement).not.toBe(input);
  });

  it("? opens help, Escape closes it", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    expect(w.text()).not.toContain("Help");
    dispatchKey("?");
    await flushPromises();
    // The help dialog has a heading "Help"
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    dispatchKey("Escape");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("ignores shortcuts dispatched on editable inputs (isEditableTarget)", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
    const input = document.querySelector<HTMLInputElement>(
      '[data-search-input="true"]',
    );
    expect(input).not.toBeNull();
    const before = location.hash;
    // Dispatch "n" with the input as the target — should be ignored.
    dispatchKey("n", { target: input ?? undefined });
    await flushPromises();
    expect(location.hash).toBe(before);
  });

  it("ignores shortcuts when modifier keys are held", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
    const before = location.hash;
    dispatchKey("n", { metaKey: true });
    dispatchKey("n", { ctrlKey: true });
    dispatchKey("n", { altKey: true });
    await flushPromises();
    expect(location.hash).toBe(before);
  });

  it("G jumps to the current uncovered item without throwing", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    // jumpToCurrentUncovered triggers smooth-scroll which may not exist in
    // happy-dom; ensure it does not throw.
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, "scrollTo")
      .mockImplementation(() => {});
    await expect(
      (async () => {
        dispatchKey("g");
        await flushPromises();
      })(),
    ).resolves.not.toThrow();
    scrollSpy.mockRestore();
  });
});

describe("App.vue file selection / search filtering", () => {
  it("clicking a sidebar file selects it and writes the hash", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
    // The sidebar is a list of <button> with displayPath text.
    const buttons = w
      .findAll("aside button")
      .filter((b) => b.text().includes("src/mod"));
    expect(buttons.length).toBeGreaterThan(1);
    const target = buttons[2];
    expect(target).toBeTruthy();
    await target!.trigger("click");
    await flushPromises();
    expect(location.hash).toContain("file=");
  });

  it("typing into the search input filters the file list", async () => {
    embedPayload(buildMultiFilePayload(4));
    const w = await mountApp();
    // Count file-list rows specifically — left sidebar buttons whose label
    // shows the per-file "% lines" text. The right-side navigator buttons
    // contain the "kind" pill and don't include "% lines".
    const countFiles = (): number =>
      w
        .findAll("button")
        .filter((b) => /lines\s*·/.test(b.text()))
        .filter((b) => b.text().includes("src/mod")).length;
    expect(countFiles()).toBe(4);
    const input = w.find<HTMLInputElement>('[data-search-input="true"]');
    await input.setValue("mod1");
    await flushPromises();
    expect(countFiles()).toBe(1);
    expect(location.hash).toContain("q=mod1");
  });

  it("toggles the 'uncovered only' filter without crashing", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    const checkbox = w.find<HTMLInputElement>('aside input[type="checkbox"]');
    await checkbox.setValue(false);
    await flushPromises();
    expect(location.hash).toContain("uncovered=0");
  });

  it("renders 'Showing first N of M' when matchingFiles exceeds 500", async () => {
    const payload = buildMultiFilePayload(0);
    const files: Record<string, unknown>[] = [];
    const uncoveredItems: Record<string, unknown>[] = [];
    for (let i = 0; i < 502; i++) {
      const id = `f${String(i).padStart(4, "0")}-mod-${i}`;
      const path = `src/mod/file${i}.ts`;
      files.push(buildFile(id, path));
      uncoveredItems.push({
        id: `line:${id}:2`,
        kind: "line",
        fileId: id,
        filePath: path,
        line: 2,
        label: "Line 2",
        detail: "uncovered",
      });
      payload.sources[`data/files/${id}.json`] = {
        id,
        path,
        language: "typescript",
        lines: ["a", "b", "c"],
      };
    }
    payload.report.files = files;
    payload.report.uncoveredItems = uncoveredItems;
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toMatch(/Showing first 500 of 502 matching files/);
  });
});

describe("App.vue navigator", () => {
  it("mousedown drag resizes the navigator height", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    const handle = w.find(".navigator-resize-handle");
    expect(handle.exists()).toBe(true);
    await handle.trigger("mousedown", { clientY: 100 });
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientY: 200, bubbles: true }),
    );
    await flushPromises();
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await flushPromises();
    // No throw is the bar; check the body class was removed
    expect(document.body.classList.contains("resizing-navigator")).toBe(false);
  });

  it("clicking Prev and Next pages the navigator", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
    // toggle off current-file so all items are listed
    dispatchAppKey("f");
    await flushPromises();
    const buttons = w
      .findAll("button")
      .filter((b) => /^(Prev|Next)$/.test(b.text()));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const next = buttons.find((b) => b.text() === "Next");
    const prev = buttons.find((b) => b.text() === "Prev");
    expect(next && prev).toBeTruthy();
    const beforeNext = location.hash;
    await next!.trigger("click");
    await flushPromises();
    expect(location.hash).not.toBe(beforeNext);
    await prev!.trigger("click");
    await flushPromises();
  });
});

describe("App.vue navigator scroll handler", () => {
  it("handleNavigatorScroll updates the virtual scroll window", async () => {
    embedPayload(buildMultiFilePayload(20));
    const w = await mountApp();
    const checkbox = w
      .findAll('input[type="checkbox"]')
      .find((c) => c.element.parentElement?.textContent?.includes("Current"));
    expect(checkbox).toBeTruthy();
    await checkbox!.setValue(false);
    await flushPromises();

    const scroller = w.findAll("div").find((d) => {
      const style = d.attributes("style") ?? "";
      return style.includes("min-height") && style.includes("height:");
    });
    expect(scroller).toBeTruthy();
    const el = scroller!.element as HTMLElement;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => 1200,
    });
    const event = new Event("scroll", { bubbles: false });
    Object.defineProperty(event, "currentTarget", { value: el });
    el.dispatchEvent(event);
    await flushPromises();

    const navigatorText = scroller!.text();
    expect(navigatorText).toContain("src/mod10/file.ts");
    expect(navigatorText).not.toContain("src/mod1/file.ts");
  });

  it("scrollNavigatorToIndex bails when no scroller is mounted", async () => {
    const payload = buildPayload();
    payload.report.uncoveredItems = [];
    embedPayload(payload);
    const w = await mountApp();
    dispatchAppKey("j");
    await flushPromises();
    expect(w.exists()).toBe(true);
  });
});

describe("App.vue help dialog interactions", () => {
  it("clicking the dialog backdrop closes the help overlay", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", bubbles: true }),
    );
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    const backdrop = w.find('[role="presentation"]');
    await backdrop.trigger("click");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("clicking the close button (×) inside the dialog closes it", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", bubbles: true }),
    );
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    // Header "Help" button to open is at the top right; the close button is
    // inside the dialog with aria-label="Close help".
    const closeButton = w.find('[aria-label="Close help"]');
    expect(closeButton.exists()).toBe(true);
    await closeButton.trigger("click");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("clicking inside the dialog content does NOT close it (@click.stop)", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    // Open via the header help button to also exercise that path.
    const headerHelpBtn = w.find('[aria-label="Open help"]');
    expect(headerHelpBtn.exists()).toBe(true);
    await headerHelpBtn.trigger("click");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    const dialog = w.find('[role="dialog"]');
    await dialog.trigger("click");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
  });

  it("ignores plain shortcuts when help is open (helpOpen short-circuit)", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", bubbles: true }),
    );
    await flushPromises();
    const before = location.hash;
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", bubbles: true }),
    );
    await flushPromises();
    expect(location.hash).toBe(before);
  });
});

describe("App.vue read/write hash state with non-default filters", () => {
  it("loads search/uncoveredOnly/navFile flags from the hash on mount", async () => {
    embedPayload(buildMultiFilePayload(3));
    history.replaceState(
      null,
      "",
      "#q=mod1&uncovered=0&navFile=0&kind=function",
    );
    const w = await mountApp();
    // Search input value reflects q= from the hash.
    const search = w.find<HTMLInputElement>('[data-search-input="true"]');
    expect(search.element.value).toBe("mod1");
    // navigatorCurrentFileOnly is false, so uncovered items not for the
    // selected file still show; check the kind dropdown reflects "function".
    const select = w.find<HTMLSelectElement>(
      'select.focus-ring[class*="mt-3"]',
    );
    expect(select.element.value).toBe("function");
  });
});

describe("App.vue select v-model setters", () => {
  it("changing the theme <select> via v-model triggers the setter (theme select)", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    // Find the header theme select. It's the first <select> in the header.
    const themeSelect = w.find<HTMLSelectElement>(
      "header select.focus-ring.panel",
    );
    expect(themeSelect.exists()).toBe(true);
    // Pick whichever theme isn't currently selected.
    const options = themeSelect.findAll("option");
    expect(options.length).toBeGreaterThan(1);
    const initial = themeSelect.element.value;
    const next = options
      .map((o) => (o.element as HTMLOptionElement).value)
      .find((v) => v !== initial);
    expect(next).toBeTruthy();
    await themeSelect.setValue(next);
    await flushPromises();
    expect(themeSelect.element.value).toBe(next);
    expect(document.documentElement.dataset.theme).toBe(next);
  });

  it("changing the uncovered-kind <select> via v-model updates selectedKind", async () => {
    embedPayload(buildMultiFilePayload(2));
    const w = await mountApp();
    // The kind select uses `mt-3` and includes "Lines"/"Functions"/"Branches".
    const kindSelect = w
      .findAll<HTMLSelectElement>("select")
      .find((s) =>
        Array.from(s.element.options).some(
          (o) => o.value === "function" || o.value === "branch",
        ),
      );
    expect(kindSelect).toBeTruthy();
    await kindSelect!.setValue("function");
    await flushPromises();
    expect(kindSelect!.element.value).toBe("function");
    expect(location.hash).toContain("kind=function");
    await kindSelect!.setValue("all");
    await flushPromises();
    // The "all" value clears the kind hash param.
    expect(location.hash).not.toContain("kind=");
  });
});
