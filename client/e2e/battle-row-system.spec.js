import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function bootToWorld(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function startCustomGame(page, gameData) {
  await page.evaluate(
    (data) => window.__kithlandsTest.startCustomGame(data),
    gameData,
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function setProofOverlay(page, title, lines = []) {
  await page.evaluate(
    ({ nextTitle, nextLines }) => {
      const existing = document.getElementById("issue-231-proof");
      if (existing) existing.remove();
      const panel = document.createElement("div");
      panel.id = "issue-231-proof";
      panel.style.position = "fixed";
      panel.style.top = "8px";
      panel.style.left = "8px";
      panel.style.zIndex = "9999";
      panel.style.background = "rgba(15, 23, 42, 0.92)";
      panel.style.color = "#e2e8f0";
      panel.style.padding = "10px 12px";
      panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
      panel.style.borderRadius = "8px";
      panel.style.fontFamily = "monospace";
      panel.style.fontSize = "12px";
      panel.style.whiteSpace = "pre";
      panel.textContent = [nextTitle, ...nextLines].join("\n");
      document.body.appendChild(panel);
    },
    { nextTitle: title, nextLines: lines },
  );
}

async function saveAndReload(page, name) {
  await page.evaluate(
    (saveName) => window.__kithlandsTest.saveGame(saveName),
    name,
  );
  const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
  const saveId = saves?.saves?.[0]?.id;
  expect(saveId).toBeTruthy();
  await page.evaluate((id) => window.__kithlandsTest.loadSave(id), saveId);
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function resolveFirstEnemyHit(page) {
  return await page.evaluate(async () => {
    for (let round = 0; round < 3; round++) {
      const result = await window.__kithlandsTest.submitAction(
        { type: "wait" },
        "Battle",
      );
      const hit = (result.combat_actions || []).find(
        (entry) => entry.kind === "attack" && entry.damage_type === "physical",
      );
      if (hit) {
        return hit.damage;
      }
    }
    return 0;
  });
}

test.describe("battle row system proof — issue #231", () => {
  test("shows formation UI, persisted battle rows, and reduced back-row physical damage", async ({
    page,
  }, testInfo) => {
    await bootToWorld(page);

    await startCustomGame(page, {
      town_name: "Cadott, WI",
      people: [
        { name: "Coach Bell", relation: "friendly" },
        { name: "Ms Rivera", relation: "neutral" },
        { name: "Mallory", relation: "rival" },
      ],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      difficulty: "normal",
      rng_seed: 231231,
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
        { name: "Cato", class_id: "cinder" },
        { name: "Nia", class_id: "rogue" },
      ],
    });

    await page.evaluate(() => window.__kithlandsTest.pressKey("m", "World"));
    await page.waitForFunction(
      () => !!window.__kithlandsTest.partyMenuSummary("World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("FORMATION", "World"),
    );
    await page.waitForFunction(
      () => !!window.__kithlandsTest.formationMenuSummary("World"),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickFormationToggle(0, "back", "World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickFormationToggle(1, "front", "World"),
    );

    const formationSummary = await page.evaluate(() =>
      window.__kithlandsTest.formationMenuSummary("World"),
    );
    expect(formationSummary.rows[0].row).toBe("back");
    expect(formationSummary.rows[1].row).toBe("front");

    await setProofOverlay(
      page,
      "Formation menu",
      formationSummary.rows.map((row) => {
        const line = row.row === "front" ? "FRONT" : "BACK";
        return `slot ${row.slot + 1} ${row.name}: ${line}`;
      }),
    );
    await page.screenshot({
      path: testInfo.outputPath(`battle-row-formation-menu-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() => window.__kithlandsTest.saveFormation("World"));
    await page.waitForFunction(() => {
      const state = window.__kithlandsTest.gameState("World");
      return (
        state?.party?.[0]?.row === "back" && state?.party?.[1]?.row === "front"
      );
    });

    await saveAndReload(page, `Issue 231 ${RUN_ID}`);
    const reloadedRows = await page.evaluate(() =>
      window.__kithlandsTest
        .gameState("World")
        .party.map((member) => member.row),
    );
    expect(reloadedRows.slice(0, 4)).toEqual([
      "back",
      "front",
      "back",
      "front",
    ]);

    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.activeSceneKey() === "Battle" &&
        !!window.__kithlandsTest.gameState("Battle")?.enemies?.length,
    );

    const layoutSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(layoutSnapshot.partyMembers[0].row).toBe("back");
    expect(layoutSnapshot.partyMembers[1].row).toBe("front");
    expect(layoutSnapshot.partyMembers[0].x).toBeGreaterThan(
      layoutSnapshot.partyMembers[1].x,
    );

    await setProofOverlay(
      page,
      "Battle rows after reload",
      layoutSnapshot.partyMembers.map(
        (member) =>
          `slot ${member.slot + 1} ${member.name}: ${member.row} @ ${Math.round(member.x)},${Math.round(member.y)}`,
      ),
    );
    await page.screenshot({
      path: testInfo.outputPath(`battle-row-layout-${RUN_ID}.png`),
      fullPage: true,
    });

    await startCustomGame(page, {
      town_name: "Cadott, WI",
      people: [{ name: "Coach Bell", relation: "friendly" }],
      places: ["General Store"],
      big_building: "Town Hall",
      difficulty: "normal",
      rng_seed: 98765,
      party: [{ name: "Tank", class_id: "warrior", row: "front" }],
    });
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["goblin"], 1),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    const frontDamage = await resolveFirstEnemyHit(page);
    expect(frontDamage).toBeGreaterThan(0);

    await startCustomGame(page, {
      town_name: "Cadott, WI",
      people: [{ name: "Coach Bell", relation: "friendly" }],
      places: ["General Store"],
      big_building: "Town Hall",
      difficulty: "normal",
      rng_seed: 98765,
      party: [{ name: "Tank", class_id: "warrior", row: "back" }],
    });
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["goblin"], 1),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    const backDamage = await resolveFirstEnemyHit(page);
    expect(backDamage).toBeGreaterThan(0);
    expect(backDamage).toBeLessThan(frontDamage);

    await page.evaluate(
      (damage) =>
        window.__kithlandsTest.showPartyDamageNumber(damage, "Battle"),
      backDamage,
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.floatingTexts.some((entry) =>
        String(entry.targetKey || "").startsWith("proof_party_damage_"),
      );
    });

    await setProofOverlay(page, "Back-row physical damage", [
      `same-seed front-row control: ${frontDamage}`,
      `actual back-row hit: ${backDamage}`,
      "back-row physical damage is reduced",
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`battle-row-halved-damage-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
