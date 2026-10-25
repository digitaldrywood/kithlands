// Walk every tile through the normal scene and authoritative world-step API.
export async function walkTo(page, destination) {
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

// The Old Mill core is earned by the preceding real-combat route. Only levels
// are advanced via the server debug fixture to avoid grinding unrelated quests.
export async function verifyCraftingProgression(page, viewport, proof) {
  const { expect } = await import("@playwright/test");
  const capture = (label) =>
    page.screenshot({ path: `${proof}/${viewport.width}-${label}.png` });
  const state = () =>
    page.evaluate(() => window.__kithlandsTest.gameState("World"));
  await page.keyboard.press("m");
  await page.getByRole("button", { name: /Crafting/i }).click();
  const dialog = page.getByRole("dialog", { name: "Crafting", exact: true });
  await dialog
    .getByRole("button", { name: "Forge Runic Mythril Sword", exact: true })
    .click();
  await expect(dialog.locator(".craft-preview")).toContainText(
    "Quest reward · restore Old Mill",
  );
  await capture("runic-recipe-sources");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const api = await import("/src/api.js");
    const world = window.__gatherGame.scene.getScene("World");
    const gs = await api.debugSetPartyLevels(world.gameState.id, [
      { slot: 0, level: 8 },
    ]);
    if (gs.error) throw new Error(gs.error);
    world.gameState = gs;
  });
  const nodes = (await state()).resources;
  for (const node of [
    ...nodes.filter((r) => r.material_id === "ember_ore").slice(0, 2),
    ...nodes.filter((r) => r.material_id === "hardwood").slice(0, 1),
    ...nodes.filter((r) => r.material_id === "mythril_ore").slice(0, 1),
  ]) {
    await walkTo(page, { x: node.x, y: node.y });
    await capture(`resource-${node.material_id}`);
    await page
      .getByRole("button", { name: `Gather — ${node.name}`, exact: true })
      .click();
    await page.waitForFunction(
      (id) =>
        window.__kithlandsTest
          .gameState("World")
          .resources.find((r) => r.id === id)?.gathered,
      node.id,
    );
  }
  const settlement = await page.evaluate(() => {
    const scene = window.__gatherGame.scene.getScene("World");
    return scene.spawns.find(
      (s) => s.node_id === scene.gameState.settlement_entry_node_id,
    );
  });
  await walkTo(page, { x: settlement.x, y: settlement.y });
  const gold = (await state()).gold;
  await page.evaluate(async () => {
    const api = await import("/src/api.js");
    let gs = window.__kithlandsTest.gameState("World");
    gs = await api.transitionLocation(
      gs.id,
      "enter-settlement",
      gs.settlement_entry_node_id,
    );
    if (gs.error) throw new Error(gs.error);
    const door = gs.settlement_map.layers
      .flatMap((l) => l.objects || [])
      .find((o) =>
        o.properties?.some(
          (p) => p.name === "building_type" && p.value === "shop",
        ),
      );
    gs = await api.transitionLocation(gs.id, door.name);
    if (gs.error) throw new Error(gs.error);
    window.__kithlandsTest.startScene("Town", {
      gameState: gs,
      spawn: gs.current_location.interior,
    });
  });
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
  const npc = await page.evaluate(
    () => window.__kithlandsTest.townNpcPositions("Town")[0],
  );
  await page.evaluate(
    ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1),
    npc,
  );
  await page.evaluate(() => window.__kithlandsTest.interact("Town"));
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Town")
      .some((t) => t.text === "Supplies"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Supplies", "Town"),
  );
  await capture("shop-supplies");
  for (const name of [
    "Smithing charcoal",
    "Smithing charcoal",
    "Forge flux",
    "Forge flux",
    "Forge flux",
    "Leather grip wrap",
    "Leather grip wrap",
  ]) {
    if (await page.locator(".shop-back").isVisible())
      await page.locator(".shop-back").click();
    const receipt = page.waitForResponse((r) => r.url().endsWith("/buy"));
    await page.evaluate(
      (label) => window.__kithlandsTest.clickInteractiveText(label, "Town"),
      name,
    );
    await page.getByRole("button", { name: /^Buy(?: Alt|$)/ }).click();
    expect((await (await receipt).json()).error).toBeFalsy();
    await page.waitForFunction(
      () => !window.__gatherGame.scene.getScene("Town").shopPurchasePending,
    );
  }
  const town = await page.evaluate(() =>
    window.__kithlandsTest.gameState("Town"),
  );
  expect(town.gold).toBe(gold - 64);
  await capture("purchased-supplies");
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Leave Shop", "Town"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
  await page.keyboard.press("m");
  await page.getByRole("button", { name: /Crafting/i }).click();
  for (const name of ["Forge Steel Sword", "Forge Runic Mythril Sword"]) {
    await dialog.getByRole("button", { name, exact: true }).click();
    await expect(dialog.locator(".craft-confirm")).toBeEnabled();
    await capture(`${name.replaceAll(" ", "-")}-ready`);
    const receipt = page.waitForResponse((r) =>
      r.url().endsWith("/field-craft"),
    );
    await dialog.locator(".craft-confirm").click();
    const gs = await (await receipt).json();
    expect(gs.error).toBeFalsy();
    expect(gs.materials.find((m) => m.id === "meadow_herb").count).toBe(
      town.materials.find((m) => m.id === "meadow_herb").count,
    );
  }
  await capture("advanced-crafted");
  await expect(dialog.locator(".craft-confirm")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "Town"),
  );
  await page.locator('[data-slot-id="main_hand"]').click();
  await page
    .locator(".equipment-item-row:not(.is-disabled)")
    .filter({ hasText: "Mythril Sword" })
    .click();
  await page
    .getByRole("button", { name: "Equip in Weapon", exact: true })
    .click();
  await expect(page.locator('[data-slot-id="main_hand"]')).toContainText(
    "Mythril Sword",
  );
  await capture("runic-sword-equipped");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const restored = await page.evaluate(async () => {
    const api = await import("/src/api.js");
    const gs = window.__kithlandsTest.gameState("Town");
    const receipt = await api.saveGame(gs.id, "Advanced crafting proof");
    if (receipt.error) throw new Error(receipt.error);
    const saves = await api.listSaves();
    const entry = saves.saves.find((s) => s.name === "Advanced crafting proof");
    const next = await api.loadSave(entry.id);
    if (next.error) throw new Error(next.error);
    window.__kithlandsTest.startScene("World", { gameState: next });
    return next;
  });
  expect(restored.materials.find((m) => m.id === "mill_core").count).toBe(0);
  expect(restored.equipment[0].weapon_item.sockets).toHaveLength(2);
  expect(restored.equipment[0].weapon_item.required_level).toBe(8);
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await capture("advanced-save-restored");
}
