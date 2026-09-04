import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const proofDir = path.join("tmp", `effective-equipment-${Date.now()}`);

test("equipment previews recover from network errors and retain keyboard focus", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mkdir(proofDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.debugGiveItem("iron_sword", 1, "World"),
  );
  await page.keyboard.press("m");
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await page.locator('[data-slot-id="main_hand"]').click();
  const pending = [];
  await page.route("**/equipment/preview", (route) => pending.push(route));
  const candidate = page
    .locator(".equipment-item-row")
    .filter({ hasText: "Iron Sword" })
    .first();
  await candidate.click();
  await expect.poll(() => pending.length).toBe(1);
  await page.getByRole("button", { name: "Close gear drawer" }).focus();
  await page.keyboard.press("Tab");
  const focusedControl = await page.evaluate(() =>
    document.activeElement.getAttribute("data-focus-key"),
  );
  expect(focusedControl).toBeTruthy();
  await pending.shift().abort();
  await expect(page.locator(".comparison-impact")).toContainText(
    "Could not load character totals",
  );
  await expect(
    page.getByRole("button", { name: "Retry comparison" }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-focus-key="${focusedControl}"]`),
  ).toBeFocused();
  await page.screenshot({
    path: path.join(proofDir, "preview-network-error.png"),
  });

  await page.getByRole("button", { name: "Retry comparison" }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.getByRole("combobox", { name: "Recommendation goal" }).focus();
  await pending.shift().continue();
  await expect(page.locator(".comparison-table")).toContainText("Attack");
  await expect(
    page.getByRole("combobox", { name: "Recommendation goal" }),
  ).toBeFocused();
  await page.screenshot({
    path: path.join(proofDir, "preview-retry-focus.png"),
  });

  // A late reply must not reopen a drawer that the player has closed.
  await candidate.click();
  await expect.poll(() => pending.length).toBe(1);
  await page.getByRole("button", { name: "Close gear drawer" }).click();
  const reply = page.waitForResponse((response) =>
    response.url().endsWith("/equipment/preview"),
  );
  await pending.shift().continue();
  await reply;
  await expect(page.locator(".equipment-drawer")).toHaveCount(0);
  await expect(page.locator('[data-slot-id="main_hand"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Character" })).toHaveCount(0);
});

test("authoritative equipment totals survive equip, spell combat, and save/load", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(proofDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Equipment proof",
      people: [],
      places: ["Square"],
      big_building: "Hall",
      difficulty: "normal",
      rng_seed: 9941,
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Cato", class_id: "cinder" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  for (const id of ["iron_sword", "trail_boots", "copper_amulet"]) {
    const result = await page.evaluate(
      (item) => window.__kithlandsTest.debugGiveItem(item, 1, "World"),
      id,
    );
    expect(result.error).toBeUndefined();
  }
  const before = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  await page.keyboard.press("m");
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
  await page.screenshot({ path: path.join(proofDir, "desktop-before.png") });

  let swordPreview;
  for (const [slot, itemName] of [
    ["main_hand", "Iron Sword"],
    ["feet", "Trail Boots"],
    ["amulet", "Copper Amulet"],
  ]) {
    await page.locator(`[data-slot-id="${slot}"]`).click();
    const candidate = page
      .locator(".equipment-item-row")
      .filter({ hasText: itemName })
      .first();
    const responsePromise = page.waitForResponse((r) =>
      r.url().endsWith("/equipment/preview"),
    );
    await candidate.click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const preview = await response.json();
    if (slot === "main_hand") {
      swordPreview = preview;
      expect(preview.after.attack).toBeGreaterThan(preview.before.attack);
      await expect(page.locator(".comparison-table")).toContainText("Attack");
      await page.screenshot({
        path: path.join(proofDir, "desktop-sword-comparison.png"),
      });
    }
    if (slot === "amulet") expect(preview.after.int).toBe(preview.before.int);
    await page.getByRole("button", { name: /^Equip in / }).click();
    await expect(page.locator(".equipment-status")).toContainText(
      "equipped in",
    );
    await expect(page.locator(`[data-slot-id="${slot}"]`)).toContainText(
      itemName,
    );
  }
  const equipped = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(baseState(equipped.party)).toEqual(baseState(before.party));
  expect(equipped.equipment[0].effective.attack).toBe(
    swordPreview.after.attack,
  );
  expect(equipped.equipment[0].effective.evade).toBeGreaterThan(
    before.equipment[0].effective.evade,
  );
  await expect(page.locator(".character-summary-panel")).toContainText(
    "gear bonuses are inactive",
  );
  for (const [width, height] of [
    [1440, 900],
    [800, 600],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    // Close the slot drawer so the complete character screen is visible.
    const done = page.getByRole("button", { name: "Close gear drawer" });
    if (await done.count()) await done.click();
    await page.screenshot({
      path: path.join(proofDir, `character-${width}x${height}.png`),
    });
    expect(await page.locator(".equipment-slot").count()).toBe(12);
    if (width === 390) {
      await page.locator(".equipment-inactive-note").scrollIntoViewIfNeeded();
      await expect(page.locator(".equipment-inactive-note")).toBeVisible();
      await page.screenshot({
        path: path.join(proofDir, "mobile-scrolled-stats.png"),
      });
    }
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Character" })).toHaveCount(0);
  const save = await page.evaluate(() =>
    window.__kithlandsTest.saveGame("Effective equipment proof", "World"),
  );
  expect(save).toMatchObject({ status: "saved" });
  const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
  const saveID =
    saves.saves.find((entry) => entry.name === "Effective equipment proof")
      ?.id || saves.saves[0].id;
  const reloaded = await page.evaluate(
    (id) => window.__kithlandsTest.loadSave(id),
    saveID,
  );
  expect(reloaded.party).toEqual(equipped.party);
  expect(reloaded.equipment.map((entry) => entry.effective)).toEqual(
    equipped.equipment.map((entry) => entry.effective),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("m");
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
  await page.screenshot({ path: path.join(proofDir, "desktop-reloaded.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    window.__kithlandsTest.forceEncounter(["armored_knight"], 1, "World"),
  );
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.activeSceneKey() === "Battle" &&
      !window.__kithlandsTest.battleVisibilitySnapshot().animating,
  );
  const roundResponse = page.waitForResponse(
    (r) => r.url().endsWith("/action") && r.request().method() === "POST",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startAuthoritativeBattleRound("spell"),
  );
  const combat = await (await roundResponse).json();
  expect(combat.error).toBeUndefined();
  expect(
    combat.combat_actions.some(
      (action) => action.kind === "spell" && action.damage > 0,
    ),
  ).toBeTruthy();
  expect(combat.equipment[0].effective).toEqual(
    equipped.equipment[0].effective,
  );
  for (let i = 0; i < combat.party.length; i++) {
    for (const stat of [
      "str",
      "agi",
      "int_stat",
      "vit",
      "lck",
      "max_hp",
      "max_mp",
    ])
      expect(combat.party[i][stat]).toBe(equipped.party[i][stat]);
  }
  await page.waitForFunction(
    () => !window.__kithlandsTest.battleVisibilitySnapshot().animating,
  );
  await page.screenshot({
    path: path.join(proofDir, "desktop-real-spell-round.png"),
  });
  await writeFile(
    path.join(proofDir, "state-proof.json"),
    JSON.stringify(
      { before, equipped, reloaded, combat, swordPreview },
      null,
      2,
    ),
  );
});

function baseState(party) {
  const keys = [
    "name",
    "class_id",
    "level",
    "xp",
    "str",
    "agi",
    "int_stat",
    "vit",
    "lck",
    "hp",
    "max_hp",
    "mp",
    "max_mp",
    "status",
  ];
  return party.map((member) =>
    Object.fromEntries(keys.map((key) => [key, member[key]])),
  );
}
