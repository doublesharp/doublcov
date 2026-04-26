import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/args.js";

describe("parseCommand serve and open arguments", () => {
  it("parses static server options", () => {
    expect(
      parseCommand([
        "serve",
        "coverage/report",
        "--port",
        "0",
        "--timeout",
        "45m",
      ]),
    ).toMatchObject({
      name: "serve",
      reportDir: "coverage/report",
      port: 0,
      timeoutMs: 45 * 60 * 1000,
    });
  });

  it("rejects malformed --timeout values", () => {
    expect(() => parseCommand(["serve", "--timeout", "5x"])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", "abc"])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", "-5m"])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", ""])).toThrow(
      /Missing value for --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout="])).toThrow(
      /Invalid --timeout/,
    );
    expect(() => parseCommand(["serve", "--timeout", "1.5h"])).toThrow(
      /Invalid --timeout/,
    );
  });

  it("converts valid --timeout durations correctly", () => {
    expect(parseCommand(["serve", "--timeout", "0"])).toMatchObject({
      timeoutMs: 0,
    });
    expect(parseCommand(["serve", "--timeout", "500ms"])).toMatchObject({
      timeoutMs: 500,
    });
    expect(parseCommand(["serve", "--timeout", "30s"])).toMatchObject({
      timeoutMs: 30 * 1000,
    });
    expect(parseCommand(["serve", "--timeout", "2h"])).toMatchObject({
      timeoutMs: 2 * 60 * 60 * 1000,
    });
  });

  it("skips empty positional tokens when resolving the open report directory", () => {
    expect(parseCommand(["open", "", "real-report-dir"])).toMatchObject({
      name: "open",
      reportDir: "real-report-dir",
    });
  });
});
