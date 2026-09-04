import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const RUN_ID = Date.now();
const PROOF_DIR = path.join("tmp", `equipment-loadout-${RUN_ID}`);

async function startEquipmentGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [{ name: "Coach Bell", relation: "friendly" }],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      difficulty: "normal",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  for (const [item, qty] of [
    ["patched_mantle", 1],
    ["leather_gloves", 1],
    ["traveler_belt", 1],
    ["trail_pants", 1],
    ["trail_boots", 1],
    ["copper_amulet", 1],
    ["copper_ring", 2],
    ["warrior_signet", 1],
  ]) {
    await page.evaluate(
      ([id, count]) => window.__kithlandsTest.debugGiveItem(id, count, "World"),
      [item, qty],
    );
  }
}

async function openFromCharacterScreen(page) {
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
}

test("manages the full loadout, previews recommendations, and returns from sockets", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await mkdir(PROOF_DIR, { recursive: true });
  await page.setViewportSize({ width: 800, height: 600 });
  await startEquipmentGame(page);
  await openFromCharacterScreen(page);

  await expect(page.locator(".equipment-character")).toHaveText("Ayla");
  await page.getByRole("button", { name: "Next character" }).click();
  await expect(page.locator(".equipment-character")).toHaveText("Mira");
  await expect(page.locator(".equipment-party-position")).toHaveText("2/2");
  // A rapid second activation must not wrap a two-person party back to the
  // starting member and make the navigation appear to have done nothing.
  await page
    .getByRole("button", { name: "Next character" })
    .dispatchEvent("click", { detail: 2 });
  await expect(page.locator(".equipment-character")).toHaveText("Mira");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".equipment-character")).toHaveText("Ayla");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".equipment-character")).toHaveText("Mira");
  await expect(page.locator(".equipment-slot")).toHaveCount(12);
  await page.getByRole("tab", { name: "Spells" }).click();
  await expect(page.locator(".character-detail-panel")).toContainText("Cure");
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-spells-800x600.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next character" }).click();
  await expect(page.locator(".equipment-character")).toHaveText("Ayla");
  await expect(page.getByRole("tab", { name: "Spells" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Previous character" }).click();
  await expect(page.locator(".equipment-character")).toHaveText("Mira");
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect(
    page.locator('[data-slot-id="main_hand"] .equipment-item-art'),
  ).toHaveAttribute("src", /starter\/dawnkeeper-crook\.png$/);
  await page.getByRole("button", { name: "Previous character" }).click();
  await expect(page.locator(".equipment-character")).toHaveText("Ayla");

  const slots = page.locator(".equipment-slot");
  await expect(slots).toHaveCount(12);
  const desktopWeaponFrame = await page
    .locator('[data-slot-id="main_hand"] .equipment-slot-frame')
    .boundingBox();
  expect(desktopWeaponFrame.width).toBeGreaterThanOrEqual(80);
  const desktopAvatar = await page
    .locator(".paperdoll-character-art")
    .boundingBox();
  expect(desktopAvatar.width).toBeLessThanOrEqual(190);
  await expect(page.locator('[data-slot-id="ring_1"]')).toBeVisible();
  await expect(page.locator('[data-slot-id="ring_2"]')).toBeVisible();
  await expect(
    page.locator(".character-summary-label").allTextContents(),
  ).resolves.toEqual(["Vitals", "Combat", "Condition"]);
  await expect(page.locator(".character-resource-note")).toHaveText(
    /Next level in \d+/,
  );
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-default-800x600.png"),
    fullPage: true,
  });

  const weaponSlot = page.locator('[data-slot-id="main_hand"]');
  await weaponSlot.hover();
  const weaponTooltip = weaponSlot.locator(".equipment-tooltip");
  await expect(weaponTooltip).toBeVisible();
  await expect(weaponTooltip).toContainText("Hearthguard Blade");
  await expect(weaponTooltip).toContainText("Power");
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-slot-hover-800x600.png"),
    fullPage: true,
  });
  await page.locator(".character-summary-panel").hover();
  await expect(weaponTooltip).toBeHidden();

  await page.locator('[data-slot-id="ring_2"]').click();
  const ringCandidate = page
    .locator(".equipment-item-row:not(.is-disabled)")
    .filter({ hasText: "Copper Ring" })
    .first();
  await ringCandidate.click();
  await expect(
    page.getByRole("button", { name: "Equip in Ring II" }),
  ).toBeEnabled();
  await expect(page.locator(".comparison-impact")).toContainText(
    "Equip in Ring II",
  );
  await expect(page.locator(".comparison-table-head")).toContainText("Current");
  await expect(page.locator(".comparison-table-head")).toContainText("Preview");
  await expect(page.locator(".comparison-table-row").first()).toBeVisible();
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-ring-comparison.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Equip in Ring II" }).click();
  await page.waitForFunction(() => {
    const state = window.__kithlandsTest.gameState("World");
    return state.equipment[0].loadout.find((slot) => slot.id === "ring_2")
      ?.instance_id;
  });
  await expect(page.locator('[data-slot-id="ring_2"]')).toContainText(
    "Copper Ring",
  );

  const occupiedBefore = await page.evaluate(
    () =>
      window.__kithlandsTest
        .gameState("World")
        .equipment[0].loadout.filter((slot) => slot.item).length,
  );
  await page.getByRole("button", { name: "Recommend Gear" }).click();
  const recommendation = page.locator(".recommendation-dialog");
  await expect(recommendation).toBeVisible();
  await expect(recommendation).toContainText("Nothing has been equipped yet");
  const occupiedDuringPreview = await page.evaluate(
    () =>
      window.__kithlandsTest
        .gameState("World")
        .equipment[0].loadout.filter((slot) => slot.item).length,
  );
  expect(occupiedDuringPreview).toBe(occupiedBefore);
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-recommendation-preview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Apply Recommended Gear" }).click();
  await page.waitForFunction(
    (before) =>
      window.__kithlandsTest
        .gameState("World")
        .equipment[0].loadout.filter((slot) => slot.item).length > before,
    occupiedBefore,
  );
  await expect(page.locator(".equipment-status")).toContainText(
    "Recommended gear equipped",
  );

  await page.locator('[data-slot-id="main_hand"]').click();
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-socket-entry-800x600.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Socket" }).click();
  await expect(
    page.getByRole("dialog", { name: "Gem Workshop" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
  await expect(page.locator('[data-slot-id="main_hand"]')).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-desktop-1440x900.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await expect(page.locator(".kith-equipment-screen")).toHaveClass(
    /is-compact/,
  );
  const mobileWeaponFrame = await page
    .locator('[data-slot-id="main_hand"] .equipment-slot-frame')
    .boundingBox();
  expect(mobileWeaponFrame.width).toBeGreaterThanOrEqual(68);
  await expect(page.locator(".character-summary-label").first()).toBeVisible();
  await expect(page.locator(".character-resource-note")).toBeVisible();
  await page.screenshot({
    path: path.join(PROOF_DIR, "equipment-mobile-390x844.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Close equipment" }).click();
  await expect(page.getByRole("dialog", { name: "Character" })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").equipmentScreenOpen,
      ),
    )
    .toBe(false);
});
