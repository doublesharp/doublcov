import { describe, expect, it } from "vitest";
import {
  buildMultiFilePayload,
  buildPayload,
  dispatchAppKey,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue navigator paging and resizing", () => {
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
    expect(document.body.classList.contains("resizing-navigator")).toBe(false);
  });

  it("clicking Prev and Next pages the navigator", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
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

describe("App.vue navigator virtual scrolling", () => {
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
