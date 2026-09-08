import { expect, test } from "@playwright/test";
const run = Date.now();
for (const room of [
  { id: "house_elder_study_1f", chest: "elder_study_strongbox", seed: 9 },
  { id: "temple_sunhall_1f", chest: "sunhall_offering_chest", seed: 26 },
])
  test(`${room.id} loads from server selection and treasure opens once`, async ({
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
    await page.evaluate(
      (seed) =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          rng_seed: seed,
          people: [
            { name: "Bob", relation: "friendly" },
            { name: "Willow", relation: "neutral" },
          ],
          places: ["School", "Creswood Corners", "Fire Hall"],
          big_building: "Town Hall",
          party: [
            { name: "Hero", class_id: "warrior" },
            { name: "Willow", class_id: "mender" },
          ],
          difficulty: "normal",
        }),
      room.seed,
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    const spawn = await page.evaluate(
      (room) =>
        window.__kithlandsTest
          .worldNavigationSnapshot()
          .spawns.find(
            (s) =>
              s.interior_template?.id === room.id &&
              s.node_id !==
                window.__kithlandsTest.gameState("World")
                  .settlement_entry_node_id,
          ),
      room,
    );
    expect(spawn).toBeTruthy();
    await page.evaluate(
      (id) => window.__kithlandsTest.approachWorldSpawn(id),
      spawn.node_id,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("Enter", "World"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Town",
    );
    await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.townSnapshot().templateId,
      ),
    ).toBe(room.id);
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
      path: info.outputPath(`${room.id}-${run}-before-chest.png`),
    });
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.waitForFunction(
      (chest) =>
        window.__kithlandsTest
          .townSnapshot()
          .chests.some((c) => c.id === chest && c.opened),
      room.chest,
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
      path: info.outputPath(`${room.id}-${run}-opened.png`),
    });
    expect(errors).toEqual([]);
  });
