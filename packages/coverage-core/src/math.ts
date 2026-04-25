import type { CoverageTotals } from "./types.js";

export function makeTotals(found: number, hit: number): CoverageTotals {
  return {
    found,
    hit,
    percent: found === 0 ? 100 : Math.round((hit / found) * 10000) / 100,
  };
}

export function addTotals(items: CoverageTotals[]): CoverageTotals {
  const found = items.reduce((sum, item) => sum + item.found, 0);
  const hit = items.reduce((sum, item) => sum + item.hit, 0);
  return makeTotals(found, hit);
}
