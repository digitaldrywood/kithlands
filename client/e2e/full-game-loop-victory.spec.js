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
  "readiness",
  `debug-${RUN_ID}`,
);
const FOLLOWUP_GAME = {
  town_name: "Cadott, WI",
  people: [
    { name: "Coach Bell", relation: "friendly" },
    { name: "Ms Rivera", relation: "neutral" },
    { name: "Mallory", relation: "rival" },
  ],
  places: ["General Store", "Library", "Fire Hall"],
  big_building: "Town Hall",
  party: [
    { name: "Ayla", class_id: "warrior" },
    { name: "Mira", class_id: "mender" },
    { name: "Cato", class_id: "cinder" },
    { name: "Nia", class_id: "rogue" },
  ],
  difficulty: "normal",
};

mkdirSync(PROOF_DIR, { recursive: true });

async function waitForBridge(page) {
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
}

async function waitForScene(page, sceneKey) {
  await page.waitForFunction(
    (key) => window.__kithlandsTest.sceneIsActive(key),
    sceneKey,
  );
}

async function clickWizardText(page, label) {
  await page.evaluate(
    (text) => window.__kithlandsTest.clickInteractiveText(text, "Wizard"),
    label,
  );
}

async function setWizardUseOsm(page, enabled) {
  const isEnabled = await page.evaluate(() =>
    window.__kithlandsTest
      .visibleTexts("Wizard")
      .some((entry) =>
        entry.text.includes("[X] Use real-world map data (OpenStreetMap)"),
      ),
  );
  if (isEnabled !== enabled) {
    await clickWizardText(page, "Use real-world map data");
  }
}

async function waitForWizardText(page, label) {
  await page.waitForFunction(
    (text) =>
      window.__kithlandsTest
        .visibleTexts("Wizard")
        .some((entry) => entry.text.includes(text)),
    label,
  );
}

async function startWizardGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(
    (email) => window.__kithlandsTest.startWizardFromTitle(email),
    `issue-81-${RUN_ID}@test.dev`,
  );
  await waitForScene(page, "Wizard");

  await waitForWizardText(page, "LOCALITY WIZARD");
  await setWizardUseOsm(page, false);
  await page.locator('input[type="text"]').fill("Cadott, WI");
  await clickWizardText(page, "FIND & CONTINUE");

  await waitForWizardText(page, "NAME YOUR NPCs");
  await clickWizardText(page, "NEXT");

  await waitForWizardText(page, "NAME YOUR PLACES");
  await clickWizardText(page, "NEXT");

  await waitForWizardText(page, "THE BIG BUILDING");
  await clickWizardText(page, "NEXT");

  await waitForWizardText(page, "PICK YOUR PARTY");
  await page.locator('input[type="text"]').nth(0).fill("Ayla");
  await page.locator('input[type="text"]').nth(1).fill("Cato");
  await page.locator('input[type="text"]').nth(2).fill("Nia");
  await page.locator('input[type="text"]').nth(3).fill("Mira");
  await clickWizardText(page, "CREATE GAME");
  await waitForScene(page, "World");
}

async function capturePhase(page, name, label, sceneKey, highlights = []) {
  const proof = await page.evaluate(
    (key) => ({
      scene: window.__kithlandsTest.activeSceneKey(),
      state: window.__kithlandsTest.gameState(key),
      visibleTexts: window.__kithlandsTest.visibleTexts(key),
    }),
    sceneKey,
  );
  writeFileSync(
    path.join(PROOF_DIR, `${name}.json`),
    JSON.stringify(
      {
        evidence: "debug-assisted regression",
        label,
        highlights,
        ...proof,
      },
      null,
      2,
    ),
  );
  await page.screenshot({
    path: path.join(PROOF_DIR, `${name}.png`),
    fullPage: true,
  });
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

async function enterQuestDoor(page, nodeId) {
  await page.evaluate((id) => {
    const spawn = window.__kithlandsTest
      .worldNavigationSnapshot()
      .spawns.find((entry) => entry.node_id === id);
    if (!spawn) throw new Error(`Missing quest door ${id}`);
    window.__kithlandsTest.setPlayerTile(spawn.x, spawn.y + 3, "World");
    window.__kithlandsTest.movePlayer("up", "World");
  }, nodeId);
  await page.waitForFunction((id) => {
    const nav = window.__kithlandsTest.worldNavigationSnapshot();
    return !nav.animating && nav.door?.node_id === id;
  }, nodeId);
  await page.keyboard.press("Enter");
}

async function currentQuest(page, sceneKey = "World") {
  return page.evaluate((key) => {
    const state = window.__kithlandsTest.gameState(key);
    return state.quests[state.current_quest] || null;
  }, sceneKey);
}

async function continueBattleVictory(page) {
  await page.evaluate(() => window.__kithlandsTest.pressKey("Space", "Battle"));
  await waitForContinue(page);
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Continue", "Battle"),
  );
  await waitForScene(page, "World");
}

function compactWorldSnapshot(state) {
  return {
    gold: state.gold,
    currentQuest: state.current_quest,
    equipment: state.equipment.map((entry) => ({
      weapon: entry.weapon_name || "",
      armor: entry.armor_name || "",
    })),
    party: state.party.map((member) => ({
      name: member.name,
      classId: member.class_id,
      level: member.level,
      xp: member.xp,
      promoted: member.promoted,
    })),
  };
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  const scene = await page.evaluate(() =>
    window.__kithlandsTest?.activeSceneKey(),
  );
  if (scene)
    await capturePhase(
      page,
      "failure",
      testInfo.error?.message || "failure",
      scene,
    );
});

test.describe("full game loop debug-assisted regression", () => {
  test("covers wizard, combat, equipment, save/load, promotion and final quest", async ({
    page,
  }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);

    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await startWizardGame(page);
    await capturePhase(
      page,
      "world-start",
      "New game created and entered world",
      "World",
      ["Cadott", "Quest", "Gold"],
    );

    const preEncounterParty = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World").party.map((member) => ({
        slot: member.name === "Ayla" ? 0 : member.name === "Mira" ? 3 : -1,
        hp:
          member.name === "Ayla"
            ? Math.max(1, member.max_hp - 6)
            : member.name === "Mira"
              ? Math.max(1, member.max_hp - 4)
              : member.hp,
      })),
    );
    await page.evaluate(
      (updates) => window.__kithlandsTest.setPartyVitals(updates, "World"),
      preEncounterParty.filter((entry) => entry.slot >= 0),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.debugGiveItem("potion", 2, "World"),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["slime"], 1, "World"),
    );
    await waitForScene(page, "Battle");
    await capturePhase(
      page,
      "encounter",
      "Encounter reached from world",
      "Battle",
      ["[A]TTACK", "[S]PELL", "[I]TEMS", "[F]LEE"],
    );

    const fleeResult = await page.evaluate(() =>
      window.__kithlandsTest.submitAction({ type: "flee" }, "Battle"),
    );
    expect(["world", "combat", "quest_complete"]).toContain(fleeResult.phase);
    if (fleeResult.phase !== "combat") {
      await page.evaluate((state) => {
        window.__kithlandsTest.startScene("World", { gameState: state });
      }, fleeResult);
      await waitForScene(page, "World");
    }
    if (fleeResult.phase === "world") {
      expect(fleeResult.message).toContain("Got away safely");
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyVitals(
          [
            {
              slot: 0,
              hp: Math.max(
                1,
                window.__kithlandsTest.gameState("World").party[0].max_hp - 6,
              ),
            },
            {
              slot: 3,
              hp: Math.max(
                1,
                window.__kithlandsTest.gameState("World").party[3].max_hp - 4,
              ),
            },
          ],
          "World",
        ),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["slime", "goblin"], 1, "World"),
      );
      await waitForScene(page, "Battle");
    } else if (fleeResult.phase === "combat") {
      expect(
        fleeResult.combat_log.some((line) => line.includes("Couldn't escape!")),
      ).toBe(true);
      await waitForScene(page, "Battle");
    } else {
      await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["slime", "goblin"], 1, "World"),
      );
      await waitForScene(page, "Battle");
    }

    const battleState = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Battle"),
    );
    const firstEnemyId = battleState.enemies[0].id;
    const roundResult = await page.evaluate(
      (enemyId) =>
        window.__kithlandsTest.submitAction(
          {
            type: "combat_round",
            actions: [
              { slot: 0, type: "attack", target_id: enemyId },
              { slot: 1, type: "item", item_id: "potion", target_id: 3 },
              { slot: 2, type: "attack", target_id: enemyId },
              { slot: 3, type: "spell", spell_id: "cure", target_id: 0 },
            ],
          },
          "Battle",
        ),
      firstEnemyId,
    );
    const combatLog = roundResult.combat_log.join("\n");
    expect(combatLog).toContain("attacks");
    expect(combatLog).toContain("casts Cure");
    expect(combatLog.toLowerCase()).toContain("potion");
    if (roundResult.phase === "combat") {
      await page.evaluate(() => window.__kithlandsTest.forceVictory("Battle"));
      await continueBattleVictory(page);
    } else {
      await waitForScene(page, "World");
    }

    await page.evaluate(() => window.__kithlandsTest.setGold(100, "World"));
    await page.evaluate(() =>
      window.__kithlandsTest.setPartyLevels(
        [
          { slot: 0, level: 5 },
          { slot: 1, level: 5 },
          { slot: 2, level: 5 },
          { slot: 3, level: 5 },
        ],
        "World",
      ),
    );
    await enterQuestDoor(page, "shop");
    await waitForScene(page, "Town");
    const npc = await page.evaluate(
      () => window.__kithlandsTest.townNpcPositions("Town")[0],
    );
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1, "Town"),
      npc,
    );
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some(
          (entry) =>
            entry.interactive && /^leave shop$/i.test(entry.text.trim()),
        ),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Armor", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Silk Robe")),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Silk Robe", "Town"),
    );
    const compareTexts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Town").map((entry) => entry.text),
    );
    const buyLabel = compareTexts.find((text) => /^buy for /i.test(text));
    const indicatorCount = compareTexts.filter((text) =>
      ["▲", "▼", "=", "-"].includes(text),
    ).length;
    expect(buyLabel).toBeTruthy();
    expect(compareTexts).toContain("Preview: Silk Robe");
    expect(indicatorCount).toBeGreaterThanOrEqual(4);
    await capturePhase(
      page,
      "shop-compare",
      "Shop compare UI is rendered",
      "Town",
      ["Silk Robe", "Buy for", "Abs", "MDef"],
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Buy", "Town"),
    );
    await page.waitForFunction(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return state?.gold < 100;
    });
    const shopBuyState = await page.evaluate(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return {
        gold: state.gold,
      };
    });
    expect(shopBuyState.gold).toBeLessThan(100);
    const weaponBuyResult = await page.evaluate(() =>
      window.__kithlandsTest.buyItem("hand_axe", "weapon", "Town"),
    );
    expect(weaponBuyResult.error).toBeFalsy();

    await page.evaluate(() => window.__kithlandsTest.pressKey("m", "Town"));
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Town").menuOpen,
    );
    await capturePhase(
      page,
      "shop-overlay",
      "Party overlay opened on top of the shop",
      "Town",
      ["PARTY MENU", "General Store", "Silk Robe", "Leave Shop"],
    );
    await page.evaluate(() => window.__kithlandsTest.pressKey("m", "Town"));
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").menuOpen,
    );
    await page.evaluate(() => window.__kithlandsTest.exitTown("Town"));
    await waitForScene(page, "World");
    await page.evaluate(() => window.__kithlandsTest.pressKey("m", "World"));
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World", 0),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
    await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
    await page.locator('[data-slot-id="main_hand"]').click();
    await page
      .locator(".equipment-item-row:not(.is-disabled)")
      .filter({ hasText: "Hand Axe" })
      .click();
    await page
      .getByRole("button", { name: "Equip in Weapon", exact: true })
      .click();
    await page.waitForFunction(() => {
      const state = window.__kithlandsTest.gameState("World");
      return state?.equipment?.[0]?.weapon_name === "Hand Axe";
    });
    await page
      .getByRole("button", { name: "Close equipment", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Character" })).toBeHidden();

    await page.evaluate(async (gameData) => {
      await window.__kithlandsTest.startCustomGame(gameData);
    }, FOLLOWUP_GAME);
    await waitForScene(page, "World");

    const levelsBefore = await page.evaluate(() =>
      window.__kithlandsTest
        .gameState("World")
        .party.map((member) => member.level),
    );
    let levelUpShown = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["dark_knight"], 25, "World"),
      );
      await waitForScene(page, "Battle");
      const victoryState = await page.evaluate(() =>
        window.__kithlandsTest.forceVictory("Battle"),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.pressKey("Space", "Battle"),
      );
      await waitForContinue(page);
      if (
        victoryState.party.some(
          (member, index) => member.level > levelsBefore[index],
        )
      ) {
        levelUpShown = true;
        await capturePhase(
          page,
          "level-up",
          "High-XP victory produced a level up",
          "Battle",
          ["VICTORY!", "LEVEL UP", "Continue"],
        );
      }
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("Continue", "Battle"),
      );
      await waitForScene(page, "World");
      if (levelUpShown) break;
    }
    expect(levelUpShown).toBe(true);

    const saveName = `Issue 81 regression ${RUN_ID}`;
    const saveBefore = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    const saveResult = await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name, "World"),
      saveName,
    );
    expect(saveResult.status).toBe("saved");

    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const savedEntry = saves.saves.find((entry) => entry.name === saveName);
    expect(savedEntry).toBeTruthy();

    await page.evaluate(
      (saveId) => window.__kithlandsTest.loadSave(saveId),
      savedEntry.id,
    );
    await waitForScene(page, "World");
    const saveAfter = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    expect(compactWorldSnapshot(saveAfter)).toEqual(
      compactWorldSnapshot(saveBefore),
    );
    await capturePhase(
      page,
      "save-load",
      "Save loaded back into the world with matching state",
      "World",
      ["Gold", "Quest"],
    );

    const promoIdx = await page.evaluate(() => {
      const state = window.__kithlandsTest.gameState("World");
      return state.quests.findIndex((quest) => quest.is_promotion);
    });
    expect(promoIdx).toBeGreaterThanOrEqual(0);
    await page.evaluate(
      (idx) => window.__kithlandsTest.warpQuest(idx, "World"),
      promoIdx,
    );

    let promoQuest = await currentQuest(page, "World");
    expect(promoQuest.is_promotion).toBe(true);
    expect(promoQuest.giver_node_id).toBeTruthy();

    await enterQuestDoor(page, promoQuest.giver_node_id);
    await waitForScene(page, "Town");
    await page.evaluate(() => window.__kithlandsTest.exitTown("Town"));
    await waitForScene(page, "World");
    promoQuest = await currentQuest(page);
    expect(promoQuest.promo_stage).toBe(1);
    await enterQuestDoor(page, promoQuest.target_node_id);
    await waitForScene(page, "Battle");
    await capturePhase(
      page,
      "boss-battle",
      "Promotion guardian battle started",
      "Battle",
      ["Dark Knight", "[A]TTACK", "[S]PELL", "[I]TEMS"],
    );

    await page.evaluate(() => window.__kithlandsTest.forceVictory("Battle"));
    await continueBattleVictory(page);

    promoQuest = await currentQuest(page, "World");
    await enterQuestDoor(page, promoQuest.giver_node_id);
    await page.waitForFunction(
      () => window.__kithlandsTest.gameState("World")?.phase === "promotion",
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("CLASS PROMOTION")),
    );
    await capturePhase(
      page,
      "promotion",
      "Promotion prompt is shown after returning with the proof",
      "World",
      ["CLASS PROMOTION", "CLAIM PROMOTION", "Pyromancer", "Sage"],
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("CLAIM PROMOTION", "World"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .gameState("World")
        .party.every((member) => member.promoted),
    );

    const finalQuestIndex = await page.evaluate(() => {
      const state = window.__kithlandsTest.gameState("World");
      return state.quests.length - 1;
    });
    await page.evaluate(
      (idx) => window.__kithlandsTest.warpQuest(idx, "World"),
      finalQuestIndex,
    );
    const finalQuest = await currentQuest(page, "World");
    await enterQuestDoor(page, finalQuest.target_node_id);
    await page.waitForFunction(
      () => window.__kithlandsTest.gameState("World")?.phase === "victory",
    );
    const completed = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    // DebugWarpQuest selects a quest; it does not complete skipped quests.
    // Assert that the actual door action completed the final quest.
    expect(completed.quests[finalQuestIndex].completed).toBe(true);
    expect(completed.current_quest).toBe(completed.quests.length);
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("VICTORY!")),
    );
    await capturePhase(
      page,
      "victory",
      "Campaign victory reached after promotion and save/load",
      "World",
      ["VICTORY!", "Cadott"],
    );

    expect(pageErrors).toEqual([]);
  });
});
