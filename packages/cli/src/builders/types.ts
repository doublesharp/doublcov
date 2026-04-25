import type { BuilderOptions, DiagnosticFileOption } from "../args.js";

export interface PreparedBuilderRun {
  command: string;
  args: string[];
  lcov: string;
  diagnostics?: DiagnosticFileOption[];
  cleanup?: () => Promise<void>;
}

export interface CoverageBuilderPlugin {
  id: string;
  aliases: string[];
  label: string;
  description: string;
  defaultLcov?: string;
  defaultSources?: string[];
  defaultExtensions?: string[];
  prepareRun: (options: BuilderOptions) => Promise<PreparedBuilderRun>;
}
