import { expect, test } from "@playwright/test";

test("walk audit route cycles every runtime class in the real World scene", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem("kithlands_prefs", JSON.stringify({ walkSpeed: 1 }));
  });
  await page.goto("/?walkAudit=1&noEncounters=1");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));

  const classes = await page.evaluate(() =>
    window.__kithlandsTest.walkSheetClassIds(),
  );
  const state = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(state.walk_audit).toBe(true);
  expect(state.party.map((member) => member.sprite_id)).toEqual(classes);

  const seen = [];
  for (let index = 0; index < classes.length; index += 1) {
    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.sceneAuditInfo("World"),
    );
    seen.push(snapshot.leaderClass);
    expect(snapshot.playerTextureKey).toBe(`${snapshot.leaderClass}_walk`);

    const anchor = await page.evaluate(() =>
      window.__kithlandsTest.findStraightAuditAnchor("right", 4, "World"),
    );
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
      anchor,
    );
    const movement = await page.evaluate(() =>
      // Observe a complete rendered cycle, as in the all-class atlas audit.
      // Fixed wall-clock samples can all arrive after a slow CI render tick.
      window.__kithlandsTest.sampleWalkCycle("right", "World", {
        timeScale: 0.25,
      }),
    );
    expect(
      new Set(movement.map((sample) => sample.frameIndex)).size,
    ).toBeGreaterThanOrEqual(4);

    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
  }
  expect(seen).toEqual(classes);

  const screenshotPath = testInfo.outputPath(
    `walk-audit-party-${Date.now()}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("walk-audit-party", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
