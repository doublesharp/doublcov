import { describe, expect, it } from "vitest";
import { helpText, parseCommand } from "../src/args.js";

describe("parseCommand top-level behavior", () => {
  it("treats no args as help", () => {
    expect(parseCommand([])).toEqual({ name: "help" });
  });

  it("accepts -h as a top-level help flag", () => {
    expect(parseCommand(["-h"])).toEqual({ name: "help" });
  });

  it("rejects unknown subcommands with a helpful message", () => {
    expect(() => parseCommand(["definitely-not-a-builder"])).toThrow(
      /Unknown command "definitely-not-a-builder"/,
    );
  });

  it("returns helpText() without throwing and includes key sections", () => {
    const text = helpText();
    expect(typeof text).toBe("string");
    expect(text).toMatch(/Doublcov/);
    expect(text).toMatch(/Usage:/);
    expect(text).toMatch(/Builder options:/);
    expect(text).toMatch(/Build options:/);
    expect(text).toMatch(/Open options:/);
  });
});

describe("parseCommand shared option validation", () => {
  it("rejects out-of-range, fractional, or non-numeric --port values", () => {
    expect(() => parseCommand(["forge", "--port", "65536"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port", "-1"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port", "abc"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port", "1.5"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["open", "--port", "70000"])).toThrow(
      /Invalid --port/,
    );
  });

  it("accepts valid --port values at both ends of the range", () => {
    expect(parseCommand(["forge", "--port", "0"])).toMatchObject({
      options: { port: 0 },
    });
    expect(parseCommand(["forge", "--port", "1"])).toMatchObject({
      options: { port: 1 },
    });
    expect(parseCommand(["forge", "--port", "65535"])).toMatchObject({
      options: { port: 65535 },
    });
  });

  it("rejects empty or whitespace-only --port values", () => {
    expect(() => parseCommand(["forge", "--port=", "--", "x"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port=   "])).toThrow(
      /Invalid --port/,
    );
  });

  it("rejects --port given as hex/exponent notation", () => {
    expect(() => parseCommand(["forge", "--port=0x10"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseCommand(["forge", "--port=1e2"])).toThrow(
      /Invalid --port/,
    );
  });

  it("rejects an --open value that is not true or false", () => {
    expect(() => parseCommand(["build", "--open=maybe"])).toThrow(
      /Invalid --open/,
    );
  });

  it("rejects missing values for known value-taking flags", () => {
    expect(() => parseCommand(["build", "--lcov", "--out", "report"])).toThrow(
      /Missing value for --lcov/,
    );
    expect(() => parseCommand(["build", "--out"])).toThrow(
      /Missing value for --out/,
    );
    expect(() =>
      parseCommand(["build", "--sources", "--mode", "static"]),
    ).toThrow(/Missing value for --sources/);
    expect(() => parseCommand(["open", "--dir"])).toThrow(
      /Missing value for --dir/,
    );
  });

  it("ignores malformed empty-key flags without consuming valid flags", () => {
    expect(
      parseCommand(["build", "--=foo", "--lcov", "lcov.info"]),
    ).toMatchObject({
      name: "build",
      options: { lcov: "lcov.info" },
    });
  });

  it("leaves unknown valueless flags undefined when followed by another flag", () => {
    expect(
      parseCommand(["build", "--frobnicate", "--lcov", "lcov.info"]),
    ).toMatchObject({
      name: "build",
      options: { lcov: "lcov.info" },
    });
  });
});
