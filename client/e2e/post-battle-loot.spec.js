import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(
  SPEC_DIR,
  "..",
  "tmp",
  `post-battle-loot-${RUN_ID}`,
);
mkdirSync(PROOF_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "default-800x600", width: 800, height: 600 },
  { name: "phone-390x844", width: 390, height: 844 },
];

const GAME_FIXTURE = {
  town_name: "Cadott, WI",
  people: [
    { name: "Coach Bell", relation: "friendly" },
    { name: "Ms Rivera", relation: "neutral" },
  ],
  places: ["General Store", "Library"],
  big_building: "Town Hall",
  party: [
    { name: "Hero", class_id: "warrior" },
    { name: "Sparks", class_id: "cinder" },
  ],
  difficulty: "normal",
  rng_seed: 4203,
};

async function startGame(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startQuickGame(email),
    `post-battle-loot-${viewport.name}-${RUN_ID}@kithlands.dev`,
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate((gameData) => {
    return window.__kithlandsTest.startCustomGame(gameData);
  }, GAME_FIXTURE);
  await page.evaluate(() =>
    window.__kithlandsTest.setPartyLevels(
      [
        { slot: 0, level: 20 },
        { slot: 1, level: 20 },
      ],
      "World",
    ),
  );
}

async function forceGuaranteedLootVictory(page) {
  const before = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.forceEncounter(
      ["dark_knight", "millroot_warden"],
      3,
      "World",
    ),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Battle",
  );
  const victory = await page.evaluate(() =>
    window.__kithlandsTest.forceVictory("Battle"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Battle")
      .some((entry) => entry.text === "VICTORY!"),
  );
  return { before, victory };
}

async function openLootDecision(page) {
  await page.evaluate(() => window.__kithlandsTest.pressKey("Space", "Battle"));
  const dialog = page.getByRole("dialog", { name: "New Equipment" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function exactInstanceOccurrences(state, instanceID) {
  const inventory = (state.items || []).filter(
    (item) => item.instance_id === instanceID,
  ).length;
  const equipped = (state.equipment || [])
    .flatMap((entry) => entry.loadout || [])
    .filter((slot) => slot.instance_id === instanceID).length;
  return { inventory, equipped, total: inventory + equipped };
}

async function capture(page, viewport, label, payload) {
  const base = `${viewport.name}-${label}-${RUN_ID}`;
  writeFileSync(
    path.join(PROOF_DIR, `${base}.json`),
    JSON.stringify(payload, null, 2),
  );
  await page.screenshot({
    path: path.join(PROOF_DIR, `${base}.png`),
    fullPage: true,
  });
}

async function expectInsideViewport(page, locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function waitForContinue(page) {
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Battle")
      .some(
        (entry) => entry.interactive && /^continue$/i.test(entry.text.trim()),
      ),
  );
}

async function continueToWorld(page) {
  await waitForContinue(page);
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Continue", "Battle"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} shows exact loot and resolves Equip Now or Keep`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await startGame(page, viewport);
    const first = await forceGuaranteedLootVictory(page);
    const equipmentDrop = first.victory.battle_rewards.drops.find(
      (drop) => drop.kind === "equipment" && drop.item_id === "steel_sword",
    );
    const gemDrop = first.victory.battle_rewards.drops.find(
      (drop) => drop.kind === "gem" && drop.item_id === "ember_shard",
    );
    expect(equipmentDrop?.instance_id).toBeTruthy();
    expect(equipmentDrop?.item?.name).toBe(equipmentDrop.name);
    expect(gemDrop?.quantity).toBe(1);

    const visibleReceipt = await page.evaluate(() =>
      window.__kithlandsTest
        .visibleTexts("Battle")
        .map((entry) => entry.text)
        .join("\n"),
    );
    expect(visibleReceipt).toContain(equipmentDrop.name);
    expect(visibleReceipt).toContain("Ember Shard");
    await capture(page, viewport, "victory-receipt", {
      equipmentDrop,
      gemDrop,
      visibleReceipt,
    });

    const dialog = await openLootDecision(page);
    await expect(dialog).toContainText(equipmentDrop.name);
    await expect(dialog).toContainText("Already secured in inventory");
    await expect(dialog).toContainText("Current:");
    const primaryEquip = dialog.getByRole("button", {
      name: /Equip Now.*Hero.*Weapon/,
    });
    const keep = dialog.getByRole("button", { name: "Keep in Inventory" });
    await expect(primaryEquip).toBeVisible();
    await expect(keep).toBeVisible();
    await expectInsideViewport(page, primaryEquip);
    await expectInsideViewport(page, keep);
    if (viewport.width > 390) {
      await expectInsideViewport(
        page,
        dialog.getByRole("button", { name: /Equip Now.*Hero.*Off Hand/ }),
      );
    }
    await expect(
      dialog.getByRole("button", { name: /Equip Now.*Sparks/ }),
    ).toHaveCount(0);
    const inputWhileOpen = await page.evaluate(() => {
      return {
        ...window.__kithlandsTest.sceneInputSnapshot("Battle"),
        activeElement: document.activeElement?.textContent,
      };
    });
    expect(inputWhileOpen.inputEnabled).toBe(false);
    expect(inputWhileOpen.keyboardEnabled).toBe(false);
    await capture(page, viewport, "equip-decision", {
      equipmentDrop,
      inputWhileOpen,
      dialogText: await dialog.innerText(),
    });

    if (viewport.width <= 390) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Choose Equip Now or Keep");
      await expect(
        page.getByRole("button", { name: "Keep in Inventory" }),
      ).toBeFocused();
    }

    await primaryEquip.click();
    await expect(dialog).toBeHidden();
    const afterEquip = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Battle"),
    );
    expect(
      afterEquip.battle_rewards.drops.find(
        (drop) => drop.instance_id === equipmentDrop.instance_id,
      )?.decision,
    ).toBe("equipped");
    expect(afterEquip.equipment[0].weapon_instance_id).toBe(
      equipmentDrop.instance_id,
    );
    expect(
      exactInstanceOccurrences(afterEquip, equipmentDrop.instance_id),
    ).toEqual({
      inventory: 0,
      equipped: 1,
      total: 1,
    });
    const displacedID = first.before.equipment[0].weapon_instance_id;
    expect(exactInstanceOccurrences(afterEquip, displacedID)).toEqual({
      inventory: 1,
      equipped: 0,
      total: 1,
    });
    const inputAfterEquip = await page.evaluate(() => {
      return window.__kithlandsTest.sceneInputSnapshot("Battle");
    });
    expect(inputAfterEquip).toEqual({
      inputEnabled: true,
      keyboardEnabled: true,
      modalLocks: [],
    });
    await continueToWorld(page);

    const second = await forceGuaranteedLootVictory(page);
    const keptDrop = second.victory.battle_rewards.drops.find(
      (drop) => drop.kind === "equipment" && drop.item_id === "steel_sword",
    );
    expect(keptDrop.instance_id).not.toBe(equipmentDrop.instance_id);
    const keepDialog = await openLootDecision(page);
    await keepDialog.getByRole("button", { name: "Keep in Inventory" }).click();
    await expect(keepDialog).toBeHidden();
    const afterKeep = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Battle"),
    );
    expect(
      afterKeep.battle_rewards.drops.find(
        (drop) => drop.instance_id === keptDrop.instance_id,
      )?.decision,
    ).toBe("kept");
    expect(exactInstanceOccurrences(afterKeep, keptDrop.instance_id)).toEqual({
      inventory: 1,
      equipped: 0,
      total: 1,
    });
    expect(afterKeep.equipment[0].weapon_instance_id).toBe(
      equipmentDrop.instance_id,
    );
    await continueToWorld(page);

    expect(pageErrors).toEqual([]);
  });
}
