import { expect, test } from "@playwright/test";

async function startWorld(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.waitForFunction(() => window.__kithlandsTest.activeSceneKey());
  const activeScene = await page.evaluate(() =>
    window.__kithlandsTest.activeSceneKey(),
  );
  expect(activeScene).toBe("Title");
  await page.evaluate(() =>
    window.__kithlandsTest.startQuickGame(`space_${Date.now()}@kithlands.dev`),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await page.evaluate(() => window.__kithlandsTest.setNoEncounters(true));
}

test("real Space key cycles world leader without falling back to generic player sprites", async ({
  page,
}, testInfo) => {
  await startWorld(page);
  await page.locator("#game canvas").click();

  const before = await page.evaluate(() =>
    window.__kithlandsTest.sceneAuditInfo("World"),
  );
  expect(before.leaderClass).toBe("warrior");
  expect(before.playerTextureKey).toBe("warrior_walk");

  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const after = await page.evaluate(() =>
      window.__kithlandsTest.sceneAuditInfo("World"),
    );
    seen.push(after);
    expect(after.playerTextureKey).toBe(`${after.leaderClass}_walk`);
    expect(after.playerTextureKey.startsWith("player_")).toBe(false);

    const anchor = await page.evaluate(() =>
      window.__kithlandsTest.findStraightAuditAnchor("right", 2, "World"),
    );
    expect(anchor).toBeTruthy();
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
      anchor,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.setPlayerFacing("left", "World"),
    );
    const moved = await page.evaluate(() =>
      window.__kithlandsTest.sampleMovePlayer("right", "World"),
    );
    expect(moved.every((sample) => sample.moved)).toBe(true);
    expect(moved.every((sample) => sample.hasWalkSheet)).toBe(true);
    expect(new Set(moved.map((sample) => sample.frameIndex)).size).toBeGreaterThan(
      1,
    );
  }
  expect(new Set(seen.map((snapshot) => snapshot.leaderClass)).size).toBeGreaterThan(
    1,
  );

  const screenshotPath = testInfo.outputPath(
    `world-space-cycle-${Date.now()}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("world-space-cycle", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
