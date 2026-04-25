export const EMBEDDED_REPORT_ELEMENT_ID = "doublcov-report-data";
export const EMBEDDED_SOURCES_ELEMENT_ID = "doublcov-source-data";

export function readEmbeddedJsonElement(id: string): unknown | undefined {
  const text = document.getElementById(id)?.textContent;
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function readEmbeddedReportPayload(): unknown | undefined {
  return readEmbeddedJsonElement(EMBEDDED_REPORT_ELEMENT_ID);
}

export function readEmbeddedSourcePayloadsRecord(): Record<string, unknown> | null {
  const payload = readEmbeddedJsonElement(EMBEDDED_SOURCES_ELEMENT_ID);
  if (!isUnknownRecord(payload)) return null;
  return payload;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
