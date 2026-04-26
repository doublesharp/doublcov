import type { CoverageDiagnostic, DiagnosticInput } from "./types.js";

export interface DiagnosticParser {
  id: string;
  label: string;
  parse: (content: string) => CoverageDiagnostic[];
}

export const DIAGNOSTIC_PARSERS: DiagnosticParser[] = [
  {
    id: "foundry-debug",
    label: "Foundry debug coverage",
    parse: (content) => parseDiagnosticLines(content, "foundry-debug"),
  },
  {
    id: "foundry-bytecode",
    label: "Foundry bytecode coverage",
    parse: (content) => parseDiagnosticLines(content, "foundry-bytecode"),
  },
];

const diagnosticParsersById = new Map(
  DIAGNOSTIC_PARSERS.map((parser) => [parser.id, parser] as const),
);

export function registerDiagnosticParser(parser: DiagnosticParser): void {
  const existing = diagnosticParsersById.get(parser.id);
  if (existing) {
    const index = DIAGNOSTIC_PARSERS.findIndex(
      (candidate) => candidate.id === parser.id,
    );
    if (index !== -1) {
      DIAGNOSTIC_PARSERS.splice(index, 1, parser);
    } else {
      DIAGNOSTIC_PARSERS.push(parser);
    }
  } else {
    DIAGNOSTIC_PARSERS.push(parser);
  }
  diagnosticParsersById.set(parser.id, parser);
}

export function resolveDiagnosticParser(
  id: string,
): DiagnosticParser | undefined {
  return diagnosticParsersById.get(id);
}

export function parseDiagnostics(
  inputs: DiagnosticInput[] | undefined,
): CoverageDiagnostic[] {
  return (inputs ?? []).flatMap((input, inputIndex) => {
    const parser = diagnosticParsersById.get(input.parser);
    if (!parser) {
      return [
        {
          id: `diagnostic-parser-${inputIndex + 1}`,
          source: input.parser,
          severity: "warning",
          message: `Unknown diagnostic parser "${input.parser}".`,
        } satisfies CoverageDiagnostic,
      ];
    }

    let parsed: CoverageDiagnostic[];
    try {
      parsed = parser.parse(input.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        {
          id: `diagnostic-parser-${inputIndex + 1}-error`,
          source: input.parser,
          severity: "warning",
          message: `Diagnostic parser "${input.parser}" failed: ${message}`,
        } satisfies CoverageDiagnostic,
      ];
    }

    return parsed.map((diagnostic, diagnosticIndex) => ({
      ...diagnostic,
      id: `${input.parser}-${inputIndex + 1}-${diagnosticIndex + 1}`,
    }));
  });
}

export function parseFoundryDebugReport(
  input: string | undefined,
): CoverageDiagnostic[] {
  return parseDiagnosticLines(input, "foundry-debug");
}

export function parseFoundryBytecodeReport(
  input: string | undefined,
): CoverageDiagnostic[] {
  return parseDiagnosticLines(input, "foundry-bytecode");
}

function parseDiagnosticLines(
  input: string | undefined,
  source: CoverageDiagnostic["source"],
): CoverageDiagnostic[] {
  if (!input?.trim()) return [];

  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const location = line.match(
        /(?<file>(?:[A-Za-z]:[\\/])?[^:\r\n]*?\.sol)(?::(?<line>\d+))?/,
      );
      const filePath = location?.groups?.file?.trim();
      return {
        id: `${source}-${index + 1}`,
        source,
        severity: "info",
        message: line,
        ...(filePath ? { filePath } : {}),
        ...(location?.groups?.line
          ? { line: Number(location.groups.line) }
          : {}),
      };
    });
}
