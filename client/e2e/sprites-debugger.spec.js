import { expect, test } from "@playwright/test";
import {
  WALK_SHEET_CLASS_IDS,
  WALK_SKILL_DIRECTIONS,
} from "../src/scenes/walkFrame.js";

test("sprites debugger validates every native walk sheet and motion loop", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/sprites.html");

  expect(WALK_SHEET_CLASS_IDS).toHaveLength(12);
  expect(WALK_SKILL_DIRECTIONS).toHaveLength(8);
  const walkGrid = page.locator("#walk-grid");

  for (const classId of WALK_SHEET_CLASS_IDS) {
    const card = walkGrid.getByTestId(`walk-sheet-card-${classId}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-loaded", "true");
    await expect(
      walkGrid.getByTestId(`sheet-grid-overlay-${classId}`),
    ).toBeVisible();
    await expect(
      card.locator(`[data-testid^="sheet-boundary-${classId}-"]`),
    ).toHaveCount(48);
    await expect(card).toContainText("384x512 sheet");
    await expect(card).toContainText("8 rows x 6 columns");
    await expect(card).toContainText("64x64 per cell");
    await expect(
      walkGrid.getByTestId(`sheet-cell-${classId}-r0-c0`),
    ).toBeVisible();
    await expect(
      walkGrid.getByTestId(`sheet-cell-${classId}-r7-c5`),
    ).toBeVisible();

    for (const direction of WALK_SKILL_DIRECTIONS) {
      await expect(
        walkGrid.getByTestId(`motion-loop-${classId}-${direction}`),
      ).toBeVisible();
    }
    await expect(
      walkGrid.getByTestId(`travel-preview-${classId}-west`),
    ).toBeVisible();
    await expect(
      walkGrid.getByTestId(`travel-preview-${classId}-east`),
    ).toBeVisible();
  }

  const firstCell = walkGrid.getByTestId("sheet-cell-warrior-r0-c0");
  await firstCell.click();
  await expect(
    walkGrid.getByTestId("sheet-selected-warrior").locator("canvas"),
  ).toBeVisible();
  const warriorCard = walkGrid.getByTestId("walk-sheet-card-warrior");
  await expect(warriorCard).toContainText("Selected:");
  await expect(warriorCard).toContainText("r0-c0");

  for (const classId of ["warrior", "wanderer"]) {
    const screenshotPath = testInfo.outputPath(
      `issue-299-sprites-debugger-${classId}-${Date.now()}.png`,
    );
    await walkGrid
      .getByTestId(`walk-sheet-card-${classId}`)
      .screenshot({ path: screenshotPath });
    await testInfo.attach(`sprites-debugger-${classId}`, {
      path: screenshotPath,
      contentType: "image/png",
    });
  }
});
