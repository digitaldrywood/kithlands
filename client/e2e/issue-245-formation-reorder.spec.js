import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

test.use({
  viewport: { width: 1280, height: 720 },
});

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startFormationGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [
        { name: "Coach Bell", relation: "friendly" },
        { name: "Ms Rivera", relation: "neutral" },
        { name: "Mallory", relation: "rival" },
      ],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      difficulty: "normal",
      rng_seed: 245245,
      party: [
        { name: "Ayla", class_id: "warrior", row: "front" },
        { name: "Mira", class_id: "mender", row: "back" },
        { name: "Cato", class_id: "cinder", row: "back" },
        { name: "Nia", class_id: "rogue", row: "front" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function openFormation(page) {
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
}

async function setProofOverlay(page, title, lines = []) {
  await page.evaluate(
    ({ nextTitle, nextLines }) => {
      const existing = document.getElementById("issue-245-proof");
      if (existing) existing.remove();
      const panel = document.createElement("div");
      panel.id = "issue-245-proof";
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

test.describe("issue #245 formation reorder proof", () => {
  test("swaps slot 0 and slot 2, persists order and rows, and matches battle layout after reload", async ({
    page,
  }, testInfo) => {
    await startFormationGame(page);
    await openFormation(page);

    const initialSummary = await page.evaluate(() =>
      window.__kithlandsTest.formationMenuSummary("World"),
    );
    expect(initialSummary.rows.map((row) => row.name)).toEqual([
      "1. Ayla",
      "2. Mira",
      "3. Cato",
      "4. Nia",
    ]);
    expect(initialSummary.rows.map((row) => row.row)).toEqual([
      "front",
      "back",
      "back",
      "front",
    ]);
    await setProofOverlay(
      page,
      "Issue #245 — initial formation layout",
      initialSummary.rows.map(
        (row) => `slot ${row.slot + 1}: ${row.name} (${row.row})`,
      ),
    );
    await page.screenshot({
      path: testInfo.outputPath(`issue-245-formation-initial-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("Enter", "World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("ArrowDown", "World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("ArrowDown", "World"),
    );

    const pendingSummary = await page.evaluate(() =>
      window.__kithlandsTest.formationMenuSummary("World"),
    );
    expect(pendingSummary.pickedIdx).toBe(0);
    expect(pendingSummary.focusedIdx).toBe(2);
    expect(pendingSummary.preview.some((entry) => entry.moved)).toBe(true);
    await setProofOverlay(page, "Issue #245 — pick active with ghost preview", [
      `picked slot: ${pendingSummary.pickedIdx + 1}`,
      `focused slot: ${pendingSummary.focusedIdx + 1}`,
      ...pendingSummary.preview
        .filter((entry) => entry.moved)
        .map(
          (entry) =>
            `preview slot ${entry.slot + 1}: ${entry.name} (${entry.row})`,
        ),
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`issue-245-formation-pick-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("Enter", "World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("ArrowRight", "World"),
    );

    const swappedSummary = await page.evaluate(() =>
      window.__kithlandsTest.formationMenuSummary("World"),
    );
    expect(swappedSummary.reorder).toEqual([2, 1, 0, 3]);
    expect(swappedSummary.rows.map((row) => row.name)).toEqual([
      "1. Cato",
      "2. Mira",
      "3. Ayla",
      "4. Nia",
    ]);
    expect(swappedSummary.rows.map((row) => row.row)).toEqual([
      "back",
      "back",
      "back",
      "front",
    ]);

    await page.evaluate(() => window.__kithlandsTest.saveFormation("World"));
    await page.waitForFunction(() => {
      const party = window.__kithlandsTest.gameState("World")?.party || [];
      return (
        party[0]?.name === "Cato" &&
        party[1]?.name === "Mira" &&
        party[2]?.name === "Ayla" &&
        party[2]?.row === "back"
      );
    });

    await saveAndReload(page, `Issue 245 ${RUN_ID}`);

    const reloadedParty = await page.evaluate(() =>
      window.__kithlandsTest
        .gameState("World")
        .party.map((member) => ({ name: member.name, row: member.row })),
    );
    expect(reloadedParty).toEqual([
      { name: "Cato", row: "back" },
      { name: "Mira", row: "back" },
      { name: "Ayla", row: "back" },
      { name: "Nia", row: "front" },
    ]);

    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.activeSceneKey() === "Battle" &&
        !!window.__kithlandsTest.gameState("Battle")?.enemies?.length,
    );

    const battleSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot("Battle"),
    );
    expect(
      battleSnapshot.partyMembers.map((member) => ({
        name: member.name,
        row: member.row,
      })),
    ).toEqual([
      { name: "Cato", row: "back" },
      { name: "Mira", row: "back" },
      { name: "Ayla", row: "back" },
      { name: "Nia", row: "front" },
    ]);
    expect(battleSnapshot.partyMembers[3].x).toBeLessThan(
      battleSnapshot.partyMembers[0].x,
    );

    await setProofOverlay(
      page,
      "Issue #245 — post-reload battle layout",
      battleSnapshot.partyMembers.map(
        (member) =>
          `slot ${member.slot + 1}: ${member.name} ${member.row} @ ${Math.round(member.x)},${Math.round(member.y)}`,
      ),
    );
    await page.screenshot({
      path: testInfo.outputPath(`issue-245-battle-reload-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
