import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import path from "node:path";
import { parseCommand } from "../src/args.js";
import { isInsideRoot, shellQuote } from "../src/serverHelpers.js";

const fuzzRuns = Number(process.env.DOUBLCOV_FUZZ_RUNS ?? 500);
const fuzzTimeoutMs = Math.max(5_000, fuzzRuns * 2);

describe("cli fuzz properties", () => {
  it(
    "parseCommand handles arbitrary argv without unexpected throwables",
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ maxLength: 80 }), { maxLength: 40 }),
          (argv) => {
            try {
              const command = parseCommand(argv);
              if ("port" in command) {
                expect(Number.isInteger(command.port)).toBe(true);
                expect(command.port).toBeGreaterThanOrEqual(0);
                expect(command.port).toBeLessThanOrEqual(65_535);
              }
              if ("timeoutMs" in command) {
                expect(Number.isFinite(command.timeoutMs)).toBe(true);
                expect(command.timeoutMs).toBeGreaterThanOrEqual(0);
              }
              if ("options" in command) {
                expect(Number.isInteger(command.options.port)).toBe(true);
                expect(command.options.port).toBeGreaterThanOrEqual(0);
                expect(command.options.port).toBeLessThanOrEqual(65_535);
                expect(Number.isFinite(command.options.timeoutMs)).toBe(true);
                expect(command.options.timeoutMs).toBeGreaterThanOrEqual(0);
              }
            } catch (error) {
              expect(error).toBeInstanceOf(Error);
            }
          },
        ),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "isInsideRoot rejects resolved paths outside the report root",
    () => {
      const root = path.resolve("/tmp/doublcov-root");
      fc.assert(
        fc.property(
          fc.array(fc.string({ maxLength: 24 }), {
            minLength: 1,
            maxLength: 8,
          }),
          (segments) => {
            const target = path.resolve(root, ...segments);
            const relative = path.relative(root, target);
            const expected =
              relative === "" ||
              (!relative.startsWith("..") && !path.isAbsolute(relative));
            expect(isInsideRoot(target, root)).toBe(expected);
          },
        ),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "shellQuote emits a single shell token for arbitrary restart paths",
    () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 256 }), (value) => {
          const quoted = shellQuote(value);
          if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
            expect(quoted).toBe(value);
          } else {
            expect(quoted.startsWith("'")).toBe(true);
            expect(quoted.endsWith("'")).toBe(true);
          }
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );
});
