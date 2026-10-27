import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
  clickRouteText,
  chooseStoryAction,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/first-session-touch-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
test("touch opening connects the mill, crafting, campaign level-up and saves", async ({
  page,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/game/"))
      requests.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
  });
  const capture = (name) =>
    page.screenshot({ path: path.join(proof, `${name}.png`) });
  let battleNumber = 0;
  const battle = async () => {
    battleNumber++;
    let round = 0;
    await fightNormally(
      page,
      async () => capture(`battle-${battleNumber}-round-${++round}`),
      { touch: true },
    );
  };
  const walk = async (key, target) => {
    while ((await walkNormally(page, key, target, true)) === "Battle")
      await battle();
  };
  const action = async (key) => {
    const point = await page.evaluate((key) => {
      const scene = window.__normalRouteGame.scene.getScene(key),
        rect = scene.game.canvas.getBoundingClientRect(),
        a = scene.gameplayLayout.action;
      const offset =
        scene.explorationHUD && scene.gameplayLayout.portrait ? 150 : 0;
      return {
        x: rect.x + (a.x * rect.width) / scene.scale.gameSize.width,
        y:
          rect.y + ((a.y - offset) * rect.height) / scene.scale.gameSize.height,
      };
    }, key);
    await page.touchscreen.tap(point.x, point.y);
  };
  await startNormalRoute(page, 24, true);
  const state = () => page.evaluate(() => window.__kithlandsTest.gameState());
  const initial = await state();
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await page.getByRole("button", { name: /Quest journal/ }).tap();
  const journal = page.getByRole("dialog", { name: "Quest Log", exact: true });
  await journal.getByRole("button", { name: /Track The Old Mill/ }).tap();
  await capture("00-tracked-journal");
  await journal
    .getByRole("button", { name: "Close Quest Log", exact: true })
    .tap();
  if (await page.locator(".party-dismiss").isVisible())
    await page.locator(".party-dismiss").tap();
  const origin = await page.evaluate(() => {
    const s = window.__normalRouteGame.scene.getScene("World");
    return { x: s.playerX, y: s.playerY };
  });
  for (const material of ["meadow_herb", "ember_ore"]) {
    const node = initial.resources
      .filter((r) => r.material_id === material && !r.gathered)
      .sort(
        (a, b) =>
          Math.abs(a.x - origin.x) +
          Math.abs(a.y - origin.y) -
          Math.abs(b.x - origin.x) -
          Math.abs(b.y - origin.y),
      )[0];
    await walk("World", node);
    await page
      .getByRole("button", { name: `Gather — ${node.name}`, exact: true })
      .tap();
    await expect
      .poll(
        async () =>
          (await state()).resources.find((r) => r.id === node.id).gathered,
      )
      .toBe(true);
    await capture(`01-gather-${material}`);
  }
  const home = await page.evaluate(() => {
    const s = window.__normalRouteGame.scene.getScene("World");
    return s.spawns.find(
      (v) => v.node_id === s.gameState.settlement_entry_node_id,
    );
  });
  await walk("World", home);
  await page.getByRole("button", { name: /^Enter —/ }).tap();
  await routeReady(page, "Settlement");
  await walk("Settlement", { x: 18, y: 9 });
  await action("Settlement");
  await routeReady(page, "Town");
  await walk("Town", { x: 7, y: 5 });
  await action("Town");
  await page.getByRole("button", { name: /Browse wares/ }).tap();
  await page.getByRole("button", { name: /^Spells/ }).tap();
  await page.getByRole("button", { name: /^Frost/ }).tap();
  await page.locator(".shop-purchase").tap();
  await expect(page.locator(".shop-status")).toHaveText(
    "Sparks learned Frost!",
  );
  await capture("02-purchased");
  await page.getByRole("button", { name: /^Leave Shop/ }).tap();
  const exit = await page.evaluate(() => {
    const s = window.__normalRouteGame.scene.getScene("Town");
    return { x: s.playerX, y: s.roomH - 1 };
  });
  await walk("Town", exit);
  await routeReady(page, "Settlement");
  await walk("Settlement", { x: 12, y: 16 });
  await clickRouteText(page, "Old Mill trail", "Settlement", true);
  await routeReady(page, "Dungeon");
  await chooseStoryAction(page, "heron-trail", true);
  await chooseStoryAction(page, "pool-bramblehog", true);
  await battle();
  await routeReady(page, "Dungeon");
  await chooseStoryAction(page, "pool-smithing-cache", true);
  await capture("03-heron-supplies");
  expect(
    (await state()).materials.find((m) => m.id === "bronze_pommel")?.count,
  ).toBe(1);
  await clickRouteText(page, "Party", "Dungeon", true);
  await page.getByRole("button", { name: /Crafting/i }).tap();
  const crafting = page.getByRole("dialog", { name: "Crafting", exact: true });
  for (const name of [
    "Brew Potion",
    "Forge Balanced Trail Sword",
    "Refine Ember Shards",
  ]) {
    await crafting.getByRole("button", { name, exact: true }).tap();
    await crafting.locator(".craft-confirm").tap();
    await expect(crafting.getByRole("status")).toContainText(
      `${name} complete`,
    );
  }
  await crafting
    .getByRole("button", { name: "Gem workshop", exact: true })
    .tap();
  await page.getByRole("button", { name: /Transmute ·/ }).tap();
  await page.locator('[data-recipe-id="refine_ember_gem"]').tap();
  await page
    .getByRole("region", { name: "Recipe preview" })
    .locator(".gem-confirm")
    .tap();
  await expect(page.getByRole("status")).toContainText("Created 1 × Ember Gem");
  await capture("04-crafted-gem");
  await page.getByRole("button", { name: "Close", exact: true }).tap();
  await crafting.getByRole("button", { name: "Close", exact: true }).tap();
  await page.getByRole("button", { name: /Character/ }).tap();
  await page.locator('[data-slot-id="main_hand"]').tap();
  await page
    .locator(".equipment-item-row:not(.is-disabled)")
    .filter({ hasText: "Balanced Trail Sword" })
    .tap();
  await page
    .getByRole("button", { name: "Equip in Weapon", exact: true })
    .tap();
  await page.getByRole("button", { name: "Socket", exact: true }).tap();
  await page.locator('[data-gem-id="ember_gem"]').tap();
  await page
    .getByRole("region", { name: "Socket preview" })
    .locator(".gem-confirm")
    .tap();
  await expect(page.getByRole("status")).toContainText("Ember Gem socketed");
  await capture("05-socketed");
  await page.getByRole("button", { name: "Close", exact: true }).tap();
  await page.getByRole("button", { name: "Close equipment" }).tap();
  await page.locator(".party-dismiss").tap();
  await chooseStoryAction(page, "pool-rest", true);
  await chooseStoryAction(page, "pool-return", true);
  await chooseStoryAction(page, "trail-bats", true);
  await battle();
  await routeReady(page, "Dungeon");
  await clickRouteText(page, "Party", "Dungeon", true);
  const save = page.waitForResponse(
    (r) => r.url().endsWith("/save") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Save game/ }).tap();
  expect((await (await save).json()).error).toBeUndefined();
  const saved = await state();
  await capture("06-saved");
  await clickRouteText(page, "Party", "Dungeon", true);
  await page
    .getByRole("button", { name: "Exit to main menu", exact: true })
    .tap();
  await page.getByRole("button", { name: /Save and exit/ }).tap();
  await page.getByRole("button", { name: /^Continue/ }).tap();
  await page.locator(".title-adventure > .title-save").tap();
  await routeReady(page, "Dungeon");
  const loaded = await state();
  expect(loaded.gold).toBe(saved.gold);
  expect(
    loaded.party.map((p) => ({ hp: p.hp, mp: p.mp, xp: p.xp, level: p.level })),
  ).toEqual(
    saved.party.map((p) => ({ hp: p.hp, mp: p.mp, xp: p.xp, level: p.level })),
  );
  expect(
    loaded.equipment[0].weapon_item.sockets.map((s) => s.gem_id),
  ).toContain("ember_gem");
  expect(loaded.dungeon.room_id).toBe(saved.dungeon.room_id);
  expect(loaded.materials.map(({ id, count }) => ({ id, count }))).toEqual(
    saved.materials.map(({ id, count }) => ({ id, count })),
  );
  expect(
    loaded.resources.map(({ id, ready_at }) => ({ id, ready_at })),
  ).toEqual(saved.resources.map(({ id, ready_at }) => ({ id, ready_at })));
  expect(
    loaded.dungeon.actions.map(({ id, completed }) => ({ id, completed })),
  ).toEqual(
    saved.dungeon.actions.map(({ id, completed }) => ({ id, completed })),
  );
  expect(
    loaded.party.find((p) => p.name === "Sparks").spells.map((s) => s.id),
  ).toContain("frost");
  expect(loaded.party.every((p) => p.xp > 0)).toBe(true);
  expect(
    loaded.resources.filter((r) => r.ready_at > 0).length,
  ).toBeGreaterThanOrEqual(2);
  expect(battleNumber).toBeGreaterThanOrEqual(2);
  expect(requests.filter((r) => r.path.includes("/debug"))).toEqual([]);
  expect(requests.some((r) => r.body?.debug_no_encounters === true)).toBe(
    false,
  );
  await capture("07-loaded");
  // Continue the same saved adventure through the normal fetch quest.
  await clickRouteText(page, "Retreat", "Dungeon", true);
  await page.waitForFunction(() =>
    ["World", "Settlement"].includes(window.__kithlandsTest.activeSceneKey()),
  );
  if (
    (await page.evaluate(() => window.__kithlandsTest.activeSceneKey())) ===
    "Settlement"
  ) {
    await routeReady(page, "Settlement");
    await walk("Settlement", { x: 12, y: 16 });
    await page.getByRole("button", { name: "Leave town", exact: true }).tap();
  }
  await routeReady(page, "World");
  const quest = (await state()).quests.find((q) => q.id === "quest_0");
  expect(quest.template_id).toBe("Q01");
  for (const nodeId of ["person_1", "person_0"]) {
    const destination = await page.evaluate(
      (id) =>
        window.__normalRouteGame.scene
          .getScene("World")
          .spawns.find((s) => s.node_id === id),
      nodeId,
    );
    await walk("World", destination);
    await page
      .getByRole("button")
      .filter({ hasText: `— ${destination.name}` })
      .tap();
    await routeReady(page, "Town");
    const approach = await page.evaluate(() => {
      const scene = window.__normalRouteGame.scene.getScene("Town"),
        grid = scene.tiles,
        npc = scene.npcs[0];
      const queue = [{ x: scene.playerX, y: scene.playerY }],
        seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const point = queue[i],
          key = `${point.x},${point.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const distance = (n) =>
          Math.abs(n.x - point.x) + Math.abs(n.y - point.y);
        if (
          distance(npc) <= 2 &&
          !scene.npcs.slice(1).some((n) => distance(n) < distance(npc)) &&
          !(scene.chests || []).some((n) => distance(n) <= 1) &&
          !(scene.hiddenItems || []).some((n) => distance(n) <= 1)
        )
          return point;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          const next = { x: point.x + dx, y: point.y + dy },
            tile = grid[next.y]?.[next.x];
          if (
            Number.isInteger(tile) &&
            scene.canWalkTile(tile) &&
            !scene.npcs.some((n) => n.x === next.x && n.y === next.y)
          )
            queue.push(next);
        }
      }
      throw new Error("No reachable quest keeper");
    });
    await walk("Town", approach);
    const questResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/action") &&
        r.request().postDataJSON()?.type === "quest_action",
    );
    await action("Town");
    expect((await (await questResponse).json()).error).toBeUndefined();
    await page.waitForFunction(() =>
      window.__normalRouteGame.scene
        .getScene("Town")
        ._modalLocks?.has("dialogue"),
    );
    for (let line = 0; line < 12; line++) {
      const before = await page.evaluate(() =>
        window.__kithlandsTest
          .visibleTexts("Town")
          .map((t) => t.text)
          .join("\n"),
      );
      const point = await page.evaluate(() => {
        const scene = window.__normalRouteGame.scene.getScene("Town"),
          r = scene.game.canvas.getBoundingClientRect(),
          y = scene.gameplayLayout.playfieldBottom - 180;
        return {
          x: r.x + (400 * r.width) / scene.scale.gameSize.width,
          y: r.y + (y * r.height) / scene.scale.gameSize.height,
        };
      });
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForFunction(
        (previous) =>
          !window.__normalRouteGame.scene
            .getScene("Town")
            ._modalLocks?.has("dialogue") ||
          window.__kithlandsTest
            .visibleTexts("Town")
            .map((t) => t.text)
            .join("\n") !== previous,
        before,
      );
      if (
        await page.evaluate(
          () =>
            !window.__normalRouteGame.scene
              .getScene("Town")
              ._modalLocks?.has("dialogue"),
        )
      )
        break;
    }
    await page.waitForFunction(
      () => !window.__normalRouteGame.scene.getScene("Town")._modalLocks?.size,
    );
    if (nodeId === "person_0") {
      const notice = page.getByRole("status", { name: "Quest reward" });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(quest.name);
      await expect(notice).toContainText(`+${quest.reward.xp} XP`);
      await capture("08-campaign-level-up");
    }
    const door = await page.evaluate(() => {
      const scene = window.__normalRouteGame.scene.getScene("Town"),
        y = scene.roomH - 1;
      return { x: scene.tiles[y].indexOf(2), y };
    });
    await walk("Town", door);
    await routeReady(page, "World");
  }
  const leveled = await state();
  expect(leveled.quests.find((q) => q.id === quest.id).completed).toBe(true);
  expect(leveled.party.every((p) => p.level > 1)).toBe(true);
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await page
    .getByRole("button", { name: "Exit to main menu", exact: true })
    .tap();
  await page.getByRole("button", { name: "Save and exit", exact: true }).tap();
  await page.getByRole("button", { name: /^Continue/ }).tap();
  await page.locator(".title-adventure > .title-save").tap();
  await routeReady(page, "World");
  const resumed = await state();
  expect(resumed.quests.find((q) => q.id === quest.id).completed).toBe(true);
  expect(resumed.gold).toBe(leveled.gold);
  expect(
    resumed.resources.map(({ id, ready_at }) => ({ id, ready_at })),
  ).toEqual(leveled.resources.map(({ id, ready_at }) => ({ id, ready_at })));
  expect(
    resumed.party.find((p) => p.name === "Sparks").spells.map((s) => s.id),
  ).toContain("frost");
  expect(resumed.party.map((p) => [p.level, p.xp])).toEqual(
    leveled.party.map((p) => [p.level, p.xp]),
  );
  expect(
    resumed.equipment[0].weapon_item.sockets.map((s) => s.gem_id),
  ).toContain("ember_gem");
  await capture("09-campaign-reloaded");
  expect(requests.filter((r) => r.path.includes("/debug"))).toEqual([]);
  expect(requests.some((r) => r.body?.debug_no_encounters === true)).toBe(
    false,
  );
  writeFileSync(
    path.join(proof, "summary.json"),
    JSON.stringify(
      {
        gold: resumed.gold,
        party: resumed.party.map((p) => ({
          name: p.name,
          level: p.level,
          xp: p.xp,
          hp: p.hp,
          mp: p.mp,
        })),
        battles: battleNumber,
        readyResources: resumed.resources.filter((r) => r.ready_at > 0).length,
        millRoomBeforeRetreat: loaded.dungeon.room_id,
        campaignQuestComplete: resumed.quests.find((q) => q.id === quest.id)
          .completed,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
