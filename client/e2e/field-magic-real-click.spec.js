import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
}

async function startQuickAuth(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function startMenderGame(page) {
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [
        { name: "Bob", relation: "friendly" },
        { name: "Mrs Henderson", relation: "neutral" },
        { name: "Mayor Grimes", relation: "rival" },
      ],
      places: ["The School", "Creswood Corners", "Fire Hall"],
      big_building: "Town Hall",
      party: [
        { name: "Mira", class_id: "mender" },
        { name: "Tank", class_id: "warrior" },
      ],
      difficulty: "normal",
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function worldParty(page) {
  return page.evaluate(() => window.__kithlandsTest.gameState("World").party);
}

async function setFieldMagicVitals(page, updates) {
  await page.evaluate(
    (nextUpdates) =>
      window.__kithlandsTest.setPartyVitals(nextUpdates, "World"),
    updates,
  );
}

async function clickBridgePosition(page, fnName, label, sceneKey) {
  if (fnName === "menuButtonPosition" && label === "MAGIC") {
    await page.getByRole("button", { name: /^Magic/ }).click();
    return;
  }
  const pos = await page.evaluate(
    ({ nextFnName, nextLabel, nextSceneKey }) =>
      window.__kithlandsTest[nextFnName](nextLabel, nextSceneKey),
    { nextFnName: fnName, nextLabel: label, nextSceneKey: sceneKey },
  );
  expect(pos).toBeTruthy();
  await page.mouse.click(pos.x, pos.y);
}

async function waitForInteractiveText(page, text, sceneKey = "World") {
  await page.waitForFunction(
    ({ nextText, nextSceneKey }) =>
      window.__kithlandsTest
        .visibleTexts(nextSceneKey)
        .some((entry) => entry.interactive && entry.text.includes(nextText)),
    { nextText: text, nextSceneKey: sceneKey },
  );
}

async function waitForFieldMagicRow(page, text, sceneKey = "World") {
  await page.waitForFunction(
    ({ nextText, nextSceneKey }) =>
      !!window.__kithlandsTest.fieldMagicRowPosition(nextText, nextSceneKey),
    { nextText: text, nextSceneKey: sceneKey },
  );
}

async function addVitalsOverlay(page, label) {
  await page.evaluate((overlayLabel) => {
    const existing = document.getElementById("field-magic-real-click-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "field-magic-real-click-proof";
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

    const gs = window.__kithlandsTest.gameState("World");
    const party = gs?.party || [];
    panel.textContent = [
      overlayLabel,
      ...party.map(
        (member, idx) =>
          `P${idx + 1} ${member.name}: HP ${member.hp}/${member.max_hp}  MP ${member.mp}/${member.max_mp}`,
      ),
    ].join("\n");
    document.body.appendChild(panel);
  }, label);
}

async function forceBattleThenReturnToWorld(page) {
  const forced = await page.evaluate(async () => {
    const result = await window.__kithlandsTest.forceEncounter(["slime"], 1);
    return {
      result,
      battleActive: window.__kithlandsTest.sceneIsActive("Battle"),
      battleState: window.__kithlandsTest.gameState("Battle"),
    };
  });
  expect(forced.result?.error || null).toBeNull();
  expect(forced.result?.phase).toBe("combat");
  expect(forced.battleActive).toBe(true);
  expect(Array.isArray(forced.battleState?.enemies)).toBe(true);
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.sceneIsActive("Battle") &&
      !!window.__kithlandsTest.gameState("Battle")?.enemies?.length,
  );
  const outcome = await page.evaluate(async () => {
    for (let round = 0; round < 10; round += 1) {
      const gs = window.__kithlandsTest.gameState("Battle");
      if (!gs) {
        return { error: "battle scene unavailable", round };
      }
      const enemyId = (gs.enemies || []).find(
        (enemy) => (enemy.current_hp ?? enemy.hp ?? 0) > 0,
      )?.id;
      if (!enemyId) {
        return { error: "no living enemy found", round };
      }
      const actions = (gs.party || [])
        .map((member, slot) =>
          member.hp > 0 ? { slot, type: "attack", target_id: enemyId } : null,
        )
        .filter(Boolean);
      const result = await window.__kithlandsTest.submitAction(
        { type: "combat_round", actions },
        "Battle",
      );
      if (result?.phase && result.phase !== "combat") {
        return { phase: result.phase, round: round + 1 };
      }
    }
    return { error: "combat did not end within 10 rounds" };
  });
  expect(outcome.error || null).toBeNull();
  expect(outcome.phase).not.toBe("combat");
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.sceneIsActive("World") &&
      !window.__kithlandsTest.sceneIsActive("Battle"),
  );
}

test.describe("field magic real click flow", () => {
  test("fresh party shows why field healing is unavailable", async ({
    page,
  }, testInfo) => {
    await startQuickAuth(page);
    await startMenderGame(page);

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await expect(page.getByRole("button", { name: /^Magic/ })).toBeEnabled();
    await clickBridgePosition(page, "menuButtonPosition", "MAGIC", "World");
    await waitForFieldMagicRow(page, "Mira");
    await clickBridgePosition(page, "fieldMagicRowPosition", "Mira", "World");
    await waitForFieldMagicRow(page, "Cure");
    await clickBridgePosition(page, "fieldMagicRowPosition", "Cure", "World");
    await page.waitForFunction(() => {
      const texts = window.__kithlandsTest.visibleTexts("World");
      return (
        texts.some(
          (entry) => entry.text.includes("Mira") && !entry.interactive,
        ) &&
        texts.some(
          (entry) => entry.text.includes("Tank") && !entry.interactive,
        ) &&
        texts.some((entry) => entry.text.includes("full HP"))
      );
    });

    await addVitalsOverlay(page, "FULL HP: Cure opens target picker");
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-disabled-menu-${RUN_ID}.png`),
      fullPage: true,
    });

    if (
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").fieldMagicOpen,
      )
    ) {
      await clickBridgePosition(
        page,
        "interactiveTextPosition",
        "DONE",
        "World",
      );
    }
    const parentMenu = page.getByRole("button", {
      name: "Back to game",
      exact: true,
    });
    if (await parentMenu.isVisible()) await parentMenu.click();
    await page.evaluate(() =>
      window.__kithlandsTest.openCharacterDetail(0, "World"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
    await waitForInteractiveText(page, "Cure");
    await clickBridgePosition(page, "interactiveTextPosition", "Cure", "World");
    await page.waitForFunction(() => {
      const texts = window.__kithlandsTest.visibleTexts("World");
      return (
        texts.some(
          (entry) => entry.text.includes("Mira") && !entry.interactive,
        ) &&
        texts.some(
          (entry) => entry.text.includes("Tank") && !entry.interactive,
        ) &&
        texts.some((entry) => entry.text.includes("full HP"))
      );
    });

    await addVitalsOverlay(page, "FULL HP: detail opens blocked targets");
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-disabled-detail-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("casts Cure from the world MAGIC menu by actual pointer clicks", async ({
    page,
  }, testInfo) => {
    await startQuickAuth(page);
    await startMenderGame(page);

    const initialParty = await worldParty(page);
    await setFieldMagicVitals(page, [
      { slot: 0, hp: Math.max(1, initialParty[0].max_hp - 2) },
      { slot: 1, hp: Math.max(1, initialParty[1].max_hp - 5) },
    ]);

    const before = await worldParty(page);
    const targetIdx =
      before[1].hp < before[1].max_hp
        ? 1
        : before.findIndex((member) => member.hp < member.max_hp);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const targetName = before[targetIdx].name;

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );

    await clickBridgePosition(page, "menuButtonPosition", "MAGIC", "World");
    await waitForFieldMagicRow(page, "Mira");

    await addVitalsOverlay(page, `REAL CLICK before Cure on ${targetName}`);
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-real-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await clickBridgePosition(page, "fieldMagicRowPosition", "Mira", "World");
    await waitForFieldMagicRow(page, "Cure");
    await clickBridgePosition(page, "fieldMagicRowPosition", "Cure", "World");
    await page.waitForFunction(
      ({ nextTargetName }) =>
        window.__kithlandsTest
          .visibleTexts("World")
          .some((entry) => entry.text.includes(nextTargetName)),
      { nextTargetName: targetName },
    );
    await clickBridgePosition(
      page,
      "fieldMagicRowPosition",
      targetName,
      "World",
    );

    await page.waitForFunction(
      ({ nextTargetIdx, beforeHP }) => {
        const party = window.__kithlandsTest.gameState("World").party;
        return party[nextTargetIdx].hp > beforeHP;
      },
      { nextTargetIdx: targetIdx, beforeHP: before[targetIdx].hp },
    );

    await addVitalsOverlay(page, `REAL CLICK after Cure on ${targetName}`);
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-real-after-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("casts Cure from character detail by actual pointer clicks", async ({
    page,
  }, testInfo) => {
    await startQuickAuth(page);
    await startMenderGame(page);

    const initialParty = await worldParty(page);
    await setFieldMagicVitals(page, [
      { slot: 0, hp: Math.max(1, initialParty[0].max_hp - 3) },
      { slot: 1, hp: Math.max(1, initialParty[1].max_hp - 4) },
    ]);

    const before = await worldParty(page);
    const targetIdx = before.findIndex((member) => member.hp < member.max_hp);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const targetName = before[targetIdx].name;

    if (
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").fieldMagicOpen,
      )
    ) {
      await clickBridgePosition(
        page,
        "interactiveTextPosition",
        "DONE",
        "World",
      );
    }
    const parentMenu = page.getByRole("button", {
      name: "Back to game",
      exact: true,
    });
    if (await parentMenu.isVisible()) await parentMenu.click();
    await page.evaluate(() =>
      window.__kithlandsTest.openCharacterDetail(0, "World"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
    await waitForInteractiveText(page, "Cure");

    await addVitalsOverlay(
      page,
      `REAL CLICK detail before Cure on ${targetName}`,
    );
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-detail-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await clickBridgePosition(page, "interactiveTextPosition", "Cure", "World");
    await waitForFieldMagicRow(page, targetName);
    await clickBridgePosition(
      page,
      "fieldMagicRowPosition",
      targetName,
      "World",
    );

    await page.waitForFunction(
      ({ nextTargetIdx, beforeHP }) => {
        const party = window.__kithlandsTest.gameState("World").party;
        return (
          party[nextTargetIdx].hp > beforeHP &&
          window.__kithlandsTest.sceneFlags("World").fieldMagicOpen
        );
      },
      { nextTargetIdx: targetIdx, beforeHP: before[targetIdx].hp },
    );

    await clickBridgePosition(page, "interactiveTextPosition", "DONE", "World");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
    await addVitalsOverlay(
      page,
      `REAL CLICK detail after Cure on ${targetName}`,
    );
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-detail-after-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("casts Cure after returning from battle", async ({ page }, testInfo) => {
    await startQuickAuth(page);
    await startMenderGame(page);

    const initialParty = await worldParty(page);
    await setFieldMagicVitals(page, [
      { slot: 0, hp: Math.max(1, initialParty[0].max_hp - 4) },
      { slot: 1, hp: Math.max(1, initialParty[1].max_hp - 6) },
    ]);

    await forceBattleThenReturnToWorld(page);

    const before = await worldParty(page);
    const targetIdx = before.findIndex((member) => member.hp < member.max_hp);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const targetName = before[targetIdx].name;

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await clickBridgePosition(page, "menuButtonPosition", "MAGIC", "World");
    await waitForFieldMagicRow(page, "Mira");
    await clickBridgePosition(page, "fieldMagicRowPosition", "Mira", "World");
    await waitForFieldMagicRow(page, "Cure");

    await addVitalsOverlay(page, `POST BATTLE before Cure on ${targetName}`);
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-post-battle-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await clickBridgePosition(page, "fieldMagicRowPosition", "Cure", "World");
    await page.waitForFunction(
      ({ nextTargetName }) =>
        window.__kithlandsTest
          .visibleTexts("World")
          .some((entry) => entry.text.includes(nextTargetName)),
      { nextTargetName: targetName },
    );
    await clickBridgePosition(
      page,
      "fieldMagicRowPosition",
      targetName,
      "World",
    );
    await page.waitForFunction(
      ({ nextTargetIdx, beforeHP }) => {
        const party = window.__kithlandsTest.gameState("World").party;
        return party[nextTargetIdx].hp > beforeHP;
      },
      { nextTargetIdx: targetIdx, beforeHP: before[targetIdx].hp },
    );

    await addVitalsOverlay(page, `POST BATTLE after Cure on ${targetName}`);
    await page.screenshot({
      path: testInfo.outputPath(`field-magic-post-battle-after-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
