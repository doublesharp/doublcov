import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  sanitizeCoverageHref,
  sanitizeCoverageReportCustomization,
  parseLcov,
} from "../src/index.js";

const fuzzRuns = Number(process.env.DOUBLCOV_FUZZ_RUNS ?? 500);
const fuzzTimeoutMs = Math.max(5_000, fuzzRuns * 2);

describe("coverage-core fuzz properties", () => {
  it(
    "parseLcov never throws on arbitrary text",
    () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 4_000 }), (input) => {
          expect(() => parseLcov(input)).not.toThrow();
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "parseLcov keeps parsed coverage records internally valid",
    () => {
      const lcovLine = fc.oneof(
        fc.string({ maxLength: 120 }).map((value) => `SF:${value}`),
        fc
          .tuple(
            fc.integer({ min: -20, max: 2_000 }),
            fc.integer({ min: -5, max: 100 }),
          )
          .map(([line, hits]) => `DA:${line},${hits}`),
        fc
          .tuple(
            fc.integer({ min: -20, max: 2_000 }),
            fc.string({ minLength: 1, maxLength: 80 }),
          )
          .map(([line, name]) => `FN:${line},${name}`),
        fc
          .tuple(
            fc.integer({ min: -5, max: 100 }),
            fc.string({ minLength: 1, maxLength: 80 }),
          )
          .map(([hits, name]) => `FNDA:${hits},${name}`),
        fc
          .tuple(
            fc.integer({ min: -20, max: 2_000 }),
            fc.string({ maxLength: 12 }),
            fc.string({ maxLength: 12 }),
            fc.oneof(
              fc.integer({ min: -5, max: 100 }).map(String),
              fc.constant("-"),
            ),
          )
          .map(
            ([line, block, branch, taken]) =>
              `BRDA:${line},${block},${branch},${taken}`,
          ),
        fc.constant("end_of_record"),
        fc.string({ maxLength: 120 }),
      );

      fc.assert(
        fc.property(fc.array(lcovLine, { maxLength: 200 }), (lines) => {
          for (const record of parseLcov(lines.join("\n"))) {
            expect(record.sourceFile.length).toBeGreaterThan(0);
            for (const [line, hits] of record.lines) {
              expect(Number.isInteger(line)).toBe(true);
              expect(line).toBeGreaterThanOrEqual(1);
              expect(Number.isInteger(hits)).toBe(true);
              expect(hits).toBeGreaterThanOrEqual(0);
            }
            for (const fn of record.functions) {
              expect(Number.isInteger(fn.line)).toBe(true);
              expect(fn.line).toBeGreaterThanOrEqual(1);
              expect(Number.isInteger(fn.hits)).toBe(true);
              expect(fn.hits).toBeGreaterThanOrEqual(0);
            }
            for (const branch of record.branches) {
              expect(Number.isInteger(branch.line)).toBe(true);
              expect(branch.line).toBeGreaterThanOrEqual(1);
              if (branch.taken !== null) {
                expect(Number.isInteger(branch.taken)).toBe(true);
                expect(branch.taken).toBeGreaterThanOrEqual(0);
              }
            }
          }
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "sanitizeCoverageHref never returns a dangerous protocol",
    () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 512 }), (href) => {
          const sanitized = sanitizeCoverageHref(href);
          if (sanitized === undefined) return;
          expect(sanitized).not.toMatch(/^[/\\]{2}/);
          const url = new URL(sanitized, "https://doublcov.local/");
          expect(["http:", "https:", "mailto:"]).toContain(url.protocol);
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );

  it(
    "sanitizeCoverageReportCustomization only emits safe theme tokens and hrefs",
    () => {
      fc.assert(
        fc.property(fc.jsonValue({ maxDepth: 5 }), (value) => {
          const customization = sanitizeCoverageReportCustomization(value);
          if (!customization) return;

          for (const theme of customization.themes ?? []) {
            for (const [token, tokenValue] of Object.entries(
              theme.tokens ?? {},
            )) {
              expect(token).toMatch(
                /^(bg|panel|panel-soft|text|muted|border|accent|accent-strong|covered|partial|uncovered|ignored|code-bg|syn-keyword|syn-type|syn-builtin|syn-function|syn-string|syn-number|syn-comment|syn-literal|syn-key|syn-operator|syn-punctuation)$/,
              );
              expect(typeof tokenValue).toBe("string");
              expect(tokenValue.length).toBeLessThanOrEqual(80);
              expect(tokenValue).not.toMatch(/url\s*\(|javascript:/i);
            }
          }

          const hooks = [
            ...(customization.hooks ?? []),
            ...(customization.plugins ?? []).flatMap(
              (plugin) => plugin.hooks ?? [],
            ),
          ];
          for (const hook of hooks) {
            if (!hook.href) continue;
            expect(hook.href).not.toMatch(
              /^[/\\]{2}|^\s*(?:javascript|data|file):/i,
            );
          }
        }),
        { numRuns: fuzzRuns },
      );
    },
    fuzzTimeoutMs,
  );
});
