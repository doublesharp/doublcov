import { describe, expect, it } from "vitest";
import {
  buildMultiFilePayload,
  buildPayload,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue hash state with non-default filters", () => {
  it("loads search/uncoveredOnly/navFile flags from the hash on mount", async () => {
    embedPayload(buildMultiFilePayload(3));
    history.replaceState(
      null,
      "",
      "#q=mod1&uncovered=0&navFile=0&kind=function",
    );
    const w = await mountApp();
    const search = w.find<HTMLInputElement>('[data-search-input="true"]');
    expect(search.element.value).toBe("mod1");
    const select = w.find<HTMLSelectElement>(
      'select.focus-ring[class*="mt-3"]',
    );
    expect(select.element.value).toBe("function");
  });
});

describe("App.vue select v-model setters", () => {
  it("changing the theme <select> via v-model triggers the setter", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    const themeSelect = w.find<HTMLSelectElement>(
      "header select.focus-ring.panel",
    );
    expect(themeSelect.exists()).toBe(true);
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
    expect(location.hash).not.toContain("kind=");
  });
});
