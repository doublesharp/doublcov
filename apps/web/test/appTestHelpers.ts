import { afterEach, beforeEach, vi } from "vitest";
import {
  flushPromises as flushVuePromises,
  mount,
  type VueWrapper,
} from "@vue/test-utils";
import App from "../src/App.vue";

vi.mock("../src/syntax", () => ({
  highlightSourceLine: (text: string) => [{ text, kind: undefined }],
  highlightSourceLines: async (lines: string[]) =>
    lines.map((text) => [{ text, kind: undefined }]),
}));

export interface MinimalPayload {
  report: Record<string, unknown>;
  sources: Record<string, object>;
}

export function buildFile(
  id: string,
  path: string,
  options: { lineCount?: number; uncoveredLine?: number } = {},
): Record<string, unknown> {
  const lineCount = options.lineCount ?? 3;
  const uncoveredLine = options.uncoveredLine ?? 2;
  const lines = Array.from({ length: lineCount }, (_, idx) => ({
    line: idx + 1,
    hits: idx + 1 === uncoveredLine ? 0 : 1,
    branches: [],
    status: idx + 1 === uncoveredLine ? "uncovered" : "covered",
  }));
  const totals = {
    found: lineCount,
    hit: lineCount - 1,
    percent: ((lineCount - 1) / lineCount) * 100,
  };
  return {
    id,
    path,
    displayPath: path,
    language: "typescript",
    lineCount,
    lines,
    functions: [],
    totals: {
      lines: totals,
      functions: { found: 0, hit: 0, percent: 100 },
      branches: { found: 0, hit: 0, percent: 100 },
    },
    uncovered: { lines: [uncoveredLine], functions: [], branches: [] },
    ignored: { lines: [], byReason: {}, assemblyLines: [] },
    searchText: path.toLowerCase(),
    sourceDataPath: `data/files/${id}.json`,
  };
}

export function buildPayload(): MinimalPayload {
  const file = buildFile("0001-src-foo", "src/foo.ts");
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

export function buildMultiFilePayload(count = 4): MinimalPayload {
  const files: Record<string, unknown>[] = [];
  const uncoveredItems: Record<string, unknown>[] = [];
  const sources: Record<string, object> = {};
  for (let i = 0; i < count; i++) {
    const id = `f${String(i).padStart(4, "0")}-mod-${i}`;
    const path = `src/mod${i}/file.ts`;
    const file = buildFile(id, path);
    files.push(file);
    uncoveredItems.push({
      id: `line:${id}:2`,
      kind: i % 2 === 0 ? "line" : "function",
      fileId: id,
      filePath: path,
      line: 2,
      label: i % 2 === 0 ? `Line 2` : `fn_${i}`,
      detail: "uncovered detail",
    });
    sources[`data/files/${id}.json`] = {
      id,
      path,
      language: "typescript",
      lines: ["a", "b", "c"],
    };
  }
  uncoveredItems.push({
    id: `branch:${files[0]?.id}:2`,
    kind: "branch",
    fileId: files[0]?.id,
    filePath: files[0]?.path,
    line: 2,
    label: "branch fallthrough",
    detail: "branch never taken",
  });
  return {
    report: {
      schemaVersion: 1,
      generatedAt: "2026-04-25T00:00:00.000Z",
      projectName: "Multi",
      totals: {
        lines: { found: count * 3, hit: count * 2, percent: 66.67 },
        functions: { found: 0, hit: 0, percent: 100 },
        branches: { found: 0, hit: 0, percent: 100 },
      },
      files,
      uncoveredItems,
      ignored: { lines: 0, byReason: {}, assemblyLines: 0 },
      diagnostics: [],
      history: { schemaVersion: 1, runs: [] },
    },
    sources,
  };
}

export function embedPayload(payload: MinimalPayload): void {
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
    try {
      wrapper.unmount();
    } catch {
      // Already torn down by a test; ignore.
    }
    wrapper = null;
  }
  document.body.classList.remove("resizing-navigator", "resizing-side-panel");
});

export async function mountApp(): Promise<VueWrapper> {
  wrapper = mount(App, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

export async function flushPromises(): Promise<void> {
  await flushVuePromises();
}

export function dispatchAppKey(
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
