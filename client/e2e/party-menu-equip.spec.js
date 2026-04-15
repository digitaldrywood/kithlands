import { test, expect } from "@playwright/test";

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startQuickGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

test.describe("party menu equip flow", () => {
  test("buys and equips a weapon from character detail", async ({ page }) => {
    await startQuickGame(page);

    const before = await page.evaluate(
      () => window.__kithlandsTest.gameState("World").equipment[0],
    );
    expect(before.weapon_name).not.toBe("Iron Sword");

    const buyResult = await page.evaluate(() =>
      window.__kithlandsTest.buyItem("iron_sword", "weapon", "World"),
    );
    expect(buyResult.error).toBeFalsy();

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );

    await page.evaluate(() =>
      window.__kithlandsTest.openEquipPickerFromCharacterDetail(
        0,
        "weapon",
        "World",
      ),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("Iron Sword")),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Iron Sword", "World"),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.gameState("World").equipment[0].weapon_name ===
        "Iron Sword",
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );

    const after = await page.evaluate(
      () => window.__kithlandsTest.gameState("World").equipment[0],
    );
    expect(after.weapon_name).toBe("Iron Sword");
    expect(after.weapon_power).toBe(12);
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
      ),
    ).toBe(true);
  });
});
