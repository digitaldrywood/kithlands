import { test, expect } from "@playwright/test";

async function startQuickGame(page) {
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

test.describe("world encounter terrain audit", () => {
  test("road, grass, and dark grass use different encounter rates", async ({
    page,
  }, testInfo) => {
    await startQuickGame(page);

    const audit = await page.evaluate(() =>
      window.__kithlandsTest.worldEncounterAudit(7, "World"),
    );

    expect(audit.path).toBeTruthy();
    expect(audit.grass).toBeTruthy();
    expect(audit.darkGrass).toBeTruthy();
    expect(audit.pacing.minimum_grass_steps).toBe(60);
    expect(audit.pacing.maximum_grass_steps).toBe(100);
    expect(audit.pacing.terrain_weights[1]).toBe(0.2);
    expect(audit.pacing.terrain_weights[0]).toBe(1);
    expect(audit.pacing.terrain_weights[9]).toBe(2);

    await page.screenshot({
      path: testInfo.outputPath(`terrain-encounter-audit-${Date.now()}.png`),
      fullPage: true,
    });
  });
});
