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
  await page.evaluate(async () => {
    const prefs = await import("/src/systems/prefs.js");
    prefs.setWalkSpeed(3);
  });
}

async function state(page) {
  return page.evaluate(() => window.__kithlandsTest.gameState("World"));
}

async function navigation(page) {
  return page.evaluate(() => window.__kithlandsTest.worldNavigationSnapshot());
}

async function proveNaturalRollback(page, nodeID, prompt) {
  const setup = await page.evaluate((targetNodeID) => {
    const bridge = window.__kithlandsTest;
    const origin = bridge.worldNavigationSnapshot();
    const natural = origin.spawns.find(
      (spawn) => spawn.kind === "natural" && spawn.node_id === targetNodeID,
    );
    if (!natural) throw new Error(`Natural spawn not found: ${targetNodeID}`);
    const away = origin.walkable.flatMap((row, y) =>
      row.flatMap((walkable, x) =>
        walkable && (Math.abs(x - natural.x) > 1 || Math.abs(y - natural.y) > 2)
          ? [{ x, y }]
          : [],
      ),
    )[0];
    if (!away) throw new Error("No rollback proof position");
    bridge.setPlayerTile(away.x, away.y, "World");
    return {
      origin: { x: origin.x, y: origin.y },
      cleared: bridge.worldNavigationSnapshot().natural,
    };
  }, nodeID);
  expect(setup.cleared).toBeNull();

  const restored = await page.evaluate(
    ({ origin }) =>
      window.__kithlandsTest.restoreRejectedWorldStep(
        origin,
        "two rejected arrival attempts",
      ),
    setup,
  );
  expect(restored).toMatchObject({
    ...setup.origin,
    natural: { node_id: nodeID },
    door: null,
  });
  expect(restored.prompt).toContain(prompt);
}

async function waitForDiscovery(page, kind, expected, timeout = 15_000) {
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
    { timeout },
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
        if (
          Math.abs(finalTile.x - target.x) > 1 ||
          Math.abs(finalTile.y - target.y) > 2
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
          if (
            Math.abs(start.x - target.x) <= 1 &&
            Math.abs(start.y - target.y) <= 2
          ) {
            continue;
          }
          bridge.setPlayerTile(start.x, start.y, "World");
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

async function walkToWorldNodeByKeyboard(page, nodeID) {
  const route = await page.evaluate(
    async ({ targetNodeID, directions }) => {
      const bridge = window.__kithlandsTest;
      const { planDungeonWaypointPath } =
        await import("/src/scenes/dungeonRoute.js");
      let snapshot = bridge.worldNavigationSnapshot();
      const target = snapshot.spawns.find(
        (spawn) => spawn.node_id === targetNodeID,
      );
      if (!target) throw new Error(`World spawn not found: ${targetNodeID}`);

      const currentNodeID =
        bridge.gameState("World")?.current_location?.world_node_id;
      const currentSpawn = snapshot.spawns.find(
        (spawn) => spawn.node_id === currentNodeID,
      );
      if (!currentSpawn) {
        throw new Error(
          `Current server arrival has no map spawn: ${currentNodeID}`,
        );
      }

      const near = (x, y, spawn, distance) =>
        Math.abs(x - spawn.x) + Math.abs(y - spawn.y) <= distance;
      if (!near(snapshot.x, snapshot.y, currentSpawn, 3)) {
        const starts = [];
        for (let y = 0; y < snapshot.walkable.length; y += 1) {
          for (let x = 0; x < (snapshot.walkable[0]?.length || 0); x += 1) {
            if (!snapshot.walkable[y][x] || !near(x, y, currentSpawn, 3))
              continue;
            starts.push({
              x,
              y,
              distance:
                Math.abs(x - currentSpawn.x) + Math.abs(y - currentSpawn.y),
            });
          }
        }
        starts.sort((a, b) => a.distance - b.distance);
        if (!starts[0]) {
          throw new Error(
            `No walkable tile near current arrival ${currentNodeID}`,
          );
        }
        bridge.setPlayerTile(starts[0].x, starts[0].y, "World");
        snapshot = bridge.worldNavigationSnapshot();
      }

      const points = planDungeonWaypointPath({
        tileData: snapshot.walkable,
        start: { x: snapshot.x, y: snapshot.y },
        target,
        spawns: snapshot.spawns,
        currentNodeID,
        canWalk: (walkable) => walkable === true,
      });
      if (!points) {
        throw new Error(`No walkable route to world node ${targetNodeID}`);
      }

      let previous = { x: snapshot.x, y: snapshot.y };
      const path = points.map((point) => {
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const direction = directions.find(
          (candidate) => candidate.dx === dx && candidate.dy === dy,
        );
        if (!direction) throw new Error(`Invalid route step ${dx},${dy}`);
        previous = point;
        return direction.name;
      });
      return {
        path,
        finalTile: points.at(-1) || { x: snapshot.x, y: snapshot.y },
        target,
      };
    },
    { targetNodeID: nodeID, directions: DIRECTIONS },
  );

  for (const name of route.path) {
    const direction = DIRECTIONS.find((candidate) => candidate.name === name);
    const before = await navigation(page);
    await page.evaluate(
      (directionName) =>
        window.__kithlandsTest.movePlayer(directionName, "World"),
      direction.name,
    );
    await page.waitForFunction(
      ({ x, y, dx, dy }) => {
        const snapshot = window.__kithlandsTest.worldNavigationSnapshot();
        return (
          !snapshot.animating && snapshot.x === x + dx && snapshot.y === y + dy
        );
      },
      { x: before.x, y: before.y, dx: direction.dx, dy: direction.dy },
    );
  }
  return route;
}

async function walkToNaturalByKeyboard(page, nodeID) {
  const waypoints = await page.evaluate((targetNodeID) => {
    const gameState = window.__kithlandsTest.gameState("World");
    const entries = gameState?.dungeon_entries || [];
    for (const entry of entries) {
      const index = (entry.route_node_ids || []).indexOf(targetNodeID);
      if (index >= 0) return entry.route_node_ids.slice(0, index + 1);
    }
    const spawnIDs = new Set(
      window.__kithlandsTest
        .worldNavigationSnapshot()
        .spawns.map((spawn) => spawn.node_id),
    );
    if (targetNodeID === "wilderness_1" && spawnIDs.has("inn")) {
      return ["inn", targetNodeID];
    }
    return [targetNodeID];
  }, nodeID);

  let result;
  for (const waypoint of waypoints) {
    result = await walkToWorldNodeByKeyboard(page, waypoint);
    if (waypoint === nodeID) {
      await expect
        .poll(async () => (await state(page)).current_location?.world_node_id)
        .toBe(waypoint);
    }
  }
  return result;
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

async function expectDialogue(page, title, timeout = 15_000) {
  await page.waitForFunction(
    (expectedTitle) => {
      const bridge = window.__kithlandsTest;
      const text = bridge.visibleTexts("World").map((entry) => entry.text);
      const message = bridge.gameState("World")?.message;
      return (
        bridge.sceneFlags("World").modalLocks.includes("dialogue") &&
        text.includes(expectedTitle) &&
        !!message &&
        text.includes(message)
      );
    },
    title,
    { timeout },
  );
  const current = await state(page);
  expect(current.message).not.toBe("");
  return current;
}

async function closeDialogueWithKeyboard(page) {
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const flags = window.__kithlandsTest.sceneFlags("World");
    return (
      !flags.modalLocks.includes("dialogue") &&
      !flags.naturalInteractionActive &&
      !flags.animating
    );
  });
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
  const alreadyActive = await page.evaluate(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "A"),
  );
  if (alreadyActive) return;
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

async function approachWithKeyboard(page, approach, nodeID) {
  await page.keyboard.press(approach.direction.key);
  await waitForApproach(page, approach, nodeID);
}

async function tapAction(page) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  await tapLogicalPoint(page, layout.action.x, layout.action.y);
}

async function pressWorldAction(page) {
  await page.waitForFunction(() => {
    const flags = window.__kithlandsTest.sceneFlags("World");
    return (
      !flags.naturalInteractionActive &&
      !flags.animating &&
      flags.modalLocks.length === 0
    );
  });
  return page.evaluate(() => window.__kithlandsTest.beginWorldAction());
}

async function tapActionUntilDiscovery(page, kind, expected) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tapAction(page);
    try {
      return await waitForDiscovery(page, kind, expected, 5_000);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function closeDialogueWithTouch(page) {
  const before = await navigation(page);
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  await tapLogicalPoint(page, 400, layout.playfieldBottom - 160);
  await page.waitForFunction(() => {
    const flags = window.__kithlandsTest.sceneFlags("World");
    return (
      !flags.modalLocks.includes("dialogue") &&
      !flags.naturalInteractionActive &&
      !flags.animating
    );
  });
  const after = await navigation(page);
  expect([after.x, after.y]).toEqual([before.x, before.y]);
  expect(after.natural?.node_id).toBe(before.natural?.node_id);
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
  test.setTimeout(360_000);
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
  const initialHiddenQuests = initial.quests.filter(
    (quest) => quest.hidden === true,
  );
  expect(initialHiddenQuests.length).toBeGreaterThan(0);
  for (const hiddenQuest of initialHiddenQuests) {
    expect(hiddenQuest).toEqual({ hidden: true });
  }
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
  await walkToNaturalByKeyboard(page, nodeID);
  await expect
    .poll(async () => (await state(page)).current_location?.world_node_id)
    .toBe(nodeID);
  const keyboardApproach = await placeOneStepOutsideNaturalRange(page, nodeID);
  await approachWithKeyboard(page, keyboardApproach, nodeID);
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
    {
      type: "natural_discovery",
      node_id: nodeID,
    },
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
  await proveNaturalRollback(
    page,
    nodeID,
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
  await walkToNaturalByKeyboard(page, nodeID);
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
  await tapActionUntilDiscovery(page, "supply_cache", {
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

  const beforeNoCoin = await state(page);
  expect(keyItemIDs(beforeNoCoin)).not.toContain("strange_coin");
  const hiddenCountBeforeCoin = beforeNoCoin.quests.filter(
    (quest) => quest.hidden,
  ).length;
  expect(hiddenCountBeforeCoin).toBeGreaterThan(0);
  await pressWorldAction(page);
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
  expect(withoutCoin.quests.filter((quest) => quest.hidden)).toHaveLength(
    hiddenCountBeforeCoin,
  );
  await closeDialogueWithTouch(page);
  await expectPrompt(
    page,
    "[ TAP A ]",
    discovery(withoutCoin, "hidden_passage").prompt,
  );

  const withCoin = await page.evaluate(() =>
    window.__kithlandsTest.debugGiveItem("strange_coin", 1, "World"),
  );
  expect(keyItemIDs(withCoin)).toContain("strange_coin");
  await pressWorldAction(page);
  await waitForDiscovery(page, "hidden_passage", {
    discovery_id: "strange_coin_passage",
    claimed: true,
    revealed: true,
  });
  const passage = discovery(await state(page), "hidden_passage");
  const afterPassage = await expectDialogue(page, passage.title);
  expect(keyItemIDs(afterPassage)).not.toContain("strange_coin");
  expect(keyItemIDs(afterPassage)).toContain("ancient_ring");
  expect(afterPassage.quests.filter((quest) => quest.hidden)).toHaveLength(
    hiddenCountBeforeCoin - 1,
  );
  expect(
    afterPassage.quests.some(
      (quest) =>
        !quest.hidden &&
        quest.name &&
        afterPassage.message.includes(quest.name),
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(
      PROOF_DIR,
      `natural-node-phone-390x844-hidden-quest-reveal-${RUN_ID}.png`,
    ),
    fullPage: true,
  });
  await closeDialogueWithTouch(page);
  await expectPrompt(page, "[ TAP A ]", "Explore");

  const beforeReplay = persistentRewardState(await state(page));
  await pressWorldAction(page);
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

  await walkToNaturalByKeyboard(page, nodeID);
  const replayAfterLoad = await page.evaluate(async (targetNodeID) => {
    const gameState = window.__kithlandsTest.gameState("World");
    const { gameAction } = await import("/src/api.js");
    return gameAction(gameState.id, {
      type: "natural_discovery",
      node_id: targetNodeID,
    });
  }, nodeID);
  expect(replayAfterLoad.message).toMatch(/stands open and silent/i);
  expect(persistentRewardState(replayAfterLoad)).toEqual(beforeReplay);
  expect(naturalActions).toHaveLength(6);
  expect(pageErrors).toEqual([]);
});
