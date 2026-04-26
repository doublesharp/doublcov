import { describe, expect, it, vi } from "vitest";
import {
  buildMultiFilePayload,
  buildPayload,
  dispatchAppKey,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue keyboard shortcuts", () => {
  it("J advances to the next uncovered item; K goes back", async () => {
    embedPayload(buildMultiFilePayload(3));
    await mountApp();
    dispatchAppKey("f");
    await flushPromises();
    dispatchAppKey("j");
    await flushPromises();
    expect(location.hash).toMatch(/file=/);
    const firstHash = location.hash;
    dispatchAppKey("k");
    await flushPromises();
    expect(location.hash).not.toBe(firstHash);
  });

  it("N selects the next file in the sidebar; P selects the previous", async () => {
    embedPayload(buildMultiFilePayload(3));
    await mountApp();
    const initialFileHash = location.hash;
    dispatchAppKey("n");
    await flushPromises();
    expect(location.hash).not.toBe(initialFileHash);
    expect(location.hash).toContain("file=f0001");
    dispatchAppKey("p");
    await flushPromises();
    expect(location.hash).toContain("file=f0000");
  });

  it("F toggles navigatorCurrentFileOnly", async () => {
    embedPayload(buildMultiFilePayload(2));
    await mountApp();
    expect(location.hash).not.toContain("navFile=0");
    dispatchAppKey("f");
    await flushPromises();
    expect(location.hash).toContain("navFile=0");
    dispatchAppKey("f");
    await flushPromises();
    expect(location.hash).not.toContain("navFile=0");
  });

  it("U cycles through uncovered kind selections", async () => {
    embedPayload(buildMultiFilePayload(2));
    await mountApp();
    dispatchAppKey("u");
    await flushPromises();
    expect(location.hash).toContain("kind=line");
    dispatchAppKey("u");
    await flushPromises();
    expect(location.hash).toContain("kind=branch");
    dispatchAppKey("u");
    await flushPromises();
    expect(location.hash).toContain("kind=function");
    dispatchAppKey("u");
    await flushPromises();
    expect(location.hash).not.toContain("kind=");
  });

  it("T cycles the active theme", async () => {
    embedPayload(buildMultiFilePayload(1));
    await mountApp();
    const initial = document.documentElement.dataset.theme;
    dispatchAppKey("t");
    await flushPromises();
    expect(document.documentElement.dataset.theme).not.toBe(initial);
  });

  it("/ focuses the search input", async () => {
    embedPayload(buildPayload());
    await mountApp();
    const input = document.querySelector<HTMLInputElement>(
      '[data-search-input="true"]',
    );
    expect(input).not.toBeNull();
    dispatchAppKey("/");
    await flushPromises();
    expect(document.activeElement).toBe(input);
  });

  it("Escape blurs the active editable element", async () => {
    embedPayload(buildPayload());
    await mountApp();
    const input = document.querySelector<HTMLInputElement>(
      '[data-search-input="true"]',
    );
    input?.focus();
    expect(document.activeElement).toBe(input);
    dispatchAppKey("Escape");
    await flushPromises();
    expect(document.activeElement).not.toBe(input);
  });

  it("? opens help, Escape closes it", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    expect(w.text()).not.toContain("Help");
    dispatchAppKey("?");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    dispatchAppKey("Escape");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("ignores shortcuts dispatched on editable inputs", async () => {
    embedPayload(buildMultiFilePayload(3));
    await mountApp();
    const input = document.querySelector<HTMLInputElement>(
      '[data-search-input="true"]',
    );
    expect(input).not.toBeNull();
    const before = location.hash;
    dispatchAppKey("n", { target: input ?? undefined });
    await flushPromises();
    expect(location.hash).toBe(before);
  });

  it("ignores shortcuts when modifier keys are held", async () => {
    embedPayload(buildMultiFilePayload(3));
    await mountApp();
    const before = location.hash;
    dispatchAppKey("n", { metaKey: true });
    dispatchAppKey("n", { ctrlKey: true });
    dispatchAppKey("n", { altKey: true });
    await flushPromises();
    expect(location.hash).toBe(before);
  });

  it("G jumps to the current uncovered item without throwing", async () => {
    embedPayload(buildMultiFilePayload(2));
    await mountApp();
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, "scrollTo")
      .mockImplementation(() => {});
    await expect(
      (async () => {
        dispatchAppKey("g");
        await flushPromises();
      })(),
    ).resolves.not.toThrow();
    scrollSpy.mockRestore();
  });
});
