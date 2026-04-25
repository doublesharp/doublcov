import path from "node:path";

export interface FixedLcovPath {
  lcov: string;
  reportDir: string;
}

export function fixedLcovPath(
  explicitLcov: string | undefined,
  defaultLcov: string,
  builderLabel: string,
): FixedLcovPath {
  const lcov = explicitLcov ?? defaultLcov;
  if (explicitLcov && path.basename(explicitLcov) !== "lcov.info") {
    throw new Error(
      `${builderLabel} writes lcov.info inside a report directory. Use a --lcov path ending in lcov.info.`,
    );
  }
  return { lcov, reportDir: path.dirname(lcov) };
}
