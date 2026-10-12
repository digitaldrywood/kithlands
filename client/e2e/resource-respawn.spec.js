import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { walkTo } from "./helpers/crafting-progression.js";

const proof = new URL(
  `../tmp/resource-habitats-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });
test.describe.configure({ mode: "parallel" });
for (const width of [1440, 390]) {
  test(`territorial gathering and saved real-time regrowth ${width}`, async ({
    page,
  }) => {
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
      await walkTo(page, node);
      await page.screenshot({
        path: new URL(`${width}-${habitat}-ready.png`, proof).pathname,
      });
    }
    const herb = nodes.find((n) => n.visual === "herb");
    await walkTo(page, herb);
    const gather = page.getByRole("button", {
      name: `Gather — ${herb.name}`,
      exact: true,
    });
    await gather.click();
    await page.waitForFunction(
      (id) =>
        window.__kithlandsTest
          .gameState("World")
          .resources.find((n) => n.id === id)?.gathered,
      herb.id,
    );
    const depleted = (await state()).resources.find((n) => n.id === herb.id);
    expect(depleted.remaining_seconds).toBeGreaterThan(170);
    expect(depleted.respawn_seconds).toBe(180);
    await expect(gather).toBeHidden();
    await page.screenshot({
      path: new URL(`${width}-meadow-depleted.png`, proof).pathname,
    });
    const saveName = `Respawn proof ${width} ${Date.now()}`;
    const saved = await page.evaluate(async (name) => {
      const api = await import("/src/api.js");
      const world = window.__gatherGame.scene.getScene("World");
      const save = await api.saveGame(world.gameState.id, name, {
        x: world.playerX,
        y: world.playerY,
      });
      if (save.error) throw new Error(save.error);
      const entries = await api.listSaves();
      return entries.saves.find((s) => s.name === name);
    }, saveName);
    const restored = await page.evaluate(async (id) => {
      const api = await import("/src/api.js");
      const next = await api.loadSave(id);
      if (next.error) throw new Error(next.error);
      window.__gatherGame.scene
        .getScene("World")
        .scene.restart({ gameState: next });
      return next;
    }, saved.id);
    expect(restored.resources.find((n) => n.id === herb.id).ready_at).toBe(
      depleted.ready_at,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await walkTo(page, herb);
    await expect(gather).toBeHidden();
    // Real server time, with no debug expiry or browser clock manipulation.
    await page.waitForFunction(
      (id) =>
        !window.__kithlandsTest
          .gameState("World")
          .resources.find((n) => n.id === id)?.gathered,
      herb.id,
      { timeout: 195000 },
    );
    await expect(gather).toBeVisible();
    await page.screenshot({
      path: new URL(`${width}-meadow-regrown.png`, proof).pathname,
    });
    await gather.click();
    await page.waitForFunction(
      (id) =>
        window.__kithlandsTest
          .gameState("World")
          .resources.find((n) => n.id === id)?.gathered,
      herb.id,
    );
    expect(
      (await state()).materials.find((m) => m.id === herb.material_id).count,
    ).toBe(herb.quantity * 2);
  });
}
