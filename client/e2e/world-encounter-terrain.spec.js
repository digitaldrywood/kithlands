import { test, expect } from "@playwright/test";

async function startQuickGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
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
    expect(audit.chances.path).toBeCloseTo(3.1, 5);
    expect(audit.chances.grass).toBeCloseTo(15.5, 5);
    expect(audit.chances.darkGrass).toBeCloseTo(31, 5);
    expect(audit.chances.path).toBeLessThan(audit.chances.grass);
    expect(audit.chances.grass).toBeLessThan(audit.chances.darkGrass);

    await page.screenshot({
      path: testInfo.outputPath(`terrain-encounter-audit-${Date.now()}.png`),
      fullPage: true,
    });
  });
});
