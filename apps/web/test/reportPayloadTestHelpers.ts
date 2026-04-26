export function baseReport(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: "2026-04-24T00:00:00.000Z",
    totals: baseTotals(),
    files: [baseFile()],
    uncoveredItems: [],
    ignored: { lines: 0, byReason: {}, assemblyLines: 0 },
    diagnostics: [],
    history: { schemaVersion: 1, runs: [] },
  };
}

export function baseFile(): Record<string, unknown> {
  return {
    id: "0001-src-index-ts",
    path: "src/index.ts",
    displayPath: "src/index.ts",
    language: "typescript",
    lineCount: 1,
    lines: [],
    functions: [],
    totals: baseTotals(),
    uncovered: { lines: [], functions: [], branches: [] },
    ignored: { lines: [], byReason: {}, assemblyLines: [] },
    searchText: "src/index.ts",
    sourceDataPath: "data/files/0001-src-index-ts.json",
  };
}

function baseTotals(): Record<string, unknown> {
  return {
    lines: { found: 1, hit: 1, percent: 100 },
    functions: { found: 0, hit: 0, percent: 100 },
    branches: { found: 0, hit: 0, percent: 100 },
  };
}
