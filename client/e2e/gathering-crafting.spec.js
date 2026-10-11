import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const proof = new URL(`../tmp/gathering-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
const state = (page, scene = "World") =>
  page.evaluate((key) => window.__kithlandsTest.gameState(key), scene);
const capture = (page, label) =>
  page.screenshot({ path: new URL(`${label}.png`, proof).pathname });

test("keyboard harvest restores movement after the crafting menu closes", async ({
  page,
}) => {
  page.setDefaultTimeout(15_000);
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
  const node = (await state(page)).resources[0];
  await walkTo(page, { x: node.x, y: node.y });
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) =>
      window.__kithlandsTest
        .gameState("World")
        .resources.find((r) => r.id === id)?.gathered,
    node.id,
  );
  expect(
    (await state(page)).materials.find((m) => m.id === node.material_id).count,
  ).toBe(node.quantity);
  await menu(page);
  await page.getByRole("button", { name: /Crafting/i }).click();
  await expect(
    page.getByRole("dialog", { name: "Crafting", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const move = await page.evaluate(() => {
    const scene = window.__gatherGame.scene.getScene("World");
    const choices = [
      [1, 0, "ArrowRight"],
      [-1, 0, "ArrowLeft"],
      [0, 1, "ArrowDown"],
      [0, -1, "ArrowUp"],
    ];
    const [dx, dy, key] = choices.find(
      ([x, y]) =>
        Number.isInteger(
          scene.tileData[scene.playerY + y]?.[scene.playerX + x],
        ) &&
        scene.canWalkTile(scene.tileData[scene.playerY + y][scene.playerX + x]),
    );
    return { key, x: scene.playerX + dx, y: scene.playerY + dy };
  });
  await page.keyboard.down(move.key);
  await page.waitForFunction(({ x, y }) => {
    const scene = window.__gatherGame.scene.getScene("World");
    return scene.playerX === x && scene.playerY === y;
  }, move);
  await page.keyboard.up(move.key);
  await page.waitForFunction(
    () => !window.__gatherGame.scene.getScene("World").animating,
  );
  await capture(page, "keyboard-harvest-movement-restored");
});

// Walk every tile through the normal scene and authoritative world-step API.
async function walkTo(page, destination) {
  await page.evaluate(async (target) => {
    const scene = window.__gatherGame.scene.getScene("World");
    const start = { x: scene.playerX, y: scene.playerY };
    const key = (p) => `${p.x},${p.y}`;
    const queue = [start];
    const previous = new Map([[key(start), null]]);
    for (let i = 0; i < queue.length && !previous.has(key(target)); i++) {
      const p = queue[i];
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const next = { x: p.x + dx, y: p.y + dy };
        const tile = scene.tileData[next.y]?.[next.x];
        if (
          previous.has(key(next)) ||
          !Number.isInteger(tile) ||
          !scene.canWalkTile(tile)
        )
          continue;
        previous.set(key(next), p);
        queue.push(next);
      }
    }
    if (!previous.has(key(target)))
      throw new Error("Resource has no walkable route");
    const path = [];
    for (let p = target; previous.get(key(p)); p = previous.get(key(p)))
      path.unshift(p);
    for (const p of path) {
      while (scene.animating) await new Promise(requestAnimationFrame);
      scene.tryMove(p.x - scene.playerX, p.y - scene.playerY);
      await scene.worldStepDone;
      while (scene.animating) await new Promise(requestAnimationFrame);
      if (scene.playerX !== p.x || scene.playerY !== p.y)
        throw new Error("Authoritative walking rejected step");
    }
    scene.updateInteractionTarget();
  }, destination);
}

async function menu(page) {
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: /Crafting/i })).toBeVisible();
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [800, 600],
]) {
  test(`gather, craft, save and fight with crafted equipment ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        "kithlands_prefs",
        JSON.stringify({ walkSpeed: 1, battleSpeed: 3 }),
      ),
    );
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
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    const before = await state(page);
    expect(before.resources.length).toBeGreaterThanOrEqual(4);
    const nodes = before.resources.slice(0, 4);
    const distant = await page.evaluate(async (id) => {
      const api = await import("/src/api.js");
      return api.gatherResource(
        window.__kithlandsTest.gameState("World").id,
        id,
      );
    }, nodes[0].id);
    expect(distant.error).toContain("walk next to");
    await menu(page);
    await page.getByRole("button", { name: /Crafting/i }).click();
    const crafting = page.getByRole("dialog", {
      name: "Crafting",
      exact: true,
    });
    await expect(
      crafting.getByRole("button", { name: "Forge Iron Sword", exact: true }),
    ).toBeDisabled();
    await capture(page, `${width}-locked-recipe`);
    await crafting.getByRole("button", { name: "Close", exact: true }).click();
    await page.keyboard.press("Escape");
    for (const node of nodes) {
      await walkTo(page, { x: node.x, y: node.y });
      const gather = page.getByRole("button", {
        name: `Gather — ${node.name}`,
        exact: true,
      });
      await expect(gather).toBeVisible();
      if (node === nodes[0]) await capture(page, `${width}-herbs-on-trail`);
      if (node.visual === "mineral")
        await capture(page, `${width}-mineral-on-trail`);
      await gather.click();
      await page.waitForFunction(
        (id) =>
          window.__kithlandsTest
            .gameState("World")
            .resources.find((r) => r.id === id)?.gathered,
        node.id,
      );
    }
    const harvested = await state(page);
    expect(harvested.materials.find((m) => m.id === "meadow_herb").count).toBe(
      6,
    );
    expect(harvested.materials.find((m) => m.id === "ember_ore").count).toBe(8);
    const duplicate = await page.evaluate(async (id) => {
      const api = await import("/src/api.js");
      return api.gatherResource(
        window.__kithlandsTest.gameState("World").id,
        id,
      );
    }, nodes[0].id);
    expect(duplicate.error).toContain("already been gathered");
    await menu(page);
    await page.getByRole("button", { name: /Crafting/i }).click();
    for (const label of [
      "Brew Potion",
      "Refine Ember Shards",
      "Forge Iron Sword",
    ]) {
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/field-craft"),
      );
      await crafting.getByRole("button", { name: label, exact: true }).click();
      expect((await (await response).json()).error).toBeFalsy();
      await expect(crafting.getByRole("status")).toContainText(
        `${label} complete`,
      );
    }
    await capture(page, `${width}-crafted-results`);
    const crafted = await state(page);
    expect(crafted.potions).toBe(before.potions + 1);
    expect(crafted.gems.find((g) => g.id === "ember_shard").count).toBe(6);
    const sword = crafted.items.find(
      (item) => item.name === "Iron Sword" && item.instance_id,
    );
    expect(sword).toBeTruthy();
    expect(sword.sockets).toHaveLength(1);
    await crafting
      .getByRole("button", { name: "Gem workshop", exact: true })
      .click();
    await page.getByRole("button", { name: /Transmute ·/ }).click();
    await page.locator('[data-recipe-id="refine_ember_gem"]').click();
    await page
      .getByRole("region", { name: "Recipe preview" })
      .locator(".gem-confirm")
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Created 1 × Ember Gem",
    );
    await capture(page, `${width}-gathered-mineral-to-gem`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await crafting.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
    );
    await page.locator('[data-slot-id="main_hand"]').click();
    await page
      .locator(".equipment-item-row:not(.is-disabled)")
      .filter({ hasText: "Iron Sword" })
      .click();
    await page
      .getByRole("button", { name: "Equip in Weapon", exact: true })
      .click();
    await expect(page.locator('[data-slot-id="main_hand"]')).toContainText(
      "Iron Sword",
    );
    await capture(page, `${width}-crafted-sword-equipped`);
    await page.getByRole("button", { name: "Socket", exact: true }).click();
    const socketPreview = page.getByRole("region", { name: "Socket preview" });
    await expect(page.locator("#gem-equipment")).toHaveValue(sword.instance_id);
    await socketPreview.locator(".gem-confirm").click();
    await expect(page.getByRole("status")).toContainText("Ember Gem socketed");
    expect((await state(page)).equipment[0].weapon_item.sockets[0].gem_id).toBe(
      "ember_gem",
    );
    await capture(page, `${width}-crafted-sword-socketed`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const saved = await page.evaluate(async () => {
      const scene = window.__gatherGame.scene.getScene("World");
      const api = await import("/src/api.js");
      const receipt = await api.saveGame(
        scene.gameState.id,
        "Gathering proof",
        { x: scene.playerX, y: scene.playerY },
      );
      if (receipt.error) throw new Error(receipt.error);
      const saves = await api.listSaves();
      const entry = saves.saves.find((save) => save.name === "Gathering proof");
      if (!entry) throw new Error("Saved gathering game missing from list");
      const restored = await api.loadSave(entry.id);
      if (restored.error) throw new Error(restored.error);
      window.__kithlandsTest.startScene("World", { gameState: restored });
      return restored;
    });
    expect(saved.equipment[0].weapon_item.instance_id).toBe(sword.instance_id);
    expect(saved.materials.find((m) => m.id === "ember_ore").count).toBe(0);
    expect(
      saved.resources
        .filter((r) => nodes.some((n) => n.id === r.id))
        .every((r) => r.gathered),
    ).toBe(true);
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.keyboard.press("Tab");
    await page
      .getByRole("button", { name: /Follow route to The Old Mill/ })
      .click();
    await page
      .getByRole("button", { name: "Old Mill trail", exact: true })
      .click({ timeout: 90_000 });
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.activeSceneKey() === "Dungeon" &&
        window.__kithlandsTest.gameState()?.dungeon?.room_id === "approach",
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Dungeon")
        .some((entry) => entry.text === "Party"),
    );
    const action = (await state(page, "Dungeon")).dungeon.actions.find(
      (a) => a.id === "trail-bats",
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      const texts = await page.evaluate(() =>
        window.__kithlandsTest.visibleTexts("Dungeon"),
      );
      if (texts.some((entry) => entry.text === action.label)) {
        await page.evaluate(
          (label) =>
            window.__kithlandsTest.clickInteractiveText(label, "Dungeon"),
          action.label,
        );
        break;
      }
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("More", "Dungeon"),
      );
    }
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    await page.waitForFunction(
      () => !window.__gatherGame.scene.getScene("Battle").animating,
    );
    const battle = await state(page, "Battle");
    expect(battle.equipment[0].weapon_item.instance_id).toBe(sword.instance_id);
    await capture(page, `${width}-crafted-sword-battle`);
    await page.evaluate(() => {
      const scene = window.__gatherGame.scene.getScene("Battle");
      window.__kithlandsTest.playCombatRound(
        scene.gameState.party.map((_, slot) => ({
          slot,
          type: "defend",
          target_id: 0,
        })),
      );
    });
    await page.waitForFunction(
      () => !window.__gatherGame.scene.getScene("Battle").animating,
    );
    const used = page.waitForResponse(
      (r) => r.url().endsWith("/action") && r.request().method() === "POST",
    );
    await page.evaluate(() => {
      const s = window.__gatherGame.scene.getScene("Battle").gameState;
      const target = s.party.reduce(
        (best, p, i) =>
          p.hp > 0 && p.hp / p.max_hp < s.party[best].hp / s.party[best].max_hp
            ? i
            : best,
        0,
      );
      window.__kithlandsTest.playCombatRound(
        s.party.map((_, slot) =>
          slot === 0
            ? { slot, type: "item", item_id: "potion", target_id: target }
            : { slot, type: "defend", target_id: 0 },
        ),
      );
    });
    const afterPotion = await (await used).json();
    expect(afterPotion.potions).toBe(crafted.potions - 1);
    await page.waitForFunction(
      () => !window.__gatherGame.scene.getScene("Battle").animating,
    );
    await capture(page, `${width}-crafted-potion-used`);
    for (
      let round = 0;
      round < 15 && (await state(page, "Battle")).phase === "combat";
      round++
    ) {
      await page.evaluate(() =>
        window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
      );
      await page.waitForFunction(
        () => !window.__gatherGame.scene.getScene("Battle").animating,
      );
    }
    const won = await state(page, "Battle");
    expect(won.phase).toBe("quest_complete");
    expect(
      won.dungeon.actions.find((action) => action.id === "trail-bats")
        .completed,
    ).toBe(true);
    expect(
      won.party.some((member, index) => member.xp > battle.party[index].xp),
    ).toBe(true);
    await page.waitForFunction(
      () =>
        window.__kithlandsTest
          .visibleTexts("Battle")
          .some((entry) => entry.text === "Continue"),
      null,
      { timeout: 30_000 },
    );
    await capture(page, `${width}-victory`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Dungeon")
        .some((entry) => entry.text === "Party"),
    );
    await capture(page, `${width}-returned-to-story`);
    expect(errors).toEqual([]);
  });
}
