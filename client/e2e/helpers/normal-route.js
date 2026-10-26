import { expect } from "@playwright/test";

export async function startNormalRoute(page, seed) {
  if (seed !== undefined) {
    await page.route("**/api/game/new", async (route) => {
      await route.continue({
        postData: JSON.stringify({
          ...route.request().postDataJSON(),
          rng_seed: seed,
        }),
      });
    });
  }
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__normalRouteGame=game;`,
    });
  });
  await page.goto("/");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  const account = page.locator("input");
  await expect(account).toHaveCount(1);
  await account.fill(`normal_route_${Date.now()}@kithlands.dev`);
  await page.getByRole("button", { name: /^Quick start/ }).click();
  await routeReady(page, "World");
}

export async function routeReady(page, key) {
  await page.waitForFunction(
    (key) => window.__kithlandsTest?.activeSceneKey() === key,
    key,
  );
  if (key === "Battle") {
    await page.waitForFunction(
      () => window.__kithlandsTest.visibleTexts("Battle").length > 5,
    );
  } else {
    await page.evaluate(
      (key) => window.__kithlandsTest.waitForSceneReady(key),
      key,
    );
  }
}

// Read a route, then walk every tile with actual key events. No teleport,
// server position mutation, encounter disabling or debug resource grants.
export async function walkNormally(page, key, target) {
  const path = await page.evaluate(
    ({ key, target }) => {
      const scene = window.__normalRouteGame.scene.getScene(key);
      const grid = scene.tileData || scene.tiles;
      const start = { x: scene.playerX, y: scene.playerY };
      const id = (point) => `${point.x},${point.y}`;
      const queue = [start];
      const previous = new Map([[id(start), null]]);
      for (let i = 0; i < queue.length && !previous.has(id(target)); i++) {
        const point = queue[i];
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          const next = { x: point.x + dx, y: point.y + dy };
          const tile = grid[next.y]?.[next.x];
          if (
            previous.has(id(next)) ||
            !Number.isInteger(tile) ||
            !scene.canWalkTile(tile) ||
            (scene.npcs || []).some(
              (npc) => npc.x === next.x && npc.y === next.y,
            )
          )
            continue;
          previous.set(id(next), point);
          queue.push(next);
        }
      }
      if (!previous.has(id(target)))
        throw new Error(`No walkable ${key} route`);
      const path = [];
      for (
        let point = target;
        previous.get(id(point));
        point = previous.get(id(point))
      )
        path.unshift(point);
      return path;
    },
    { key, target },
  );
  for (const next of path) {
    const before = await page.evaluate((key) => {
      const scene = window.__normalRouteGame.scene.getScene(key);
      return { x: scene.playerX, y: scene.playerY };
    }, key);
    const direction =
      next.x > before.x
        ? "ArrowRight"
        : next.x < before.x
          ? "ArrowLeft"
          : next.y > before.y
            ? "ArrowDown"
            : "ArrowUp";
    // Movement samples held keys on game frames. A fixed 40ms press can fall
    // entirely between frames on a loaded runner. Keep native input down until
    // the requested step starts, then release before waiting for its animation
    // and authoritative arrival. Never retry/skip a tile to hide a mismatch.
    await page.keyboard.down(direction);
    try {
      await page.waitForFunction(
        ({ key, next }) => {
          const scene = window.__normalRouteGame.scene.getScene(key);
          return (
            window.__kithlandsTest.activeSceneKey() !== key ||
            (scene.playerX === next.x && scene.playerY === next.y)
          );
        },
        { key, next },
      );
    } finally {
      await page.keyboard.up(direction);
    }
    await page.waitForFunction(
      ({ key, next }) => {
        const scene = window.__normalRouteGame.scene.getScene(key);
        return (
          window.__kithlandsTest.activeSceneKey() !== key ||
          (scene.playerX === next.x &&
            scene.playerY === next.y &&
            !scene.animating)
        );
      },
      { key, next },
    );
    const current = await page.evaluate(() =>
      window.__kithlandsTest.activeSceneKey(),
    );
    if (current !== key) return current; // Let the caller handle real encounters.
  }
  return key;
}

export async function clickRouteText(page, label, key, touch = false) {
  // Let Phaser register freshly rebuilt canvas hit areas before pointer input.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const position = await page.evaluate(
    ({ label, key }) =>
      window.__kithlandsTest.interactiveTextPosition(label, key),
    { label, key },
  );
  expect(position, `visible ${label}`).toBeTruthy();
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
}

export async function chooseStoryAction(page, id) {
  const action = await page.evaluate(
    (id) =>
      window.__kithlandsTest
        .gameState("Dungeon")
        .dungeon.actions.find((a) => a.id === id),
    id,
  );
  expect(action).toBeTruthy();
  for (let index = 0; index < 4; index++) {
    const visible = await page.evaluate(
      (label) =>
        !!window.__kithlandsTest.interactiveTextPosition(label, "Dungeon"),
      action.label,
    );
    if (visible) break;
    const more = await page.evaluate(
      () =>
        window.__kithlandsTest
          .visibleTexts("Dungeon")
          .find((t) => t.text.startsWith("More routes"))?.text,
    );
    expect(more).toBeTruthy();
    await clickRouteText(page, more, "Dungeon");
  }
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/dungeon") &&
      r.request().postDataJSON()?.action_id === id,
  );
  await clickRouteText(page, action.label, "Dungeon");
  if (action.encounter?.optional)
    await page.getByRole("button", { name: "Fight", exact: true }).click();
  const result = await (await response).json();
  expect(result.error).toBeUndefined();
  await routeReady(page, result.phase === "combat" ? "Battle" : "Dungeon");
  return result;
}

export async function openNormalMerchant(page, approach = { x: 7, y: 5 }) {
  await walkNormally(page, "Town", approach);
  // A proprietor can finish a quest interaction before offering the shop.
  // Wait for each actual dialogue or released interaction lock, then confirm.
  for (let index = 0; index < 32; index++) {
    await page.waitForFunction(() => {
      const scene = window.__normalRouteGame.scene.getScene("Town");
      return (
        scene.shopDialog ||
        scene._modalLocks?.has("dialogue") ||
        (!scene.animating && !scene._modalLocks?.size)
      );
    });
    const before = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Town").map((t) => t.text),
    );
    if (before.includes("Leave Shop")) return;
    await page.keyboard.press("Enter");
    await page.waitForFunction((previous) => {
      const scene = window.__normalRouteGame.scene.getScene("Town");
      return (
        window.__kithlandsTest
          .visibleTexts("Town")
          .map((t) => t.text)
          .join("\n") !== previous ||
        (!scene.animating && !scene._modalLocks?.size)
      );
    }, before.join("\n"));
  }
  throw new Error("Merchant dialogue did not finish");
}
