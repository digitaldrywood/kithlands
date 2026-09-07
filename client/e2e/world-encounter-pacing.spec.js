import { expect, test } from "@playwright/test";
const run = Date.now();
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`server-paced walking reaches combat at ${viewport.width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    // Position the test party on a real grass lane away from node boundaries.
    // Actual movement, encounter math, and battle transition remain unmocked.
    await page.evaluate(async () => {
      const b = window.__kithlandsTest,
        state = b.gameState("World");
      const tiles = state.tilemap.tiles,
        nav = b.worldNavigationSnapshot();
      const safe = (x, y) =>
        nav.spawns.every(
          (s) =>
            s.node_id === state.current_location.world_node_id ||
            Math.abs(s.x - x) + Math.abs(s.y - y) > 4,
        );
      let lane;
      for (let y = 1; y < tiles.length - 1 && !lane; y++)
        for (let x = 1; x < tiles[y].length - 2; x++) {
          if (
            tiles[y][x] === 0 &&
            tiles[y][x + 1] === 0 &&
            safe(x, y) &&
            safe(x + 1, y)
          ) {
            lane = { x, y };
            break;
          }
        }
      if (!lane) throw Error("No grass lane");
      b.setPlayerTile(lane.x, lane.y, "World");
      const saved = await b.saveGame("encounter pacing lane", "World");
      if (saved.error) throw Error(saved.error);
      b.setNoEncounters(false);
    });
    let transitions = 0,
      directEncounters = 0;
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      const body = request.postDataJSON();
      if (body?.transition_id === "world-step") transitions++;
      if (body?.type === "encounter") directEncounters++;
    });
    await page.screenshot({
      path: info.outputPath(`pacing-${run}-${viewport.width}-before.png`),
    });
    let moves = 0;
    while (moves < 100) {
      moves++;
      await page.evaluate(
        (dir) => window.__kithlandsTest.movePlayer(dir, "World"),
        moves % 2 ? "right" : "left",
      );
      await page.waitForFunction(
        () =>
          window.__kithlandsTest.activeSceneKey() === "Battle" ||
          !window.__kithlandsTest.worldNavigationSnapshot().animating,
      );
      if (
        await page.evaluate(
          () => window.__kithlandsTest.activeSceneKey() === "Battle",
        )
      )
        break;
    }
    expect(moves).toBeGreaterThanOrEqual(60);
    expect(moves).toBeLessThanOrEqual(100);
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    expect(transitions).toBe(moves);
    expect(directEncounters).toBe(0);
    await page.screenshot({
      path: info.outputPath(
        `pacing-${run}-${viewport.width}-battle-${moves}-steps.png`,
      ),
    });
  });
}
