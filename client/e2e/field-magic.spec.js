import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
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

async function addVitalsOverlay(page, label) {
  await page.evaluate((overlayLabel) => {
    const existing = document.getElementById("field-magic-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "field-magic-proof";
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

test.describe("field magic flow", () => {
  test("casts Cure from MAGIC menu and character detail with visual proof", async ({
    page,
  }) => {
    await startQuickAuth(page);
    await startMenderGame(page);
    const initialParty = await worldParty(page);
    await setFieldMagicVitals(page, [
      { slot: 0, hp: Math.max(1, initialParty[0].max_hp - 2) },
      { slot: 1, hp: Math.max(1, initialParty[1].max_hp - 5) },
    ]);

    const beforeMenu = await worldParty(page);
    const menuTargetIdx =
      beforeMenu[1].hp < beforeMenu[1].max_hp
        ? 1
        : beforeMenu.findIndex((member) => member.hp < member.max_hp);
    expect(menuTargetIdx).toBeGreaterThanOrEqual(0);
    const menuTargetName = beforeMenu[menuTargetIdx].name;

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("MAGIC", "World"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("Mira")),
    );
    await addVitalsOverlay(
      page,
      `BEFORE: MAGIC menu Cure on ${menuTargetName}`,
    );
    await page.screenshot({
      path: `tmp/issue-175-magic-menu-before-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Mira", "World"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("Cure")),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Cure", "World"),
    );
    await page.waitForFunction(
      ({ targetName }) =>
        window.__kithlandsTest
          .visibleTexts("World")
          .some((entry) => entry.text.includes(targetName)),
      { targetName: menuTargetName },
    );
    await page.evaluate(
      ({ targetName }) =>
        window.__kithlandsTest.clickInteractiveText(targetName, "World"),
      { targetName: menuTargetName },
    );
    await page.waitForFunction(
      ({ targetIdx, beforeHP }) => {
        const party = window.__kithlandsTest.gameState("World").party;
        return (
          party[targetIdx].hp > beforeHP &&
          window.__kithlandsTest.sceneFlags("World").menuOpen
        );
      },
      { targetIdx: menuTargetIdx, beforeHP: beforeMenu[menuTargetIdx].hp },
    );
    await addVitalsOverlay(page, `AFTER: MAGIC menu Cure on ${menuTargetName}`);
    await page.screenshot({
      path: `tmp/issue-175-magic-menu-after-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CLOSE (M/ESC)", "World"),
    );
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("World").menuOpen,
    );

    let beforeDetail = await worldParty(page);
    if (!beforeDetail.some((member) => member.hp < member.max_hp)) {
      await setFieldMagicVitals(page, [
        { slot: 0, hp: Math.max(1, beforeDetail[0].max_hp - 3) },
      ]);
      beforeDetail = await worldParty(page);
    }
    const detailTargetIdx = beforeDetail.findIndex(
      (member) => member.hp < member.max_hp,
    );
    expect(detailTargetIdx).toBeGreaterThanOrEqual(0);
    const detailTargetName = beforeDetail[detailTargetIdx].name;

    await page.evaluate(() =>
      window.__kithlandsTest.openCharacterDetail(0, "World"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
    await addVitalsOverlay(
      page,
      `BEFORE: character detail Cure on ${detailTargetName}`,
    );
    await page.screenshot({
      path: `tmp/issue-175-character-detail-before-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Cure", "World"),
    );
    await page.waitForFunction(
      ({ targetName }) =>
        window.__kithlandsTest
          .visibleTexts("World")
          .some((entry) => entry.text.includes(targetName)),
      { targetName: detailTargetName },
    );
    await page.evaluate(
      ({ targetName }) =>
        window.__kithlandsTest.clickInteractiveText(targetName, "World"),
      { targetName: detailTargetName },
    );
    await page.waitForFunction(
      ({ targetIdx, beforeHP }) => {
        const party = window.__kithlandsTest.gameState("World").party;
        return (
          party[targetIdx].hp > beforeHP &&
          window.__kithlandsTest.sceneFlags("World").characterDetailOpen
        );
      },
      {
        targetIdx: detailTargetIdx,
        beforeHP: beforeDetail[detailTargetIdx].hp,
      },
    );
    await addVitalsOverlay(
      page,
      `AFTER: character detail Cure on ${detailTargetName}`,
    );
    await page.screenshot({
      path: `tmp/issue-175-character-detail-after-${RUN_ID}.png`,
      fullPage: true,
    });
  });
});
