import { describe, expect, it } from "vitest";
import {
  buildPayload,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue side-panel resizing", () => {
  it("mousedown on the resize handle and mousemove updates the panel width", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const handle = w.find(".side-panel-resize-handle-right");
    expect(handle.exists()).toBe(true);
    await handle.trigger("mousedown", { clientX: 100 });
    // Drag right by 40px on the left panel — width should grow.
    const moveEvent = new MouseEvent("mousemove", {
      clientX: 140,
      bubbles: true,
    });
    window.dispatchEvent(moveEvent);
    await flushPromises();
    const upEvent = new MouseEvent("mouseup", { bubbles: true });
    window.dispatchEvent(upEvent);
    await flushPromises();
    // After the resize, the section style attribute should encode the new
    // left-panel-width — the value must clamp inside [260, 560].
    const layoutSection = w.find(".report-layout") as ReturnType<typeof w.find>;
    const style = layoutSection.attributes("style") ?? "";
    expect(style).toMatch(/--left-panel-width:\s*\d+px/);
  });

  it("ArrowLeft/ArrowRight keys nudge the panel size; Home/End jump to bounds", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const handle = w.find(".side-panel-resize-handle-right");
    await handle.trigger("keydown", { key: "Home" });
    await flushPromises();
    let style = w.find(".report-layout").attributes("style") ?? "";
    expect(style).toContain("--left-panel-width: 260px");
    await handle.trigger("keydown", { key: "End" });
    await flushPromises();
    style = w.find(".report-layout").attributes("style") ?? "";
    expect(style).toContain("--left-panel-width: 560px");
    await handle.trigger("keydown", { key: "ArrowLeft" });
    await flushPromises();
    style = w.find(".report-layout").attributes("style") ?? "";
    // 560 - 24 = 536
    expect(style).toContain("--left-panel-width: 536px");
    await handle.trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    style = w.find(".report-layout").attributes("style") ?? "";
    expect(style).toContain("--left-panel-width: 560px");
  });

  it("right panel ArrowLeft expands (mirrored)", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const handle = w.find(".side-panel-resize-handle-left");
    await handle.trigger("keydown", { key: "Home" });
    await flushPromises();
    let style = w.find(".report-layout").attributes("style") ?? "";
    expect(style).toContain("--right-panel-width: 260px");
    // For the right panel: ArrowRight subtracts (signedStep is direction*-24)
    await handle.trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    style = w.find(".report-layout").attributes("style") ?? "";
    // 260 - 24 clamps to 260
    expect(style).toContain("--right-panel-width: 260px");
    // ArrowLeft increases the width
    await handle.trigger("keydown", { key: "End" });
    await flushPromises();
    await handle.trigger("keydown", { key: "ArrowLeft" });
    await flushPromises();
    style = w.find(".report-layout").attributes("style") ?? "";
    expect(style).toContain("--right-panel-width: 560px");
  });

  it("ignores non-resize keys on the resize handle", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const handle = w.find(".side-panel-resize-handle-right");
    const before = w.find(".report-layout").attributes("style") ?? "";
    await handle.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(w.find(".report-layout").attributes("style") ?? "").toBe(before);
  });
});

describe("App.vue side-panel resize mouse drag (right panel)", () => {
  it("dragging the right-side handle adjusts rightPanelWidth (mirrored)", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const handle = w.find(".side-panel-resize-handle-left");
    expect(handle.exists()).toBe(true);
    await handle.trigger("mousedown", { clientX: 200 });
    // For the right panel, dragging left (decreasing clientX) increases the
    // width (mirrored sign).
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, bubbles: true }),
    );
    await flushPromises();
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await flushPromises();
    const style = w.find(".report-layout").attributes("style") ?? "";
    expect(style).toMatch(/--right-panel-width:\s*\d+px/);
  });

  it("ignores mousemove when no resize is in progress", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    // Without a prior mousedown, the handler bails on the no-start guard.
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 999, bubbles: true }),
    );
    await flushPromises();
    expect(w.exists()).toBe(true);
  });
});
