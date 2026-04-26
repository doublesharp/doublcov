#!/usr/bin/env node
// Wraps `madge --circular`. madge reports type-only TS imports as edges,
// so it flags cycles that vanish at runtime. We allow-list those known
// type-only cycles and fail only on real ones.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const allowedCycles = [
  // builders/types.ts → args.ts is a `import type` only edge; the runtime
  // graph is acyclic. Verified by reading args.ts (no value imports from
  // builders/types) and builders/types.ts (`import type` only).
  "packages/cli/src/args.ts > packages/cli/src/builders/registry.ts > packages/cli/src/builders/c8.ts > packages/cli/src/builders/types.ts",
];

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "madge",
    "--circular",
    "--no-color",
    "--extensions",
    "ts,vue,mjs",
    "--ts-config",
    "tsconfig.base.json",
    "packages/cli/src",
    "packages/coverage-core/src",
    "apps/web/src",
    "scripts",
  ],
  { cwd: repoRoot, encoding: "utf8" },
);

const output = `${result.stdout}\n${result.stderr}`;
process.stdout.write(output);

const cycleLines = output
  .split("\n")
  .filter((line) => /^\d+\)\s/.test(line))
  .map((line) => line.replace(/^\d+\)\s+/, "").trim());

const unexpected = cycleLines.filter(
  (cycle) => !allowedCycles.some((allowed) => cycle === allowed),
);

if (unexpected.length > 0) {
  process.stderr.write(
    `\nUnexpected circular dependency:\n  ${unexpected.join("\n  ")}\n`,
  );
  process.exit(1);
}

if (cycleLines.length > 0) {
  process.stdout.write(
    `\nAll ${cycleLines.length} circular dependency(ies) are allow-listed type-only edges.\n`,
  );
}

process.exit(0);
