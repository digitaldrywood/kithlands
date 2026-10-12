import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { walkTo } from "./helpers/crafting-progression.js";

const proof = new URL(
  `../tmp/territorial-gathering-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });
test.describe.configure({ mode: "parallel" });
for (const width of [1440, 390, 800]) {
  test(`resource habitats and depleted art ${width}`, async ({ page }) => {
    test.setTimeout(480000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__gatherGame = game;`,
      });
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    const state = () =>
      page.evaluate(() => window.__kithlandsTest.gameState("World"));
    const nodes = (await state()).resources;
    for (const habitat of ["rocky", "woodland", "meadow"]) {
      const node = nodes.find(
        (n) => n.habitat === habitat && !n.required_level,
      );
      expect(node.habitat_tiles.length).toBeGreaterThan(0);
      const adjacent = await page.evaluate((n) => {
        const scene = window.__gatherGame.scene.getScene("World");
        return [
          { x: n.x - 1, y: n.y },
          { x: n.x + 1, y: n.y },
          { x: n.x, y: n.y + 1 },
          { x: n.x, y: n.y - 1 },
        ].find((p) => scene.canWalkTile(scene.tileData[p.y]?.[p.x]));
      }, node);
      await walkTo(page, adjacent);
      await page.screenshot({
        path: new URL(`${width}-${habitat}-ready.png`, proof).pathname,
      });
      await page
        .getByRole("button", { name: `Gather — ${node.name}`, exact: true })
        .click();
      await page.waitForFunction(
        (id) =>
          window.__kithlandsTest
            .gameState("World")
            .resources.find((n) => n.id === id)?.gathered,
        node.id,
      );
      const depleted = (await state()).resources.find((n) => n.id === node.id);
      expect(depleted.remaining_seconds).toBeGreaterThan(
        node.respawn_seconds - 5,
      );
      await page.screenshot({
        path: new URL(`${width}-${habitat}-depleted.png`, proof).pathname,
      });
    }
  });
}
