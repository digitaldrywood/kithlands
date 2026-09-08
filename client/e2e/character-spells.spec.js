import { expect, test } from "@playwright/test";
test.use({ hasTouch: true });
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 645, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`character spells cast repeatedly at ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.setPartyVitals(
        [
          { slot: 0, hp: 1 },
          { slot: 1, hp: 1 },
          { slot: 3, mp: 4 },
        ],
        "World",
      ),
    );
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: /^Character/i }).click();
    await page.getByRole("tab", { name: "Spells", exact: true }).click();
    await page
      .getByRole("button", { name: "Next character", exact: true })
      .click();
    await expect(page.locator(".loadout-panel")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Recommend Gear" }),
    ).toHaveCount(0);
    await expect(page.locator(".spell-casting")).toContainText("Battle only");
    await page.screenshot({
      path: info.outputPath(`${Date.now()}-battle-spells.png`),
    });
    await page
      .getByRole("button", { name: "Next character", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Next character", exact: true })
      .click();
    await expect(page.locator(".spell-resources")).toContainText("MP 4/");
    await page.screenshot({
      path: info.outputPath(`${Date.now()}-field-spells-before.png`),
    });
    const hero = page.getByRole("button", {
      name: "Cast Cure on Hero",
      exact: true,
    });
    if (viewport.width === 1440) {
      await hero.focus();
      await page.keyboard.press("Enter");
    } else if (viewport.width === 390) await hero.tap();
    else await hero.click();
    await expect(page.locator(".spell-resources")).toContainText("MP 2/");
    await page
      .getByRole("button", { name: "Cast Cure on Sparks", exact: true })
      .click();
    await expect(page.locator(".spell-resources")).toContainText("MP 0/");
    await expect(page.locator(".spell-casting")).toContainText("Not enough MP");
    await expect(
      page.getByRole("button", { name: "Cast Cure on Hero", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: info.outputPath(`${Date.now()}-field-spells-after.png`),
    });
    await page.getByRole("tab", { name: "Summary", exact: true }).click();
    await expect(page.locator(".loadout-panel")).toBeVisible();
    await page
      .getByRole("button", { name: "Close equipment", exact: true })
      .click();
    await expect(page.locator(".kith-equipment-screen")).toHaveCount(0);
  });
}
