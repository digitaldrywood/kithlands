import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
test("touch exploration retains usable controls and trail action", async ({
  page,
}) => {
  const proof = new URL(
    `../tmp/exploration-touch-${Date.now()}/`,
    import.meta.url,
  );
  mkdirSync(proof, { recursive: true });
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__touchProofGame=game;`,
    });
  });
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await page.touchscreen.tap(195, 300);
  const hud = page.locator(".exploration-hud");
  await expect(hud).toHaveClass(/explore-touch/);
  // Tap inside the painted top edge, outside the former circular reserve.
  const edge = await page.evaluate(() => {
    const s = window.__touchProofGame.scene.getScene("World");
    const upper = s.children.list
      .filter(
        (o) =>
          o.type === "Rectangle" &&
          o.input?.enabled &&
          o.scrollFactorX === 0 &&
          o.scrollFactorY === 0,
      )
      .sort((a, b) => a.getBounds().top - b.getBounds().top)[0];
    const bounds = upper.getBounds(),
      rect = s.game.canvas.getBoundingClientRect();
    return {
      x: rect.x + (bounds.centerX * rect.width) / s.scale.gameSize.width,
      y: rect.y + ((bounds.top + 4) * rect.height) / s.scale.gameSize.height,
      playerX: s.playerX,
      playerY: s.playerY,
    };
  });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.touchscreen.tap(edge.x, edge.y);
  await page.waitForTimeout(200); // Cover the map tap's 80ms deferral and one step.
  const moved = await page.evaluate(() => {
    const s = window.__touchProofGame.scene.getScene("World");
    return { x: s.playerX, y: s.playerY, autoWalk: !!s._autoWalk };
  });
  expect(moved).toEqual({
    x: edge.playerX,
    y: edge.playerY - 1,
    autoWalk: false,
  });
  // Tap back to the original tile through the actual zoomed world camera.
  // This catches fixed-UI cameras accidentally supplying map coordinates.
  const mapTap = await page.evaluate(({ playerX, playerY }) => {
    const s = window.__touchProofGame.scene.getScene("World");
    const camera = s.cameras.main,
      rect = s.game.canvas.getBoundingClientRect();
    const x = (playerX + 0.5) * 32,
      y = (playerY + 0.5) * 32;
    return {
      x:
        rect.x +
        (((x - camera.midPoint.x) * camera.zoom + camera.width / 2) *
          rect.width) /
          s.scale.gameSize.width,
      y:
        rect.y +
        (((y - camera.midPoint.y) * camera.zoom + camera.height / 2) *
          rect.height) /
          s.scale.gameSize.height,
    };
  }, edge);
  await page.touchscreen.tap(mapTap.x, mapTap.y);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.__touchProofGame.scene.getScene("World");
        return { x: s.playerX, y: s.playerY };
      }),
    )
    .toEqual({ x: edge.playerX, y: edge.playerY });
  await page.screenshot({ path: new URL("touch-world.png", proof).pathname });
  await expect(
    hud.getByRole("button", { name: /^Party|^Objective/ }),
  ).toHaveCount(0);
  await expect(hud.locator('[data-route="true"]')).toHaveCount(0);
  await hud.getByRole("button", { name: "Menu", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Your party", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit to main menu", exact: true })
    .tap();
  await page.getByRole("button", { name: "Keep playing", exact: true }).tap();
  await expect(hud).toBeVisible();
  const entry = hud.locator('[data-route="false"]');
  await expect(entry).toBeVisible();
  await entry.tap();
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
  );
  await expect(hud).toHaveCount(0);
});
