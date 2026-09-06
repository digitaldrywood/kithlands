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
  test.setTimeout(60_000);
  await startWorld(page);

  const before = await page.evaluate(() =>
    window.__kithlandsTest.sceneAuditInfo("World"),
  );
  expect(before.leaderClass).toBe("warrior");
  expect(before.playerTextureKey).toBe("warrior_walk");
  const state = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  const expectedClasses = state.party.map(
    (member) => member.sprite_id || member.class_id || "warrior",
  );

  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const after = await page.evaluate(() =>
      window.__kithlandsTest.sceneAuditInfo("World"),
    );
    seen.push(after);
    expect(after.leaderClass).toBe(
      expectedClasses[(i + 1) % expectedClasses.length],
    );
    expect(after.playerTextureKey).toBe(`${after.leaderClass}_walk`);
    expect(after.playerTextureKey.startsWith("player_")).toBe(false);

    const anchor = await page.evaluate(() =>
      window.__kithlandsTest.findStraightAuditAnchor("right", 4, "World"),
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
      window.__kithlandsTest.sampleWalkCycle("right", "World", {
        timeScale: 0.25,
      }),
    );
    expect(moved.every((sample) => sample.moved)).toBe(true);
    expect(moved.every((sample) => sample.hasWalkSheet)).toBe(true);
    expect(
      new Set(moved.map((sample) => sample.frameIndex)).size,
    ).toBeGreaterThanOrEqual(4);
    expect(new Set(moved.map((sample) => sample.displayWidth)).size).toBe(1);
    expect(new Set(moved.map((sample) => sample.displayHeight)).size).toBe(1);
    expect(moved.every((sample) => sample.originX === 0.5)).toBe(true);
    expect(moved.every((sample) => sample.originY === 1)).toBe(true);
  }
  expect(seen.map((snapshot) => snapshot.leaderClass)).toEqual(
    Array.from(
      { length: seen.length },
      (_, index) => expectedClasses[(index + 1) % expectedClasses.length],
    ),
  );

  const proofAnchor = await page.evaluate(() =>
    window.__kithlandsTest.findStraightAuditAnchor("down", 2, "World", true),
  );
  expect(proofAnchor).toBeTruthy();
  await page.evaluate(
    ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
    proofAnchor,
  );
  await page.evaluate(() => {
    window.__kithlandsTest.setPlayerFacing("down", "World");
    window.__kithlandsTest.centerCameraOnPlayer("World");
  });

  const screenshotPath = testInfo.outputPath(
    `world-space-cycle-${Date.now()}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("world-space-cycle", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
