import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

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
    (email) => window.__kithlandsTest.startQuickGame(email),
    email,
  );
  await page.evaluate(
    (seed) =>
      window.__kithlandsTest.startCustomGame({
        town_name: "Gem Town",
        people: [{ name: "Coach Bell", relation: "friendly" }],
        places: ["General Store", "Library", "Fire Hall"],
        big_building: "Town Hall",
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
  expect(
    await page
      .locator(".kith-gem-workshop")
      .evaluate((n) => parseFloat(getComputedStyle(n).fontSize)),
  ).toBeGreaterThanOrEqual(15);
}

for (const [width, height] of [
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
    // A native keyboard activation confirms the preview exactly once.
    await recipePreview.locator(".gem-confirm").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText(
      "Created 1 × Ember Gem",
    );
    const crafted = await state(page);
    expect(
      crafted.gem_recipes.find((r) => r.id === "recover_ember_shards").known,
    ).toBe(true);
    expect(crafted.gems).toEqual([
      expect.objectContaining({ id: "ember_gem", count: 1 }),
    ]);
    expect(crafted.equipment[0].weapon_item.sockets[0].gem_id).toBeUndefined();
    await page
      .getByRole("button", { name: "Choose equipment to socket" })
      .click();
    await expect(page.locator("#gem-equipment")).toHaveValue(
      before.equipment[0].weapon_instance_id,
    );
    await socketPreview.locator(".gem-confirm").click();
    await expect(page.getByRole("status")).toContainText("Ember Gem socketed");
    await expect(socketPreview).toContainText("All sockets filled");
    const applied = await state(page);
    expect(applied.equipment[0].weapon_item.sockets[0].gem_id).toBe(
      "ember_gem",
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
    expect(errors).toEqual([]);
  });
}

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
  await expect(page.getByRole("alert")).toContainText("have 0");
  await capture(page, "390x844-server-rejection");
  await page.getByRole("button", { name: "Refresh inventory" }).click();
  await expect(page.getByRole("status")).toContainText("Inventory refreshed");
  expect((await state(page)).gems).toEqual([
    expect.objectContaining({ id: "ember_gem", count: 1 }),
  ]);
  await selectRecipe(page, "recover_ember_shards");
  await page
    .getByRole("region", { name: "Recipe preview" })
    .locator(".gem-confirm")
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Created 2 × Ember Shard",
  );
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

test("earned Ward loot unlocks conversion through ordinary battles", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 800, height: 600 });
  await start(page, 3);
  expect(
    (await state(page)).gem_recipes.find(
      (r) => r.id === "convert_ember_to_ward",
    ).known,
  ).toBe(false);
  for (let battle = 0; battle < 3; battle++) {
    const result = await page.evaluate(() =>
      window.__kithlandsTest.submitAction({ type: "encounter" }, "World"),
    );
    expect(result.error).toBeUndefined();
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.sceneIsActive("Battle") &&
        window.__kithlandsTest.visibleTexts("Battle").length > 5,
    );
    for (let round = 0; round < 30; round++) {
      if (
        !(await page.evaluate(() =>
          window.__kithlandsTest.sceneIsActive("Battle"),
        ))
      )
        break;
      const result = await page.evaluate(() =>
        window.__kithlandsTest.submitAction({ type: "attack" }, "Battle"),
      );
      expect(result.error).toBeUndefined();
      if (result.phase !== "combat") break;
    }
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    expect((await state(page)).phase).not.toBe("defeat");
    if (
      (await state(page)).gem_recipes.find(
        (r) => r.id === "convert_ember_to_ward",
      ).known
    )
      break;
    await page.evaluate(() =>
      window.__kithlandsTest.submitAction({ type: "advance" }, "World"),
    );
  }
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
  await expect(page.getByRole("status")).toContainText(
    "Created 1 × Ward Shard",
  );
  const converted = await state(page);
  expect(converted.gems.find((g) => g.id === "ward_shard").count).toBe(
    earned.gems.find((g) => g.id === "ward_shard").count + 1,
  );
  await capture(page, "800x600-earned-family-conversion");
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
  await page.route("**/socket", async (route) => {
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
    await expect(page.getByRole("status")).toContainText("Applying gem change");
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
    await expect(page.getByRole("status")).toContainText(
      "Ember Shard socketed",
    );
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
    await expect(page.getByRole("alert")).toContainText("Request timed out", {
      timeout: 20_000,
    });
    await expect(
      page
        .getByRole("region", { name: "Recipe preview" })
        .locator(".gem-confirm"),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Refresh inventory" }).click();
    await expect(page.getByRole("status")).toContainText("Inventory refreshed");
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
  await page.route("**/socket", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole("region", { name: "Socket preview" })
      .locator(".gem-confirm")
      .click();
    await expect(page.getByRole("status")).toContainText("Applying gem change");
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
  }
});
