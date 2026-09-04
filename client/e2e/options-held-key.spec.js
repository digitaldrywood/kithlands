import { expect, test } from "@playwright/test";

// Regression from independent PR #308 review: Phaser drops the direction's
// keyup while the DOM dialog owns input. Exercise the real Party return path.
for (const direction of ["ArrowRight", "d"]) {
  test(`releasing ${direction} inside Options leaves the party stationary`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(async () => {
      const { WorldScene } = await import("/src/scenes/world.js");
      const update = WorldScene.prototype.update;
      WorldScene.prototype.update = function (...args) {
        window.__heldKeyWorld = this;
        return update.apply(this, args);
      };
      await window.__kithlandsTest.startQuickGame();
    });
    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.keyboard.down(direction);
    await page.waitForFunction((key) => {
      const scene = window.__heldKeyWorld;
      return (key === "d" ? scene.wasd.D : scene.cursors.right).isDown;
    }, direction);
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("OPTIONS", "World"),
    );
    await expect(
      page.getByRole("dialog", { name: "Options", exact: true }),
    ).toBeVisible();
    await page.keyboard.up(direction);
    await page.getByRole("button", { name: "Back to Party" }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    const snapshot = () =>
      page.evaluate((key) => {
        const scene = window.__heldKeyWorld;
        return {
          x: scene.playerX,
          y: scene.playerY,
          down: (key === "d" ? scene.wasd.D : scene.cursors.right).isDown,
        };
      }, direction);
    const returned = await snapshot();
    expect(returned.down).toBe(false);
    // Observe longer than multiple movement steps; an unchanged frame is not
    // enough to rule out a latched key that moves on the next update.
    await page.waitForTimeout(650);
    expect(await snapshot()).toEqual(returned);
  });
}
