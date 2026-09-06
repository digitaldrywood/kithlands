import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
const run = Date.now();
const proof = new URL(`../tmp/interior-door-${run}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 720, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`walk out of affected houses at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    for (const id of [
      "house_elder_study_1f",
      "house_widow_keep_1f",
      "house_abandoned_passage_1f",
    ]) {
      const template = JSON.parse(
        readFileSync(
          new URL(`../../shared/interiors/${id}.json`, import.meta.url),
          "utf8",
        ),
      );
      await page.evaluate(
        (template) =>
          window.__kithlandsTest.startTownScene({
            node_id: template.id,
            name: template.id,
            tags: ["house"],
            building_type: "house",
            interior_template: template,
          }),
        template,
      );
      await page.waitForFunction(() =>
        window.__kithlandsTest.sceneIsActive("Town"),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("Town"),
      );
      await expect(
        page.getByRole("region", { name: "Exploration controls" }),
      ).toHaveCount(0);
      await page.waitForTimeout(350);
      await page.keyboard.down("ArrowUp");
      try {
        await page.waitForFunction(
          () => window.__kithlandsTest.townSnapshot().playerY === 9,
        );
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      await page.waitForTimeout(350);
      await page.screenshot({
        path: new URL(`${id}-${viewport.width}-clear-door.png`, proof).pathname,
      });
      await page.keyboard.down("ArrowDown");
      await page.waitForFunction(
        () => !window.__kithlandsTest.sceneIsActive("Town"),
      );
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
      await page.keyboard.up("ArrowDown");
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      expect(
        await page.evaluate(() => window.__kithlandsTest.sceneIsActive("Town")),
      ).toBe(false);
    }
    await page.screenshot({
      path: new URL(`outside-${viewport.width}.png`, proof).pathname,
    });
  });
}
