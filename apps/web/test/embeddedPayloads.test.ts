import { afterEach, describe, expect, it } from "vitest";
import {
  EMBEDDED_REPORT_ELEMENT_ID,
  EMBEDDED_SOURCES_ELEMENT_ID,
  readEmbeddedJsonElement,
  readEmbeddedReportPayload,
  readEmbeddedSourcePayloadsRecord,
} from "../src/embeddedPayloads";

function setEmbeddedScript(id: string, content: string): HTMLScriptElement {
  const node = document.createElement("script");
  node.id = id;
  node.type = "application/json";
  node.textContent = content;
  document.body.append(node);
  return node;
}

afterEach(() => {
  document.getElementById(EMBEDDED_REPORT_ELEMENT_ID)?.remove();
  document.getElementById(EMBEDDED_SOURCES_ELEMENT_ID)?.remove();
});

describe("readEmbeddedJsonElement", () => {
  it("returns undefined when the element is missing", () => {
    expect(readEmbeddedJsonElement("nope")).toBeUndefined();
  });

  it("returns undefined when the element is empty", () => {
    setEmbeddedScript("empty", "");
    try {
      expect(readEmbeddedJsonElement("empty")).toBeUndefined();
    } finally {
      document.getElementById("empty")?.remove();
    }
  });

  it("returns parsed JSON for a well-formed payload", () => {
    setEmbeddedScript(EMBEDDED_REPORT_ELEMENT_ID, '{"hello":"world"}');
    expect(readEmbeddedJsonElement(EMBEDDED_REPORT_ELEMENT_ID)).toEqual({
      hello: "world",
    });
  });

  it("returns undefined (not an exception) when JSON is malformed", () => {
    setEmbeddedScript(EMBEDDED_REPORT_ELEMENT_ID, "{not valid}");
    expect(() =>
      readEmbeddedJsonElement(EMBEDDED_REPORT_ELEMENT_ID),
    ).not.toThrow();
    expect(readEmbeddedJsonElement(EMBEDDED_REPORT_ELEMENT_ID)).toBeUndefined();
  });
});

describe("readEmbeddedReportPayload", () => {
  it("uses the well-known element id", () => {
    setEmbeddedScript(EMBEDDED_REPORT_ELEMENT_ID, '{"projectName":"Test"}');
    expect(readEmbeddedReportPayload()).toEqual({ projectName: "Test" });
  });
});

describe("readEmbeddedSourcePayloadsRecord", () => {
  it("returns null when the element is missing", () => {
    expect(readEmbeddedSourcePayloadsRecord()).toBeNull();
  });

  it("returns null when the payload is not an object", () => {
    setEmbeddedScript(EMBEDDED_SOURCES_ELEMENT_ID, "[1,2,3]");
    expect(readEmbeddedSourcePayloadsRecord()).toBeNull();
  });

  it("returns the record when it is a plain object", () => {
    setEmbeddedScript(
      EMBEDDED_SOURCES_ELEMENT_ID,
      '{"data/files/0001-foo.json":{"id":"0001-foo"}}',
    );
    expect(readEmbeddedSourcePayloadsRecord()).toEqual({
      "data/files/0001-foo.json": { id: "0001-foo" },
    });
  });
});
