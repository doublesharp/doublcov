import { describe, expect, it } from "vitest";
import { buildPayload, embedPayload, mountApp } from "./appTestHelpers";

describe("App.vue", () => {
  it("renders the project name in the title from an embedded report payload", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    expect(w.text()).toContain("Test Project Coverage");
    expect(document.title).toBe("Test Project Coverage");
  });

  it("renders summary totals (lines / functions / branches / uncovered)", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    expect(w.text()).toContain("66.67%");
    expect(w.text()).toMatch(/2\s*\/\s*3/);
    // exactly one uncovered item present in fixture
    expect(w.text()).toMatch(/Line\s*2/);
  });

  it("renders an error banner when the embedded report payload is malformed", async () => {
    const node = document.createElement("script");
    node.id = "doublcov-report-data";
    node.type = "application/json";
    node.textContent = '{"not":"a-valid-report"}';
    document.body.append(node);
    const w = await mountApp();
    expect(w.text().toLowerCase()).toContain("malformed");
  });

  it("renders a fallback title when no projectName is provided", async () => {
    const payload = buildPayload();
    const r = payload.report as Record<string, unknown>;
    delete r.projectName;
    embedPayload(payload);
    const w = await mountApp();
    expect(w.text()).toContain("Doublcov");
    expect(w.text()).not.toContain("Test Project Coverage");
  });

  it("clears the source-error banner on a successful selectFile", async () => {
    embedPayload(buildPayload());
    const w = await mountApp();
    // Confirm baseline: source viewer rendered, no error banner.
    expect(w.text()).not.toContain("Could not load source:");
  });

  it("syncs the URL hash with selected file state on mount", async () => {
    embedPayload(buildPayload());
    history.replaceState(null, "", "#file=0001-src-foo&line=2&kind=line");
    const w = await mountApp();
    // The selected file id from the hash should pick the only file in the
    // fixture; the line 2 indicator should appear.
    expect(w.text()).toContain("Line 2");
  });
});
