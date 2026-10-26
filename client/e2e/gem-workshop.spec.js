import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

test.describe.configure({ mode: "parallel" });

const proof = path.resolve(`tmp/gem-discovery-${Date.now()}`);
mkdirSync(proof, { recursive: true });
const state = (page) =>
  page.evaluate(() => window.__kithlandsTest.gameState("World"));
const capture = (page, label) =>
  page.screenshot({ path: path.join(proof, `${label}.png`), fullPage: true });

async function start(page, seed = 42) {
  const email = `gems-${Date.now()}@test.dev`;
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startWizardFromTitle(email),
    email,
  );
  await page.evaluate(
    (seed) =>
      window.__kithlandsTest.startCustomGame({
        town_name: "Gem Town",
        places: ["Square"],
        big_building: "Hall",
        difficulty: "normal",
        rng_seed: seed,
        party: [
          { name: "Ayla", class_id: "warrior" },
          { name: "Mira", class_id: "mender" },
        ],
      }),
    seed,
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  return email;
}
async function open(page) {
  await page.keyboard.press("m");
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
  await page.locator('[data-slot-id="main_hand"]').click();
  await page.getByRole("button", { name: "Socket", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Gem Workshop" }),
  ).toBeVisible();
}
async function selectRecipe(page, id) {
  const button = page.locator(`[data-recipe-id="${id}"]`);
  const pages = page.getByRole("navigation", { name: "Recipes pages" });
  if ((await button.count()) === 0) {
    const previous = pages.getByRole("button", { name: "Previous" });
    if (await previous.isEnabled()) await previous.click();
  }
  if ((await button.count()) === 0)
    await pages.getByRole("button", { name: "Next" }).click();
  await button.click();
}
async function fits(page) {
  const bounds = await page.locator(".kith-gem-workshop").evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    right: node.getBoundingClientRect().right,
    bottom: node.getBoundingClientRect().bottom,
    innerWidth,
    innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(bounds.right).toBeLessThanOrEqual(bounds.innerWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.innerHeight);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.innerWidth);
  // The main action must remain on screen even when the preview is scrolled.
  const action = page.locator(".gem-actions .gem-confirm");
  if (await action.isVisible()) {
    const rect = await action.boundingBox();
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.innerHeight);
    await expect(action).toBeInViewport();
  }

  expect(
    await page
      .locator(".kith-gem-workshop")
      .evaluate((n) => parseFloat(getComputedStyle(n).fontSize)),
  ).toBeGreaterThanOrEqual(15);
}

for (const [width, height] of [
  [610, 837],
  [390, 844],
  [375, 667],
  [800, 600],
  [1440, 900],
]) {
  test(`discover, preview, transmute and socket at ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const email = await start(page);
    const before = await state(page);
    await open(page);
    await fits(page);
    const socketPreview = page.getByRole("region", { name: "Socket preview" });
    await expect(socketPreview).toContainText("Equipment values");
    await capture(page, `${width}x${height}-socket-preview`);
    await page.getByRole("button", { name: /Transmute ·/ }).click();
    await expect(
      page.getByRole("navigation", { name: "Recipes pages" }),
    ).toContainText("1 / 2");
    await capture(page, `${width}x${height}-recipe-book`);
    await selectRecipe(page, "recover_ward_gems");
    const recipePreview = page.getByRole("region", { name: "Recipe preview" });
    await expect(recipePreview).toContainText("Undiscovered.");
    await expect(recipePreview.locator(".gem-confirm")).toBeDisabled();
    await recipePreview.scrollIntoViewIfNeeded();
    await capture(page, `${width}x${height}-locked-second-page`);
    expect((await state(page)).gems).toEqual(before.gems);
    await selectRecipe(page, "refine_ember_crystal");
    await expect(recipePreview).toContainText("party level 20");
    await expect(recipePreview.locator(".gem-confirm")).toBeDisabled();
    await selectRecipe(page, "refine_ember_gem");
    await expect(recipePreview).toContainText("3 owned / 3 needed");
    await expect(recipePreview.locator(".gem-confirm")).toBeEnabled();
    const emberArmorEffect = recipePreview.getByText("armor: +2 Power", {
      exact: true,
    });
    await expect(emberArmorEffect).toBeVisible();
    await emberArmorEffect.scrollIntoViewIfNeeded();
    await capture(page, `${width}x${height}-ember-power-detail`);
    // A native keyboard activation confirms the preview exactly once.
    await recipePreview.locator(".gem-confirm").focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Created 1 × Ember Gem");
    const crafted = await state(page);
    expect(
      crafted.gem_recipes.find((r) => r.id === "recover_ember_shards").known,
    ).toBe(true);
    expect(crafted.gems).toEqual([
      expect.objectContaining({ id: "ember_gem", count: 1 }),
    ]);
    expect(crafted.equipment[0].weapon_item.sockets[0].gem_id).toBeUndefined();
    const effectivePreview =
      crafted.equipment[0].weapon_item.socket_previews.find(
        (preview) => preview.gem_id === "ember_gem",
      );
    expect(
      effectivePreview.character_after.attack -
        effectivePreview.character_before.attack,
    ).toBe(3);
    await page
      .getByRole("button", { name: "Choose equipment to socket" })
      .click();
    await socketPreview.locator(".gem-details summary").click();
    const effectiveTable = socketPreview
      .locator(".gem-stat-changes")
      .filter({ hasText: "effective values" });
    await expect(
      effectiveTable.getByRole("row", { name: /Attack/ }),
    ).toContainText(String(effectivePreview.character_before.attack));
    await expect(
      effectiveTable.getByRole("row", { name: /Attack/ }),
    ).toContainText(String(effectivePreview.character_after.attack));
    await expect(page.locator("#gem-equipment")).toHaveValue(
      before.equipment[0].weapon_instance_id,
    );
    await socketPreview.locator(".gem-confirm").click();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Ember Gem socketed");
    await expect(socketPreview).toContainText("Recover Ember Gem");
    const applied = await state(page);
    expect(applied.equipment[0].weapon_item.sockets[0].gem_id).toBe(
      "ember_gem",
    );
    expect(applied.equipment[0].effective.attack).toBe(
      effectivePreview.character_after.attack,
    );
    expect(applied.gems || []).toEqual([]);
    await capture(page, `${width}x${height}-socketed`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
    await expect(page.locator(".equipment-character")).toHaveText("Ayla");
    await expect(page.locator('[data-slot-id="main_hand"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.locator('[data-slot-id="main_hand"] .equipment-sockets'),
    ).toHaveAttribute("aria-label", /Ember Gem/);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const saved = await page.evaluate(() =>
      window.__kithlandsTest.saveGame("Workshop discovery proof"),
    );
    expect(saved.error).toBeUndefined();
    const list = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const save = list.saves.find((s) => s.name === "Workshop discovery proof");
    expect(save).toBeTruthy();
    // A full reload clears browser memory; login again, then load the database save.
    await page.reload();
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(
      (email) => window.__kithlandsTest.startQuickGame(email),
      email,
    );
    await page.evaluate((id) => window.__kithlandsTest.loadSave(id), save.id);
    const restored = await state(page);
    expect(
      restored.gem_recipes.find((r) => r.id === "recover_ember_shards").known,
    ).toBe(true);
    expect(restored.gems || []).toEqual([]);
    expect(restored.equipment[0].weapon_item.sockets[0].gem_id).toBe(
      "ember_gem",
    );
    expect(restored.equipment[0].effective.attack).toBe(
      effectivePreview.character_after.attack,
    );
    expect(errors).toEqual([]);
  });
}

test.describe("stale gem service confirmation", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("a second device invalidates replacement without duplicate material", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await start(page);
    await page.evaluate(() =>
      window.__kithlandsTest.debugGiveItem("ward_shard", 1, "World"),
    );
    await open(page);
    const preview = page.getByRole("region", { name: "Socket preview" });
    await page.locator('[data-gem-id="ember_shard"]').tap();
    await preview.locator(".gem-confirm").tap();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Ember Shard socketed");

    const otherDevice = await page.evaluate(async () => {
      const api = await import("/src/api.js");
      const live = window.__kithlandsTest.gameState("World");
      const item = live.equipment[0].weapon_item;
      const change = item.gem_changes.find(
        (candidate) =>
          candidate.action === "replace" && candidate.gem_id === "ward_shard",
      );
      return api.changeGem(
        live.id,
        change.action,
        item.instance_id,
        change.socket,
        change.gem_id,
        change.token,
      );
    });
    expect(otherDevice.error).toBeUndefined();
    await preview.locator(".gem-confirm").tap();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("alert"),
    ).toContainText("preview is stale");
    await capture(page, "390x844-stale-replacement-rejected");
    await page.getByRole("button", { name: "Refresh inventory" }).tap();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Inventory refreshed");
    const reconciled = await state(page);
    expect(reconciled.gold).toBe(90);
    expect(reconciled.equipment[0].weapon_item.sockets[0].gem_id).toBe(
      "ward_shard",
    );
    expect(reconciled.gems).toEqual([
      expect.objectContaining({ id: "ember_shard", count: 2 }),
    ]);
  });
});

test("recovers from a server rejection without partial inputs or duplicate rewards", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await open(page);
  await page.getByRole("button", { name: /Transmute ·/ }).click();
  await selectRecipe(page, "refine_ember_gem");
  // Simulate a second device spending the same ingredients, using the real API.
  const other = await page.evaluate(async () => {
    const api = await import("/src/api.js");
    return api.craftGem(
      window.__kithlandsTest.gameState("World").id,
      "refine_ember_gem",
    );
  });
  expect(other.error).toBeUndefined();
  await page
    .getByRole("region", { name: "Recipe preview" })
    .locator(".gem-confirm")
    .click();
  await expect(
    page.locator(".kith-gem-workshop").getByRole("alert"),
  ).toContainText("have 0");
  await capture(page, "390x844-server-rejection");
  await page.getByRole("button", { name: "Refresh inventory" }).click();
  await expect(
    page.locator(".kith-gem-workshop").getByRole("status"),
  ).toContainText("Inventory refreshed");
  expect((await state(page)).gems).toEqual([
    expect.objectContaining({ id: "ember_gem", count: 1 }),
  ]);
  await selectRecipe(page, "recover_ember_shards");
  await page
    .getByRole("region", { name: "Recipe preview" })
    .locator(".gem-confirm")
    .click();
  await expect(
    page.locator(".kith-gem-workshop").getByRole("status"),
  ).toContainText("Created 2 × Ember Shard");
  const recovered = await state(page);
  expect(recovered.gems).toEqual([
    expect.objectContaining({ id: "ember_shard", count: 2 }),
  ]);
  expect(
    recovered.gem_recipes.find((r) => r.id === "recover_ember_shards").known,
  ).toBe(true);
  await selectRecipe(page, "refine_ember_gem");
  await expect(
    page.getByRole("region", { name: "Recipe preview" }),
  ).toContainText("2 owned / 3 needed");
  await expect(
    page
      .getByRole("region", { name: "Recipe preview" })
      .locator(".gem-confirm"),
  ).toBeDisabled();
  await capture(page, "390x844-lossful-recovery");
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test.describe(`gem service viewport ${width}x${height}`, () => {
    test.use({ hasTouch: width === 390 });
    test(`replace and recover an exact equipment gem at ${width}x${height}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      const touch = width === 390;
      const activate = (locator) => (touch ? locator.tap() : locator.click());
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await start(page);
      const granted = await page.evaluate(() =>
        window.__kithlandsTest.debugGiveItem("ward_shard", 1, "World"),
      );
      expect(granted.error).toBeUndefined();
      const original = await state(page);
      const instanceID = original.equipment[0].weapon_instance_id;
      await open(page);
      await fits(page);
      const preview = page.getByRole("region", { name: "Socket preview" });
      await activate(page.locator('[data-gem-id="ember_shard"]'));
      await expect(preview).toContainText("No workshop fee · 100 gold remains");
      await activate(preview.locator(".gem-confirm"));
      await expect(
        page.locator(".kith-gem-workshop").getByRole("status"),
      ).toContainText("Ember Shard socketed");

      const replacementState = await state(page);
      const replacement =
        replacementState.equipment[0].weapon_item.gem_changes.find(
          (change) =>
            change.action === "replace" && change.gem_id === "ward_shard",
        );
      expect(replacement).toMatchObject({
        installed_gem_id: "ember_shard",
        gold_cost: 10,
        gold_before: 100,
        gold_after: 90,
        allowed: true,
      });
      await expect(preview).toContainText("Replacement: Ward Shard");
      await expect(preview).toContainText(
        "The installed Ember Shard will be destroyed",
      );
      await expect(preview).toContainText("10 gold · 100 → 90 gold");
      await expect(preview).toContainText("Equipment values");
      const powerRow = preview
        .locator(".gem-stat-changes")
        .filter({ hasText: "Equipment values" })
        .getByRole("row", { name: /Power/ });
      await expect(powerRow.getByRole("cell").nth(0)).toHaveText("7");
      await expect(powerRow.getByRole("cell").nth(1)).toHaveText("6");
      await capture(page, `${width}x${height}-replacement-before-confirm`);
      await activate(preview.locator(".gem-confirm"));
      await expect(
        page.locator(".kith-gem-workshop").getByRole("status"),
      ).toContainText("Ember Shard replaced with Ward Shard");
      const replaced = await state(page);
      expect(replaced.equipment[0].weapon_instance_id).toBe(instanceID);
      expect(replaced.equipment[0].weapon_item.sockets[0].gem_id).toBe(
        "ward_shard",
      );
      expect(replaced.gold).toBe(90);
      expect(replaced.gems).toEqual([
        expect.objectContaining({ id: "ember_shard", count: 2 }),
      ]);

      const recoverButton = preview.getByRole("button", {
        name: "Recover Ward Shard · 25 gold",
        exact: true,
      });
      await expect(preview).toContainText(
        "Returns exactly 1 Ward Shard to your loose gems",
      );
      await expect(preview).toContainText("25 gold · 90 → 65 gold");
      await recoverButton.scrollIntoViewIfNeeded();
      await capture(page, `${width}x${height}-recovery-before-confirm`);
      await activate(recoverButton);
      await expect(
        page.locator(".kith-gem-workshop").getByRole("status"),
      ).toContainText("Ward Shard recovered");
      const recovered = await state(page);
      expect(recovered.equipment[0].weapon_instance_id).toBe(instanceID);
      expect(
        recovered.equipment[0].weapon_item.sockets[0].gem_id,
      ).toBeUndefined();
      expect(recovered.gold).toBe(65);
      expect(recovered.gems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "ember_shard", count: 2 }),
          expect.objectContaining({ id: "ward_shard", count: 1 }),
        ]),
      );
      await fits(page);
      await capture(page, `${width}x${height}-recovered-open-socket`);
      expect(errors).toEqual([]);
    });
  });
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test.describe(`same-stat gem delta viewport ${width}x${height}`, () => {
    test.use({ hasTouch: width === 390 });
    test(`same-stat replacement labels show the authoritative net delta at ${width}x${height}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      const touch = width === 390;
      const activate = (locator) => (touch ? locator.tap() : locator.click());
      await start(page);
      const granted = await page.evaluate(() =>
        window.__kithlandsTest.debugGiveItem("ember_gem", 1, "World"),
      );
      expect(granted.error).toBeUndefined();
      await open(page);
      const preview = page.getByRole("region", { name: "Socket preview" });
      await activate(page.locator('[data-gem-id="ember_shard"]'));
      await activate(preview.locator(".gem-confirm"));
      await expect(
        page.locator(".kith-gem-workshop").getByRole("status"),
      ).toContainText("Ember Shard socketed");

      const upgrade = page.locator('[data-gem-id="ember_gem"]');
      await expect(upgrade).toContainText(
        "Replace Ember Shard · +2 Power · 10 gold",
      );
      await upgrade.scrollIntoViewIfNeeded();
      await capture(page, `${width}x${height}-same-stat-upgrade-net-delta`);
      await activate(upgrade);
      await activate(preview.locator(".gem-confirm"));
      await expect(
        page.locator(".kith-gem-workshop").getByRole("status"),
      ).toContainText("Ember Shard replaced with Ember Gem");

      const downgrade = page.locator('[data-gem-id="ember_shard"]');
      await expect(downgrade).toContainText(
        "Replace Ember Gem · -2 Power · 10 gold",
      );
      await downgrade.scrollIntoViewIfNeeded();
      await capture(page, `${width}x${height}-same-stat-downgrade-net-delta`);
      await fits(page);
    });
  });
}

test("blocked low-gold recovery keeps its reason without fabricated zero stats", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const funded = await page.evaluate(() =>
    window.__kithlandsTest.setGold(10, "World"),
  );
  expect(funded.error).toBeUndefined();
  await open(page);
  const preview = page.getByRole("region", { name: "Socket preview" });
  await page.locator('[data-gem-id="ember_shard"]').click();
  await preview.locator(".gem-confirm").click();
  await expect(
    page.locator(".kith-gem-workshop").getByRole("status"),
  ).toContainText("Ember Shard socketed");

  const recovery = preview.locator(".gem-recovery");
  await expect(recovery).toContainText(
    "need 25 gold for this gem service, have 10",
  );
  await expect(
    recovery.getByRole("button", { name: "Recover Ember Shard · 25 gold" }),
  ).toBeDisabled();
  await expect(recovery.locator(".gem-stat-changes")).toHaveCount(0);
  await recovery.scrollIntoViewIfNeeded();
  await capture(page, "390x844-low-gold-recovery-blocked");
  await fits(page);
});

test("acquired Ward loot unlocks conversion in the Workshop", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 800, height: 600 });
  await start(page, 3);
  expect(
    (await state(page)).gem_recipes.find(
      (r) => r.id === "convert_ember_to_ward",
    ).known,
  ).toBe(false);
  const grant = await page.evaluate(() =>
    window.__kithlandsTest.debugGiveItem("ward_shard", 1, "World"),
  );
  expect(grant.error).toBeUndefined();
  const earned = await state(page);
  expect(earned.gems).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "ward_shard" })]),
  );
  expect(
    earned.gem_recipes.find((r) => r.id === "convert_ember_to_ward").known,
  ).toBe(true);
  await open(page);
  await page.getByRole("button", { name: /Transmute ·/ }).click();
  await selectRecipe(page, "convert_ember_to_ward");
  const preview = page.getByRole("region", { name: "Recipe preview" });
  await expect(preview).toContainText("One shard is lost");
  await preview.locator(".gem-confirm").click();
  await expect(
    page.locator(".kith-gem-workshop").getByRole("status"),
  ).toContainText("Created 1 × Ward Shard");
  const converted = await state(page);
  expect(converted.gems.find((g) => g.id === "ward_shard").count).toBe(
    earned.gems.find((g) => g.id === "ward_shard").count + 1,
  );
  await capture(page, "800x600-acquired-family-conversion");
});

test("large catalog fixture keeps the twelfth equipment and gem selectable", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page);
  // A presentation fixture exercises a future catalog larger than today's six
  // gems. No mutation is sent and no fake items are granted to the live game.
  await page.evaluate(async () => {
    const { showGemWorkshop } = await import("/src/scenes/gem_workshop.js");
    const live = window.__kithlandsTest.gameState("World");
    const item = live.equipment[0].weapon_item,
      gem = live.gems[0];
    const gems = Array.from({ length: 12 }, (_, i) => ({
      ...gem,
      id: `fixture_gem_${i}`,
      name: `Catalog gem ${i + 1}`,
    }));
    const loadout = Array.from({ length: 12 }, (_, i) => ({
      id: `slot_${i}`,
      name: `Position ${i + 1}`,
      item: {
        ...item,
        instance_id: `fixture_gear_${i}`,
        name: `Catalog gear ${i + 1}`,
        socket_previews: [],
      },
    }));
    const scene = {
      gameState: { ...live, gems, items: [], equipment: [{ loadout }] },
      input: { enabled: true },
    };
    showGemWorkshop(scene, { preselectedInstanceID: "fixture_gear_11" });
  });
  await expect(page.locator("#gem-equipment option")).toHaveCount(12);
  await expect(page.locator("#gem-equipment")).toHaveValue("fixture_gear_11");
  const pages = page.getByRole("navigation", { name: "Gems pages" });
  await pages.getByRole("button", { name: "Next" }).click();
  await pages.getByRole("button", { name: "Next" }).click();
  await page.locator('[data-gem-id="fixture_gem_11"]').click();
  await expect(page.locator('[data-gem-id="fixture_gem_11"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("region", { name: "Socket preview" }),
  ).toContainText("Catalog gear 12");
  await fits(page);
  await capture(page, "375x667-large-catalog-fixture-page-three");
});

test("equipment select receives native arrow keys inside Phaser", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await start(page);
  await open(page);
  const equipmentSelect = page.locator("#gem-equipment");
  await equipmentSelect.evaluate((select) => {
    const root = document.querySelector(".kith-gem-workshop");
    select.addEventListener(
      "keydown",
      (event) => {
        root.dataset.keyboardEvent = `${event.target.id}:${event.defaultPrevented}`;
      },
      { once: true },
    );
  });
  await equipmentSelect.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".kith-gem-workshop")).toHaveAttribute(
    "data-keyboard-event",
    "gem-equipment:false",
  );
});

test("pending socket keeps focus and closes onto refreshed equipment", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await open(page);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/gems/change", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole("region", { name: "Socket preview" })
      .locator(".gem-confirm")
      .click();
    const dialog = page.getByRole("dialog", { name: "Gem Workshop" });
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Applying gem change");
    await expect(dialog).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Close", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await capture(page, "390x844-pending-focus");
    release();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Ember Shard socketed");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
    await expect(
      page.locator('[data-slot-id="main_hand"] .equipment-sockets'),
    ).toHaveAttribute("aria-label", /Ember Shard/);
  } finally {
    release();
  }
});

test("timed-out mutation requires authoritative inventory reconciliation", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page);
  await open(page);
  await page.getByRole("button", { name: /Transmute ·/ }).click();
  await selectRecipe(page, "refine_ember_gem");
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/craft", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole("region", { name: "Recipe preview" })
      .locator(".gem-confirm")
      .click();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("alert"),
    ).toContainText("Request timed out", {
      timeout: 20_000,
    });
    await expect(
      page
        .getByRole("region", { name: "Recipe preview" })
        .locator(".gem-confirm"),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Refresh inventory" }).click();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Inventory refreshed");
    expect((await state(page)).gems).toEqual([
      expect.objectContaining({ id: "ember_gem", count: 1 }),
    ]);
    release();
    await capture(page, "375x667-timeout-reconciled");
  } finally {
    release();
  }
});

test("scene shutdown ignores a late socket response", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page);
  await open(page);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let responseReady, finishRoute;
  const serverResponded = new Promise((resolve) => {
    responseReady = resolve;
  });
  const routeFinished = new Promise((resolve) => {
    finishRoute = resolve;
  });
  await page.route("**/gems/change", async (route) => {
    try {
      const response = await route.fetch();
      responseReady();
      await held;
      await route.fulfill({ response });
    } finally {
      finishRoute();
    }
  });
  try {
    await page
      .getByRole("region", { name: "Socket preview" })
      .locator(".gem-confirm")
      .click();
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Applying gem change");
    // Hold a completed real server response, not a request still connecting.
    await serverResponded;
    const replacement = await page.evaluate(() =>
      window.__kithlandsTest.startCustomGame({
        town_name: "New game",
        places: ["Square"],
        big_building: "Hall",
        difficulty: "normal",
        rng_seed: 4,
        party: [{ name: "New hero", class_id: "warrior" }],
      }),
    );
    release();
    await routeFinished;
    await expect(
      page.getByRole("dialog", { name: "Gem Workshop" }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Character" })).toHaveCount(
      0,
    );
    const current = await state(page);
    expect(current.id).toBe(replacement.id);
    expect(current.gems).toEqual([
      expect.objectContaining({ id: "ember_shard", count: 3 }),
    ]);
    expect(current.equipment[0].weapon_item.sockets[0].gem_id).toBeUndefined();
  } finally {
    release();
    await routeFinished;
  }
});

for (const width of [610, 390]) {
  test(`Iron Sword artwork appears on the loadout at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 837 });
    await start(page);
    // This fixture supplies the base item; the separate gathering flow verifies
    // that a genuinely crafted sword has the same authoritative icon metadata.
    await page.evaluate(() =>
      window.__kithlandsTest.debugGiveItem("iron_sword", 1, "World"),
    );
    await page.keyboard.press("m");
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
    await page
      .getByRole("button", { name: "Close gear drawer", exact: true })
      .click();
    const art = page.locator(
      '[data-slot-id="main_hand"] img.equipment-item-art',
    );
    await expect(art).toHaveAttribute(
      "src",
      "/sprites/items/crafted/iron-sword.png",
    );
    await expect
      .poll(() => art.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await art.scrollIntoViewIfNeeded();
    await expect(art).toBeInViewport();
    await capture(page, `${width}-iron-sword-loadout-icon`);
  });
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`keyboard browses gem groups without spending until confirmation at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    await start(page);
    await open(page);
    const before = await state(page);
    const socketMode = page.getByRole("button", {
      name: "Socket gems",
      exact: true,
    });
    const transmuteMode = page.getByRole("button", { name: /Transmute ·/ });
    await socketMode.focus();
    await page.keyboard.press("ArrowRight");
    await expect(transmuteMode).toBeFocused();
    await expect(page.locator(".kith-gem-workshop")).toHaveAttribute(
      "data-mode",
      "socket",
    );
    await page.keyboard.press("Space");
    await expect(page.locator(".kith-gem-workshop")).toHaveAttribute(
      "data-mode",
      "transmute",
    );
    const rows = page.locator('[data-list="recipe"] button');
    await rows.first().focus();
    await page.keyboard.press("ArrowDown");
    const nextRow = rows.nth(width < 620 ? 2 : 1);
    await expect(nextRow).toBeFocused();
    const firstBounds = await rows.first().boundingBox();
    expect((await nextRow.boundingBox()).y).toBeGreaterThan(firstBounds.y);
    if (width < 620) {
      await page.keyboard.press("ArrowRight");
      await expect(rows.nth(3)).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(nextRow).toBeFocused();
    }
    await page.keyboard.press("End");
    await expect(rows.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("End");
    expect((await state(page)).gems).toEqual(before.gems);
    expect((await state(page)).gold).toBe(before.gold);
    await capture(page, `${width}-keyboard-recipe-focus`);
    const recipe = page.locator('[data-recipe-id="refine_ember_gem"]');
    await recipe.focus();
    await page.keyboard.press("Enter");
    const preview = page.getByRole("region", { name: "Recipe preview" });
    await expect(preview).toContainText("3 owned / 3 needed");
    const confirm = preview.locator(".gem-confirm");
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".kith-gem-workshop").getByRole("status"),
    ).toContainText("Ember Gem");
    expect((await state(page)).gems).toEqual([
      expect.objectContaining({ id: "ember_gem", count: 1 }),
    ]);
    await capture(page, `${width}-keyboard-crafted`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
  });
}

test("custom workshop world replaces the locality wizard input scene", async ({
  page,
}) => {
  await start(page);
  expect(
    await page.evaluate(() => window.__kithlandsTest.sceneIsActive("Wizard")),
  ).toBe(false);
  expect(
    await page.evaluate(() => window.__kithlandsTest.sceneIsActive("Title")),
  ).toBe(false);
  await open(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
  ).toBe("World");
  await expect(
    page.getByRole("main", { name: "Kithlands main menu" }),
  ).toHaveCount(0);
});
