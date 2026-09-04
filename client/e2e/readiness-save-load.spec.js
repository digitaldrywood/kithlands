import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const proofDir = path.join("tmp", "readiness", `load-${Date.now()}`);
mkdirSync(proofDir, { recursive: true });

for (const [width, height] of [
  [1280, 720],
  [390, 844],
]) {
  test(`Title load removes the email field at ${width}x${height}`, async ({
    page,
  }) => {
    const email = `load-${Date.now()}@test.dev`;
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    const before = await page.evaluate(
      (address) => window.__kithlandsTest.startQuickGame(address),
      email,
    );
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest.saveGame("Load cleanup proof"),
      ),
    ).toMatchObject({ status: "saved" });

    await page.reload();
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.locator('input[type="email"]').fill(email);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("LOAD GAME", "Title"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Title")
        .some((entry) => entry.text === "Load cleanup proof"),
    );
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await page.screenshot({
      path: path.join(proofDir, `${width}x${height}-save-menu.png`),
    });

    // Title's first manual save row is centered at (400,115) in its 800x600
    // logical canvas. Click the actual row, which invokes Title.loadGameSave.
    const box = await page.locator("canvas").boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(
      box.x + box.width / 2,
      box.y + (115 / 600) * box.height,
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    const restored = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    expect(restored.party).toEqual(before.party);
    expect(restored.gold).toBe(before.gold);
    await page.screenshot({
      path: path.join(proofDir, `${width}x${height}-loaded-world.png`),
    });
  });
}
