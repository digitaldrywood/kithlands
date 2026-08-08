import { expect, test } from "@playwright/test";

test("sprites debugger renders walk-sheet bounds and inspectable cells", async ({
  page,
}, testInfo) => {
  await page.goto("/sprites.html");

  const warriorCard = page.getByTestId("walk-sheet-card-warrior");
  await expect(warriorCard).toBeVisible();
  await expect(warriorCard).toHaveAttribute("data-loaded", "true");

  const overlay = page.getByTestId("sheet-grid-overlay-warrior");
  await expect(overlay).toBeVisible();
  await expect(
    warriorCard.locator('[data-testid^="sheet-boundary-warrior-"]'),
  ).toHaveCount(32);

  const firstCell = page.getByTestId("sheet-cell-warrior-r0-c0");
  await expect(firstCell).toBeVisible();
  await firstCell.click();

  await expect(
    page.getByTestId("sheet-selected-warrior").locator("canvas"),
  ).toBeVisible();
  await expect(warriorCard).toContainText("1024x512 sheet");
  await expect(page.getByTestId("motion-loop-warrior-down")).toBeVisible();
  await expect(page.getByTestId("motion-loop-warrior-up")).toBeVisible();
  await expect(page.getByTestId("motion-loop-warrior-left")).toBeVisible();
  await expect(page.getByTestId("motion-loop-warrior-right")).toBeVisible();
  await expect(page.getByTestId("travel-preview-warrior-left")).toBeVisible();
  await expect(page.getByTestId("travel-preview-warrior-right")).toBeVisible();
  await expect(warriorCard).toContainText("Selected:");
  await expect(warriorCard).toContainText("r0-c0");

  const screenshotPath = testInfo.outputPath(
    `issue-163-sprites-debugger-${Date.now()}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("sprites-debugger", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
