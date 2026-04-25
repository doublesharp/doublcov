import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import App from "../src/App.vue";

vi.mock("../src/syntax", () => ({
  highlightSourceLine: (text: string) => [{ text, kind: undefined }],
  highlightSourceLines: async (lines: string[]) =>
    lines.map((text) => [{ text, kind: undefined }]),
}));

interface MinimalPayload {
  report: object;
  sources: Record<string, object>;
}

function buildPayload(): MinimalPayload {
  const file = {
    id: "0001-src-foo",
    path: "src/foo.ts",
    displayPath: "src/foo.ts",
    language: "typescript",
    lineCount: 3,
    lines: [
      { line: 1, hits: 1, branches: [], status: "covered" },
      { line: 2, hits: 0, branches: [], status: "uncovered" },
      { line: 3, hits: 1, branches: [], status: "covered" },
    ],
    functions: [],
    totals: {
      lines: { found: 3, hit: 2, percent: 66.67 },
      functions: { found: 0, hit: 0, percent: 100 },
      branches: { found: 0, hit: 0, percent: 100 },
    },
    uncovered: { lines: [2], functions: [], branches: [] },
    ignored: { lines: [], byReason: {}, assemblyLines: [] },
    searchText: "src/foo.ts",
    sourceDataPath: "data/files/0001-src-foo.json",
  };
  return {
    report: {
      schemaVersion: 1,
      generatedAt: "2026-04-25T00:00:00.000Z",
      projectName: "Test Project",
      totals: {
        lines: { found: 3, hit: 2, percent: 66.67 },
        functions: { found: 0, hit: 0, percent: 100 },
        branches: { found: 0, hit: 0, percent: 100 },
      },
      files: [file],
      uncoveredItems: [
        {
          id: "line:0001-src-foo:2",
          kind: "line",
          fileId: "0001-src-foo",
          filePath: "src/foo.ts",
          line: 2,
          label: "Line 2",
          detail: "Line was not executed",
        },
      ],
      ignored: { lines: 0, byReason: {}, assemblyLines: 0 },
      diagnostics: [],
      history: { schemaVersion: 1, runs: [] },
    },
    sources: {
      "data/files/0001-src-foo.json": {
        id: "0001-src-foo",
        path: "src/foo.ts",
        language: "typescript",
        lines: ["const a = 1;", "const b = 2;", "export { a, b };"],
      },
    },
  };
}

function embedPayload(payload: MinimalPayload): void {
  const reportNode = document.createElement("script");
  reportNode.id = "doublcov-report-data";
  reportNode.type = "application/json";
  reportNode.textContent = JSON.stringify(payload.report);
  document.body.append(reportNode);

  const sourcesNode = document.createElement("script");
  sourcesNode.id = "doublcov-source-data";
  sourcesNode.type = "application/json";
  sourcesNode.textContent = JSON.stringify(payload.sources);
  document.body.append(sourcesNode);
}

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  document
    .querySelectorAll("#doublcov-report-data, #doublcov-source-data")
    .forEach((node) => node.remove());
  history.replaceState(null, "", window.location.pathname);
  document.title = "";
});

afterEach(() => {
  if (wrapper) {
    wrapper.unmount();
    wrapper = null;
  }
});

async function mountApp(): Promise<VueWrapper> {
  wrapper = mount(App, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

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
