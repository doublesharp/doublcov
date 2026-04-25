import { c8Builder } from "./c8.js";
import { cargoLlvmCovBuilder } from "./cargoLlvmCov.js";
import { cargoTarpaulinBuilder } from "./cargoTarpaulin.js";
import { foundryBuilder } from "./foundry.js";
import { hardhatBuilder } from "./hardhat.js";
import { jestBuilder } from "./jest.js";
import { lcovCaptureBuilder } from "./lcovCapture.js";
import { pytestBuilder } from "./pytest.js";
import type { CoverageBuilderPlugin } from "./types.js";
import { viteBuilder } from "./vite.js";

export const coverageBuilders: CoverageBuilderPlugin[] = [
  foundryBuilder,
  hardhatBuilder,
  viteBuilder,
  jestBuilder,
  c8Builder,
  pytestBuilder,
  cargoLlvmCovBuilder,
  cargoTarpaulinBuilder,
  lcovCaptureBuilder
];

const buildersByName = new Map<string, CoverageBuilderPlugin>(
  coverageBuilders.flatMap((builder) => [[builder.id, builder], ...builder.aliases.map((alias) => [alias, builder] as const)])
);

export function registerCoverageBuilder(builder: CoverageBuilderPlugin): void {
  for (const name of [builder.id, ...builder.aliases]) {
    const conflict = coverageBuilders.find(
      (candidate) => candidate.id !== builder.id && (candidate.id === name || candidate.aliases.includes(name))
    );
    if (conflict) {
      throw new Error(
        `Coverage builder "${builder.id}" cannot register name "${name}" because it conflicts with builder "${conflict.id}".`
      );
    }
  }
  const existingIndex = coverageBuilders.findIndex((candidate) => candidate.id === builder.id);
  if (existingIndex === -1) {
    coverageBuilders.push(builder);
  } else {
    coverageBuilders.splice(existingIndex, 1, builder);
  }
  rebuildBuilderIndex();
}

export function resolveBuilder(name: string): CoverageBuilderPlugin | undefined {
  return buildersByName.get(name);
}

export function isBuilderCommand(name: string): boolean {
  return buildersByName.has(name);
}

function rebuildBuilderIndex(): void {
  buildersByName.clear();
  for (const builder of coverageBuilders) {
    buildersByName.set(builder.id, builder);
    for (const alias of builder.aliases) buildersByName.set(alias, builder);
  }
}
