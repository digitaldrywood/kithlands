import { expect, test } from "@playwright/test";
const run = Date.now();
test("elder house loads from server selection and treasure opens once", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 645, height: 847 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  const spawn = await page.evaluate(() =>
    window.__kithlandsTest
      .worldNavigationSnapshot()
      .spawns.find(
        (s) =>
          s.interior_template?.id === "house_elder_study_1f" &&
          s.node_id !==
            window.__kithlandsTest.gameState("World").settlement_entry_node_id,
      ),
  );
  expect(spawn).toBeTruthy();
  await page.evaluate(
    (id) => window.__kithlandsTest.approachWorldSpawn(id),
    spawn.node_id,
  );
  await page.evaluate(() => window.__kithlandsTest.pressKey("Enter", "World"));
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Town",
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
  expect(
    await page.evaluate(() => window.__kithlandsTest.townSnapshot().templateId),
  ).toBe("house_elder_study_1f");
  const route = await page.evaluate(() => {
    const s = window.__kithlandsTest.townNavigationSnapshot();
    const target = { x: 11, y: 9 },
      queue = [{ x: s.x, y: s.y, path: [] }],
      seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (p.x === target.x && p.y === target.y) return p.path;
      for (const [dir, dx, dy] of [
        ["up", 0, -1],
        ["down", 0, 1],
        ["left", -1, 0],
        ["right", 1, 0],
      ]) {
        const x = p.x + dx,
          y = p.y + dy,
          key = `${x},${y}`;
        if (s.walkable[y]?.[x] && !seen.has(key)) {
          seen.add(key);
          queue.push({ x, y, path: [...p.path, dir] });
        }
      }
    }
    throw Error("Chest approach unreachable");
  });
  for (const dir of route)
    await page.evaluate(
      (dir) => window.__kithlandsTest.sampleMovePlayer(dir, "Town"),
      dir,
    );
  await page.screenshot({
    path: info.outputPath(`elder-house-${run}-before-chest.png`),
  });
  await page.evaluate(() => window.__kithlandsTest.interact("Town"));
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .townSnapshot()
      .chests.some((c) => c.id === "elder_study_strongbox" && c.opened),
  );
  const flags = await page.evaluate(
    () => window.__kithlandsTest.gameState("Town").triggered_flags,
  );
  await page.evaluate(() => window.__kithlandsTest.interact("Town"));
  expect(
    await page.evaluate(
      () => window.__kithlandsTest.gameState("Town").triggered_flags,
    ),
  ).toEqual(flags);
  await page.screenshot({
    path: info.outputPath(`elder-house-${run}-opened.png`),
  });
  expect(errors).toEqual([]);
});
