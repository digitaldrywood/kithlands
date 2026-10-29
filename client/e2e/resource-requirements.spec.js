import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { walkTo } from "./helpers/crafting-progression.js";

const proof = new URL(
  `../tmp/resource-requirements-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 800, 390]) {
  test(`rare gathering explains its requirement before input at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
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
    const before = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    const node = before.resources.find(
      (resource) => resource.required_level > 1,
    );
    expect(node).toBeTruthy();
    expect(
      Math.max(...before.party.map((member) => member.level)),
    ).toBeLessThan(node.required_level);
    await walkTo(page, { x: node.x, y: node.y });
    const prompt = page.getByRole("button", {
      name: `Gather — ${node.name} · Requires party Lv.${node.required_level}`,
      exact: true,
    });
    await expect(prompt).toBeVisible();
    const box = await prompt.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: new URL(`${width}-rare-before.png`, proof).pathname,
    });
    if (width === 390) await prompt.click();
    else await page.keyboard.press("Enter");
    await expect(page.locator(".explore-notice")).toContainText(
      `party level ${node.required_level} required`,
    );
    const after = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    expect(after.materials).toEqual(before.materials);
    expect(
      after.resources.find((resource) => resource.id === node.id).gathered,
    ).toBeFalsy();
    await expect(prompt).toBeEnabled();
    await page.screenshot({
      path: new URL(`${width}-rare-rejected.png`, proof).pathname,
    });
    // Advance one member through Go only; this is an eligibility fixture,
    // not evidence that the opening route naturally reaches this level.
    await page.evaluate(async (level) => {
      const api = await import("/src/api.js");
      const world = window.__gatherGame.scene.getScene("World");
      const state = await api.debugSetPartyLevels(world.gameState.id, [
        { slot: 0, level },
      ]);
      if (state.error) throw new Error(state.error);
      world.gameState = state;
    }, node.required_level);
    await prompt.click();
    await page.waitForFunction(
      (id) =>
        window.__kithlandsTest
          .gameState("World")
          .resources.find((resource) => resource.id === id)?.gathered,
      node.id,
    );
    const gathered = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    expect(
      gathered.materials.find((material) => material.id === node.material_id)
        .count,
    ).toBe(node.quantity);
    expect(
      gathered.resources.find((resource) => resource.id === node.id)
        .remaining_seconds,
    ).toBeGreaterThan(0);
    await page.screenshot({
      path: new URL(`${width}-rare-gathered.png`, proof).pathname,
    });
  });
}
