import { describe, expect, it } from "vitest";
import {
  buildFile,
  buildMultiFilePayload,
  embedPayload,
  flushPromises,
  mountApp,
} from "./appTestHelpers";

describe("App.vue file selection and filtering", () => {
  it("clicking a sidebar file selects it and writes the hash", async () => {
    embedPayload(buildMultiFilePayload(3));
    const w = await mountApp();
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
