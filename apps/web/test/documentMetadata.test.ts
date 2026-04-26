import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const indexPath = path.join(appRoot, "index.html");
const previewImagePath = path.join(appRoot, "public", "doublcov-full.png");
const description =
  "Find what's missing in LCOV coverage with static, self-contained reports, source browsing, and uncovered navigation.";

describe("document metadata", () => {
  it("declares social preview tags in the source document head", async () => {
    const html = await readFile(indexPath, "utf8");
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.title).toBe("Doublcov");
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(description);

    const expectedTags = [
      ['meta[property="og:type"]', "website"],
      ['meta[property="og:site_name"]', "Doublcov"],
      ['meta[property="og:title"]', "Doublcov"],
      ['meta[property="og:description"]', description],
      ['meta[property="og:image"]', "./doublcov-full.png"],
      ['meta[property="og:image:type"]', "image/png"],
      ['meta[property="og:image:width"]', "1200"],
      ['meta[property="og:image:height"]', "1200"],
      ['meta[property="og:image:alt"]', "Doublcov coverage report preview"],
      ['meta[name="twitter:card"]', "summary_large_image"],
      ['meta[name="twitter:title"]', "Doublcov"],
      ['meta[name="twitter:description"]', description],
      ['meta[name="twitter:image"]', "./doublcov-full.png"],
    ] as const;

    for (const [selector, content] of expectedTags) {
      expect(document.querySelector(selector)?.getAttribute("content")).toBe(
        content,
      );
    }
  });

  it("ships a non-empty preview image from the public asset root", async () => {
    const previewImage = await stat(previewImagePath);
    expect(previewImage.isFile()).toBe(true);
    expect(previewImage.size).toBeGreaterThan(0);
  });
});
