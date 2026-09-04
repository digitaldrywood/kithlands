import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const PROOF_DIR = path.resolve(
  "tmp",
  "natural-node-discoveries",
  `proof-${RUN_ID}`,
);

mkdirSync(PROOF_DIR, { recursive: true });
test.use({ hasTouch: true });

const DIRECTIONS = [
  { name: "up", key: "ArrowUp", dx: 0, dy: -1 },
  { name: "down", key: "ArrowDown", dx: 0, dy: 1 },
  { name: "left", key: "ArrowLeft", dx: -1, dy: 0 },
  { name: "right", key: "ArrowRight", dx: 1, dy: 0 },
];

const GAME_FIXTURE = {
  town_name: "Natural Proof",
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
  ],
  difficulty: "normal",
  rng_seed: 17,
};

function discovery(state, kind) {
  return (state?.natural_discoveries || []).find(
    (entry) => entry.kind === kind,
  );
}

function keyItemIDs(state) {
  return (state?.key_items || []).map((item) => item.id).sort();
}

function persistentRewardState(state) {
  return {
    gold: state.gold,
    potions: state.potions,
    items: state.items,
    keyItems: state.key_items,
    quests: state.quests,
    naturalDiscoveries: state.natural_discoveries,
  };
}

async function startAuthenticatedCustomGame(page) {
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startQuickGame(email),
    `natural-discoveries-${RUN_ID}@kithlands.dev`,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  const customState = await page.evaluate(
    (gameData) => window.__kithlandsTest.startCustomGame(gameData),
    GAME_FIXTURE,
  );
  expect(customState.location).toBe(GAME_FIXTURE.town_name);
  expect(customState.party.map((member) => member.name)).toEqual(
    GAME_FIXTURE.party.map((member) => member.name),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  await page.evaluate(() => {
    window.__kithlandsTest.setNoEncounters(true);
    return window.__kithlandsTest.waitForSceneReady("World");
  });
}

async function state(page) {
  return page.evaluate(() => window.__kithlandsTest.gameState("World"));
}

async function navigation(page) {
  return page.evaluate(() => window.__kithlandsTest.worldNavigationSnapshot());
}

async function waitForDiscovery(page, kind, expected) {
  await page.waitForFunction(
    ({ targetKind, target }) => {
      const entry = (
        window.__kithlandsTest.gameState("World")?.natural_discoveries || []
      ).find((candidate) => candidate.kind === targetKind);
      return (
        entry &&
        Object.entries(target).every(([key, value]) => entry[key] === value)
      );
    },
    { targetKind: kind, target: expected },
  );
  return discovery(await state(page), kind);
}

async function placeOneStepOutsideNaturalRange(page, nodeID) {
  const approach = await page.evaluate(
    ({ targetNodeID, directions }) => {
      const bridge = window.__kithlandsTest;
      const original = bridge.worldNavigationSnapshot();
      const target = original.spawns.find(
        (spawn) => spawn.kind === "natural" && spawn.node_id === targetNodeID,
      );
      if (!target) throw new Error(`Natural spawn not found: ${targetNodeID}`);

      const height = original.walkable.length;
      const width = original.walkable[0]?.length || 0;
      const candidates = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!original.walkable[y][x]) continue;
          candidates.push({
            x,
            y,
            distance: Math.abs(x - target.x) + Math.abs(y - target.y),
          });
        }
      }
      candidates.sort((a, b) => a.distance - b.distance);

      for (const finalTile of candidates) {
        bridge.setPlayerTile(finalTile.x, finalTile.y, "World");
        if (
          bridge.worldNavigationSnapshot().natural?.node_id !== targetNodeID
        ) {
          continue;
        }

        for (const direction of directions) {
          const start = {
            x: finalTile.x - direction.dx,
            y: finalTile.y - direction.dy,
          };
          if (
            start.x < 0 ||
            start.x >= width ||
            start.y < 0 ||
            start.y >= height ||
            !original.walkable[start.y][start.x]
          ) {
            continue;
          }
          bridge.setPlayerTile(start.x, start.y, "World");
          if (
            bridge.worldNavigationSnapshot().natural?.node_id === targetNodeID
          ) {
            continue;
          }
          bridge.centerCameraOnPlayer("World");
          return { start, finalTile, direction, target };
        }
      }

      bridge.setPlayerTile(original.x, original.y, "World");
      throw new Error(
        `No one-step walkable approach found for natural node ${targetNodeID}`,
      );
    },
    { targetNodeID: nodeID, directions: DIRECTIONS },
  );
  expect(approach).toBeTruthy();
  return approach;
}

async function waitForApproach(page, approach, nodeID) {
  await page.waitForFunction(
    ({ finalTile, targetNodeID }) => {
      const snapshot = window.__kithlandsTest.worldNavigationSnapshot();
      return (
        snapshot.x === finalTile.x &&
        snapshot.y === finalTile.y &&
        !snapshot.animating &&
        snapshot.natural?.node_id === targetNodeID
      );
    },
    { finalTile: approach.finalTile, targetNodeID: nodeID },
  );
}

function walkableDirection(snapshot) {
  return DIRECTIONS.find(({ dx, dy }) => {
    const x = snapshot.x + dx;
    const y = snapshot.y + dy;
    return snapshot.walkable[y]?.[x] === true;
  });
}

async function moveOneStepWithKeyboard(page) {
  const before = await navigation(page);
  const direction = walkableDirection(before);
  expect(direction).toBeTruthy();
  await page.keyboard.press(direction.key);
  await page.waitForFunction(
    ({ x, y }) => {
      const snapshot = window.__kithlandsTest.worldNavigationSnapshot();
      return !snapshot.animating && (snapshot.x !== x || snapshot.y !== y);
    },
    { x: before.x, y: before.y },
  );
  return navigation(page);
}

async function expectPrompt(page, prefix, prompt) {
  await expect
    .poll(async () => {
      const texts = await page.evaluate(() =>
        window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
      );
      return texts.find((text) => text.startsWith(prefix)) || "";
    })
    .toContain(prompt);
}

async function expectDialogue(page, title) {
  await page.waitForFunction((expectedTitle) => {
    const bridge = window.__kithlandsTest;
    const text = bridge.visibleTexts("World").map((entry) => entry.text);
    const message = bridge.gameState("World")?.message;
    return (
      bridge.sceneFlags("World").modalLocks.includes("dialogue") &&
      text.includes(expectedTitle) &&
      !!message &&
      text.includes(message)
    );
  }, title);
  const current = await state(page);
  expect(current.message).not.toBe("");
  return current;
}

async function closeDialogueWithKeyboard(page) {
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      !window.__kithlandsTest
        .sceneFlags("World")
        .modalLocks.includes("dialogue"),
  );
}

async function tapLogicalPoint(page, x, y) {
  const canvas = page.locator("canvas");
  const [box, size] = await Promise.all([
    canvas.boundingBox(),
    page.evaluate(() => window.__kithlandsTest.logicalGameSize("World")),
  ]);
  if (!box) throw new Error("Game canvas is missing");
  await page.touchscreen.tap(
    box.x + (x / size.width) * box.width,
    box.y + (y / size.height) * box.height,
  );
}

async function activateTouchControls(page) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  // The first touch only reveals the touch HUD. It must not leak through as
  // movement or an interaction.
  await tapLogicalPoint(page, layout.action.x, layout.action.y);
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "A"),
  );
}

function dpadPoint(layout, direction) {
  if (direction === "up")
    return { x: layout.dpad.x, y: layout.dpad.y - layout.dpad.offset };
  if (direction === "down")
    return { x: layout.dpad.x, y: layout.dpad.y + layout.dpad.offset };
  if (direction === "left")
    return { x: layout.dpad.x - layout.dpad.offset, y: layout.dpad.y };
  return { x: layout.dpad.x + layout.dpad.offset, y: layout.dpad.y };
}

async function approachWithTouch(page, approach, nodeID) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  const point = dpadPoint(layout, approach.direction.name);
  await tapLogicalPoint(page, point.x, point.y);
  await waitForApproach(page, approach, nodeID);
}

async function tapAction(page) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  await tapLogicalPoint(page, layout.action.x, layout.action.y);
}

async function closeDialogueWithTouch(page) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  await tapLogicalPoint(page, 400, layout.playfieldBottom - 160);
  await page.waitForFunction(
    () =>
      !window.__kithlandsTest
        .sceneFlags("World")
        .modalLocks.includes("dialogue"),
  );
}

async function newestAutosave(page) {
  await expect
    .poll(async () => {
      const result = await page.evaluate(() =>
        window.__kithlandsTest.listSaves(),
      );
      return (result.saves || []).filter(
        (entry) => entry.save_type === "autosave",
      ).length;
    })
    .toBeGreaterThan(0);
  const result = await page.evaluate(() => window.__kithlandsTest.listSaves());
  return result.saves.find((entry) => entry.save_type === "autosave");
}

test("natural landmarks deliver one-shot discoveries across keyboard, touch, and reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const pageErrors = [];
  const naturalActions = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (!/\/api\/game\/[^/]+\/action$/.test(new URL(request.url()).pathname))
      return;
    const body = request.postDataJSON();
    if (body?.type === "natural_discovery") naturalActions.push(body);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await startAuthenticatedCustomGame(page);

  const initial = await state(page);
  expect(initial.natural_discoveries).toHaveLength(3);
  expect(initial.quests.some((quest) => quest.hidden === true)).toBe(true);
  expect(initial.natural_discoveries.map((entry) => entry.kind).sort()).toEqual(
    ["clue", "hidden_passage", "supply_cache"],
  );
  for (const entry of initial.natural_discoveries) {
    expect(entry).toEqual(
      expect.objectContaining({
        node_id: expect.any(String),
        discovery_id: expect.any(String),
        title: expect.any(String),
        prompt: expect.any(String),
        claimed: false,
        revealed: false,
      }),
    );
  }
  const nodeID = initial.natural_discoveries[0].node_id;
  expect(
    initial.natural_discoveries.every((entry) => entry.node_id === nodeID),
  ).toBe(true);

  const clue = discovery(initial, "clue");
  const keyboardApproach = await placeOneStepOutsideNaturalRange(page, nodeID);
  await page.keyboard.press(keyboardApproach.direction.key);
  await waitForApproach(page, keyboardApproach, nodeID);
  await expectPrompt(page, "[ ENTER ]", clue.prompt);
  const leaderBeforeSpace = (await navigation(page)).x;
  const discoveriesBeforeSpace = (await state(page)).natural_discoveries;
  await page.keyboard.press("Space");
  expect((await navigation(page)).x).toBe(leaderBeforeSpace);
  expect((await state(page)).natural_discoveries).toEqual(
    discoveriesBeforeSpace,
  );
  expect(naturalActions).toHaveLength(0);
  await page.screenshot({
    path: path.join(
      PROOF_DIR,
      `natural-node-desktop-1440x900-keyboard-prompt-${RUN_ID}.png`,
    ),
    fullPage: true,
  });

  await page.keyboard.press("Enter");
  await waitForDiscovery(page, "clue", { claimed: true, revealed: true });
  const afterClue = await expectDialogue(page, clue.title);
  expect(naturalActions).toEqual([
    { type: "natural_discovery", node_id: nodeID },
  ]);
  await page.screenshot({
    path: path.join(
      PROOF_DIR,
      `natural-node-desktop-1440x900-clue-dialogue-${RUN_ID}.png`,
    ),
    fullPage: true,
  });
  await closeDialogueWithKeyboard(page);
  await expectPrompt(
    page,
    "[ ENTER ]",
    discovery(afterClue, "supply_cache").prompt,
  );
  const afterKeyboardDialogueMove = await moveOneStepWithKeyboard(page);
  expect([
    afterKeyboardDialogueMove.x,
    afterKeyboardDialogueMove.y,
  ]).not.toEqual([keyboardApproach.finalTile.x, keyboardApproach.finalTile.y]);

  const autosave = await newestAutosave(page);
  expect(autosave).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    (saveID) => window.__kithlandsTest.loadSave(saveID),
    autosave.id,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  expect(discovery(await state(page), "clue")).toMatchObject({
    claimed: true,
    revealed: true,
  });

  await page.waitForFunction(
    () =>
      window.__kithlandsTest.gameplayViewportSnapshot("World")?.portrait ===
      true,
  );
  const touchApproach = await placeOneStepOutsideNaturalRange(page, nodeID);
  await activateTouchControls(page);
  await approachWithTouch(page, touchApproach, nodeID);
  const cache = discovery(await state(page), "supply_cache");
  await expectPrompt(page, "[ TAP A ]", cache.prompt);
  await page.screenshot({
    path: path.join(
      PROOF_DIR,
      `natural-node-phone-390x844-touch-prompt-${RUN_ID}.png`,
    ),
    fullPage: true,
  });

  const beforeCache = await state(page);
  await tapAction(page);
  await waitForDiscovery(page, "supply_cache", {
    claimed: true,
    revealed: true,
  });
  const afterCache = await expectDialogue(page, cache.title);
  expect(afterCache.potions).toBe(beforeCache.potions + 2);
  expect(afterCache.gold).toBe(beforeCache.gold + 40);
  expect(afterCache.items.find((item) => item.id === "potion")?.count).toBe(
    beforeCache.items.find((item) => item.id === "potion")?.count + 2,
  );
  expect(naturalActions).toHaveLength(2);
  await closeDialogueWithTouch(page);
  await expectPrompt(
    page,
    "[ TAP A ]",
    discovery(afterCache, "hidden_passage").prompt,
  );
  const passageApproach = await placeOneStepOutsideNaturalRange(page, nodeID);
  await approachWithTouch(page, passageApproach, nodeID);
  await expectPrompt(
    page,
    "[ TAP A ]",
    discovery(afterCache, "hidden_passage").prompt,
  );

  const beforeNoCoin = await state(page);
  expect(keyItemIDs(beforeNoCoin)).not.toContain("strange_coin");
  const hiddenIDsBeforeCoin = beforeNoCoin.quests
    .filter((quest) => quest.hidden)
    .map((quest) => quest.id);
  expect(hiddenIDsBeforeCoin.length).toBeGreaterThan(0);
  await tapAction(page);
  await waitForDiscovery(page, "hidden_passage", {
    discovery_id: "strange_coin_passage",
    claimed: false,
    revealed: true,
  });
  const withoutCoin = await expectDialogue(
    page,
    discovery(beforeNoCoin, "hidden_passage").title,
  );
  expect(withoutCoin.message).toMatch(/coin-shaped hollow/i);
  expect(keyItemIDs(withoutCoin)).not.toContain("ancient_ring");
  expect(withoutCoin.gold).toBe(beforeNoCoin.gold);
  expect(withoutCoin.potions).toBe(beforeNoCoin.potions);
  expect(withoutCoin.items).toEqual(beforeNoCoin.items);
  const hiddenBeforeCoin = withoutCoin.quests.filter((quest) => quest.hidden);
  expect(hiddenBeforeCoin.map((quest) => quest.id)).toEqual(
    hiddenIDsBeforeCoin,
  );
  await closeDialogueWithTouch(page);

  const withCoin = await page.evaluate(() =>
    window.__kithlandsTest.debugGiveItem("strange_coin", 1, "World"),
  );
  expect(keyItemIDs(withCoin)).toContain("strange_coin");
  await tapAction(page);
  await waitForDiscovery(page, "hidden_passage", {
    discovery_id: "strange_coin_passage",
    claimed: true,
    revealed: true,
  });
  const passage = discovery(await state(page), "hidden_passage");
  const afterPassage = await expectDialogue(page, passage.title);
  expect(keyItemIDs(afterPassage)).not.toContain("strange_coin");
  expect(keyItemIDs(afterPassage)).toContain("ancient_ring");
  const revealedQuest = hiddenBeforeCoin.find((hiddenQuest) =>
    afterPassage.quests.some(
      (quest) => quest.id === hiddenQuest.id && !quest.hidden,
    ),
  );
  expect(revealedQuest).toBeTruthy();
  await page.screenshot({
    path: path.join(
      PROOF_DIR,
      `natural-node-phone-390x844-hidden-quest-reveal-${RUN_ID}.png`,
    ),
    fullPage: true,
  });
  await closeDialogueWithTouch(page);

  const beforeReplay = persistentRewardState(await state(page));
  await tapAction(page);
  const replay = await expectDialogue(page, passage.title);
  expect(persistentRewardState(replay)).toEqual(beforeReplay);
  await closeDialogueWithTouch(page);
  expect(naturalActions).toHaveLength(5);

  const saveName = `Natural discoveries proof ${RUN_ID}`;
  expect(
    await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name, "World"),
      saveName,
    ),
  ).toMatchObject({ status: "saved" });
  const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
  const manualSave = saves.saves.find((entry) => entry.name === saveName);
  expect(manualSave).toBeTruthy();
  await page.evaluate(
    (saveID) => window.__kithlandsTest.loadSave(saveID),
    manualSave.id,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  const reloaded = await state(page);
  expect(persistentRewardState(reloaded)).toEqual(beforeReplay);

  const replayApproach = await placeOneStepOutsideNaturalRange(page, nodeID);
  await activateTouchControls(page);
  await approachWithTouch(page, replayApproach, nodeID);
  await tapAction(page);
  const replayAfterLoad = await expectDialogue(page, passage.title);
  expect(persistentRewardState(replayAfterLoad)).toEqual(beforeReplay);
  await closeDialogueWithTouch(page);
  expect(naturalActions).toHaveLength(6);
  expect(pageErrors).toEqual([]);
});
