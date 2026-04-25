import { expect, test } from "@playwright/test";

test("renders a generated report and navigates to uncovered source", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Playwright Fixture Coverage" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "src/Counter.sol" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Diagnostics" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Line 10.*line.*src\/Counter\.sol:10/ })
    .click();

  await expect(page).toHaveURL(/line=10/);
  await expect(page.locator("#L10")).toContainText("} else {");
});

test("sanitizes untrusted report customization in the browser", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Unsafe Link")).toBeVisible();
  await expect(page.getByRole("link", { name: "Safe Link" })).toHaveAttribute(
    "href",
    "https://example.test/report",
  );
  await expect(page.locator("a", { hasText: "Unsafe Link" })).toHaveCount(0);
  await expect(page.locator("strong")).toHaveCount(0);
  await expect(
    page.getByText("<strong>rendered as text</strong>"),
  ).toBeVisible();

  const backgroundToken = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--bg"),
  );
  expect(backgroundToken).not.toContain("javascript:");
});
