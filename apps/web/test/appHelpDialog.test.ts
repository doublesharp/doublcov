import { describe, expect, it } from "vitest";
import {
  buildMultiFilePayload,
  buildPayload,
  dispatchAppKey,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue help dialog interactions", () => {
  it("clicking the dialog backdrop closes the help overlay", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    dispatchAppKey("?");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    const backdrop = w.find('[role="presentation"]');
    await backdrop.trigger("click");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("clicking the close button inside the dialog closes it", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    dispatchAppKey("?");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    const closeButton = w.find('[aria-label="Close help"]');
    expect(closeButton.exists()).toBe(true);
    await closeButton.trigger("click");
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("clicking inside the dialog content does not close it", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
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

  it("ignores plain shortcuts when help is open", async () => {
    embedPayload(buildMultiFilePayload(2));
    await mountApp();
    dispatchAppKey("?");
    await flushPromises();
    const before = location.hash;
    dispatchAppKey("n");
    await flushPromises();
    expect(location.hash).toBe(before);
  });
});
