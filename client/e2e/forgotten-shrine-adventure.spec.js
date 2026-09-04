import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

const runID = Date.now();
const proofDir = path.resolve(`tmp/forgotten-shrine-${runID}`);
mkdirSync(proofDir, { recursive: true });

const viewports = [
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 390, height: 844 },
];

async function state(page, sceneKey) {
  return page.evaluate(
    (key) => window.__kithlandsTest.gameState(key),
    sceneKey,
  );
}

async function capture(page, viewport, label) {
  await page.screenshot({
    path: path.join(
      proofDir,
      `${viewport.width}x${viewport.height}-${label}.png`,
    ),
    fullPage: true,
  });
}

async function enableSlowTouchWalking(page) {
  await page.evaluate(async () => {
    const { setWalkSpeed } = await import("/src/systems/prefs.js");
    setWalkSpeed(1);
  });
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw new Error("Game canvas is not visible");
  await page.touchscreen.tap(canvas.x + 4, canvas.y + 4);
}

async function walkWithHeldDpad(page, direction, steps) {
  const start = await page.evaluate(() => ({
    nav: window.__kithlandsTest.worldNavigationSnapshot(),
    layout: window.__kithlandsTest.gameplayViewportSnapshot("World"),
  }));
  const deltas = {
    up: { dx: 0, dy: -1, buttonX: 0, buttonY: -1 },
    down: { dx: 0, dy: 1, buttonX: 0, buttonY: 1 },
    left: { dx: -1, dy: 0, buttonX: -1, buttonY: 0 },
    right: { dx: 1, dy: 0, buttonX: 1, buttonY: 0 },
  };
  const delta = deltas[direction];
  const target = {
    x: start.nav.x + delta.dx * steps,
    y: start.nav.y + delta.dy * steps,
  };
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw new Error("Game canvas is not visible");
  const dpad = start.layout.dpad;
  const logicalX = dpad.x + delta.buttonX * dpad.offset;
  const logicalY = dpad.y + delta.buttonY * dpad.offset;
  await page.mouse.move(
    canvas.x + (logicalX / start.layout.width) * canvas.width,
    canvas.y + (logicalY / start.layout.height) * canvas.height,
  );
  await page.mouse.down();
  try {
    await page.waitForFunction((destination) => {
      const nav = window.__kithlandsTest.worldNavigationSnapshot();
      return nav.x === destination.x && nav.y === destination.y;
    }, target);
  } finally {
    await page.mouse.up();
  }
  await page.waitForFunction(
    () => !window.__kithlandsTest.worldNavigationSnapshot().animating,
  );
}

async function holdSafeWorldSteps(page, requestedSteps = 3) {
  const run = await page.evaluate((maxSteps) => {
    const nav = window.__kithlandsTest.worldNavigationSnapshot();
    const state = window.__kithlandsTest.gameState("World");
    const currentNodeID = state.current_location?.world_node_id;
    const directions = [
      { name: "up", dx: 0, dy: -1 },
      { name: "right", dx: 1, dy: 0 },
      { name: "down", dx: 0, dy: 1 },
      { name: "left", dx: -1, dy: 0 },
    ];
    for (const direction of directions) {
      for (let steps = maxSteps; steps >= 2; steps -= 1) {
        const points = Array.from({ length: steps }, (_, index) => ({
          x: nav.x + direction.dx * (index + 1),
          y: nav.y + direction.dy * (index + 1),
        }));
        if (
          points.every(
            (point) =>
              nav.walkable[point.y]?.[point.x] &&
              nav.spawns
                .filter((spawn) => spawn.node_id !== currentNodeID)
                .every(
                  (spawn) =>
                    Math.abs(point.x - spawn.x) + Math.abs(point.y - spawn.y) >
                    3,
                ),
          )
        ) {
          return { direction: direction.name, steps };
        }
      }
    }
    throw new Error("No safe straight held-input path near the world spawn");
  }, requestedSteps);
  await walkWithHeldDpad(page, run.direction, run.steps);
}

async function waitForRoom(page, roomID) {
  await page.waitForFunction(
    (id) =>
      window.__kithlandsTest.activeSceneKey() === "Dungeon" &&
      window.__kithlandsTest.gameState("Dungeon")?.dungeon?.room_id === id,
    roomID,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.waitForSceneReady("Dungeon"),
  );
}

async function tapAction(page, actionID) {
  const dungeon = (await state(page, "Dungeon")).dungeon;
  const action = dungeon.actions.find((candidate) => candidate.id === actionID);
  expect(action, `action ${actionID} in ${dungeon.room_id}`).toBeTruthy();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const texts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Dungeon"),
    );
    if (
      texts.some(
        (entry) =>
          entry.text === action.label || entry.text === `✓ ${action.label}`,
      )
    ) {
      await page.evaluate(
        (label) =>
          window.__kithlandsTest.clickInteractiveText(label, "Dungeon"),
        action.label,
      );
      return;
    }
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("More", "Dungeon"),
    );
  }

  throw new Error(`No visible dungeon control for ${actionID}`);
}

async function act(page, actionID) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/dungeon") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action_id === actionID,
  );
  await tapAction(page, actionID);
  const result = await (await responsePromise).json();
  expect(result.error, `action ${actionID}`).toBeUndefined();

  const destination =
    result.phase === "combat"
      ? "Battle"
      : result.current_location?.kind === "dungeon"
        ? "Dungeon"
        : result.current_location?.kind === "settlement"
          ? "Settlement"
          : "World";
  await page.waitForFunction(
    (sceneKey) => window.__kithlandsTest.activeSceneKey() === sceneKey,
    destination,
  );
  if (destination !== "Battle") {
    await page.evaluate(
      (sceneKey) => window.__kithlandsTest.waitForSceneReady(sceneKey),
      destination,
    );
  }
  return result;
}

async function dungeonEntry(page, dungeonID) {
  return page.evaluate((id) => {
    const gameState = window.__kithlandsTest.gameState("World");
    const entry = gameState.dungeon_entries.find(
      (candidate) => candidate.id === id,
    );
    if (!entry) throw new Error(`Missing dungeon entry ${id}`);
    return entry;
  }, dungeonID);
}

async function clickVisibleDungeonPath(page, dungeonID) {
  const entry = await dungeonEntry(page, dungeonID);
  const label = `Follow path to ${entry.title}`;
  await page.waitForFunction(
    (text) =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((candidate) => candidate.interactive && candidate.text === text),
    label,
  );
  await page.evaluate(
    (text) => window.__kithlandsTest.clickInteractiveText(text, "World"),
    label,
  );
  return entry;
}

async function waitForVisibleDungeonEntry(page, entry) {
  await page.waitForFunction(
    ({ nodeID, label }) => {
      const state = window.__kithlandsTest.gameState("World");
      return (
        state.current_location?.world_node_id === nodeID &&
        window.__kithlandsTest
          .visibleTexts("World")
          .some(
            (candidate) => candidate.interactive && candidate.text === label,
          )
      );
    },
    { nodeID: entry.node_id, label: entry.label },
    { timeout: 120_000 },
  );
  await page.evaluate(() =>
    window.__kithlandsTest.centerCameraOnPlayer("World"),
  );
}

async function followVisibleDungeonPath(page, dungeonID) {
  const entry = await clickVisibleDungeonPath(page, dungeonID);
  await waitForVisibleDungeonEntry(page, entry);
  return entry;
}

async function enterDungeon(page, dungeonID) {
  const entry = await dungeonEntry(page, dungeonID);
  const atEntry = await page.evaluate(
    ({ nodeID, label }) => {
      const state = window.__kithlandsTest.gameState("World");
      return (
        state.current_location?.world_node_id === nodeID &&
        window.__kithlandsTest
          .visibleTexts("World")
          .some(
            (candidate) => candidate.interactive && candidate.text === label,
          )
      );
    },
    { nodeID: entry.node_id, label: entry.label },
  );
  if (!atEntry) await followVisibleDungeonPath(page, dungeonID);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/dungeon") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === "enter",
  );
  await page.evaluate(
    (label) => window.__kithlandsTest.clickInteractiveText(label, "World"),
    entry.label,
  );
  const result = await (await responsePromise).json();
  expect(result.error).toBeUndefined();
  expect(result.active_dungeon_id).toBe(dungeonID);
  await waitForRoom(page, result.dungeon.room_id);
  return result;
}

async function continueVictory(page) {
  await page.evaluate(() => window.__kithlandsTest.pressKey("Space", "Battle"));
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Battle")
      .some((entry) => entry.interactive && entry.text.trim() === "Continue"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Continue", "Battle"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.waitForSceneReady("Dungeon"),
  );
}

async function clearRoutineEncounter(page, actionID) {
  const encounter = await act(page, actionID);
  expect(encounter.phase).toBe("combat");
  const victory = await page.evaluate(() =>
    window.__kithlandsTest.forceVictory("Battle"),
  );
  expect(victory.phase).not.toBe("combat");
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Battle")
      .some((entry) => entry.text === "VICTORY!"),
  );
  await continueVictory(page);
  expect(
    (await state(page, "Dungeon")).dungeon.actions.find(
      (candidate) => candidate.id === actionID,
    )?.completed,
    `completed encounter ${actionID}`,
  ).toBe(true);
}

async function saveAndRestoreChapel(page, viewport) {
  const saveName = `Forgotten Shrine proof ${runID}`;
  await page.evaluate(
    (name) => window.__kithlandsTest.saveGame(name, "Dungeon"),
    saveName,
  );
  const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
  const saved = saves.saves.find((candidate) => candidate.name === saveName);
  expect(saved).toBeTruthy();

  await act(page, "chapel-return");
  await waitForRoom(page, "echoing-nave");
  await act(page, "nave-archive");
  await waitForRoom(page, "moonwater-archive");
  await page.evaluate(
    (saveID) => window.__kithlandsTest.loadSave(saveID),
    saved.id,
  );
  await waitForRoom(page, "resonant-chapel");

  const restored = await state(page, "Dungeon");
  expect(restored.active_dungeon_id).toBe("forgotten-shrine");
  expect(
    restored.dungeon.actions.find(
      (candidate) => candidate.id === "bell-tuning-lever",
    )?.completed,
  ).toBe(true);
  expect(restored.dungeon.journal).toContain(
    "The bell answers with a low clear note. An amber seal wakes in the nave.",
  );
  expect(restored.dungeon.journal).not.toContain(
    "The mirror catches a pale beam. A silver-blue seal wakes in the nave.",
  );
  await capture(page, viewport, "04-saved-chapel-restored");
}

async function defeatAtSanctum(page, viewport) {
  await act(page, "sanctum-guardians");
  expect((await state(page, "Battle")).phase).toBe("combat");
  const updates = (await state(page, "Battle")).party.map((_, slot) => ({
    slot,
    hp: 1,
  }));
  await page.evaluate(
    (partyUpdates) =>
      window.__kithlandsTest.setPartyVitals(partyUpdates, "Battle"),
    updates,
  );
  await capture(page, viewport, "09-sanctum-before-defeat");

  for (let round = 0; round < 20; round += 1) {
    if (
      await page.evaluate(() => window.__kithlandsTest.sceneIsActive("Dungeon"))
    ) {
      break;
    }
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/action") &&
        response.request().method() === "POST",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("wait", "Battle"),
    );
    const result = await (await responsePromise).json();
    if (result.phase !== "combat") break;
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.sceneIsActive("Dungeon") ||
        !window.__kithlandsTest.battleVisibilitySnapshot("Battle").animating,
    );
  }

  await waitForRoom(page, "forgotten-threshold");
  const recovered = await state(page, "Dungeon");
  expect(recovered.dungeon.recovered_from_defeat).toBe(true);
  expect(recovered.party.every((member) => member.hp === member.max_hp)).toBe(
    true,
  );
  expect(
    recovered.dungeon.actions.find(
      (candidate) => candidate.id === "threshold-guardians",
    )?.completed,
  ).toBe(true);
  expect(recovered.dungeon.journal).toContain(
    "The bell answers with a low clear note. An amber seal wakes in the nave.",
  );
  expect(recovered.dungeon.journal).toContain(
    "The mirror catches a pale beam. A silver-blue seal wakes in the nave.",
  );
  await capture(page, viewport, "10-defeat-recovered-at-threshold");
}

test("rejected world arrival rolls back and recovers Shrine entry", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(30_000);
  await page.setViewportSize({ width: 800, height: 600 });
  let rejectedArrivalRequests = 0;
  await page.route("**/api/game/*/transition", async (route) => {
    const body = route.request().postDataJSON();
    if (
      body?.transition_id === "arrive-world-node" &&
      rejectedArrivalRequests < 2
    ) {
      rejectedArrivalRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected arrival failure" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.sceneIsActive("Title"),
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );

  const entry = await clickVisibleDungeonPath(page, "forgotten-shrine");
  await page.waitForFunction(
    () =>
      window.__kithlandsTest
        .messageState("World")
        .text.includes("Returned to the last safe step"),
    undefined,
    { timeout: 120_000 },
  );
  expect(rejectedArrivalRequests).toBe(2);
  const message = await page.evaluate(() =>
    window.__kithlandsTest.messageState("World"),
  );
  expect(message.visible).toBe(true);
  expect(message.text).toContain("Returned to the last safe step");

  await clickVisibleDungeonPath(page, "forgotten-shrine");
  await waitForVisibleDungeonEntry(page, entry);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/dungeon") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === "enter",
  );
  await page.evaluate(
    (label) => window.__kithlandsTest.clickInteractiveText(label, "World"),
    entry.label,
  );
  const result = await (await responsePromise).json();
  expect(result.error).toBeUndefined();
  expect(result.active_dungeon_id).toBe("forgotten-shrine");
  await waitForRoom(page, "forgotten-threshold");
});

for (const viewport of viewports) {
  test(`Forgotten Shrine full route, defeat and retry ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(360_000);
    page.setDefaultTimeout(30_000);
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.sceneIsActive("Title"),
      undefined,
      { timeout: 60_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    if (viewport.width === 390) {
      await enableSlowTouchWalking(page);
      await holdSafeWorldSteps(page);
    }

    const entry = await followVisibleDungeonPath(page, "forgotten-shrine");
    expect(entry.id).toBe("forgotten-shrine");
    await capture(page, viewport, "01-far-world-entry");
    await enterDungeon(page, "forgotten-shrine");
    await capture(page, viewport, "02-forgotten-threshold");

    await act(page, "threshold-markers");
    await clearRoutineEncounter(page, "threshold-guardians");
    await act(page, "threshold-nave");
    await waitForRoom(page, "echoing-nave");
    if (viewport.width === 1440) {
      await capture(page, viewport, "03-echoing-nave");
    }
    await act(page, "pilgrim-rest");

    await act(page, "nave-chapel");
    await waitForRoom(page, "resonant-chapel");
    if (viewport.width === 1440) {
      await capture(page, viewport, "04-resonant-chapel");
    }
    await clearRoutineEncounter(page, "chapel-sentinels");
    await act(page, "bell-tuning-lever");
    expect(
      (await state(page, "Dungeon")).dungeon.actions.find(
        (candidate) => candidate.id === "bell-tuning-lever",
      )?.completed,
    ).toBe(true);
    if (viewport.width === 1440) {
      await saveAndRestoreChapel(page, viewport);
    }
    await act(page, "chapel-return");
    await waitForRoom(page, "echoing-nave");

    await act(page, "nave-archive");
    await waitForRoom(page, "moonwater-archive");
    if (viewport.width === 1440) {
      await capture(page, viewport, "05-moonwater-archive");
    }
    await clearRoutineEncounter(page, "archive-wraiths");
    await act(page, "moon-mirror");
    expect(
      (await state(page, "Dungeon")).dungeon.actions.find(
        (candidate) => candidate.id === "moon-mirror",
      )?.completed,
    ).toBe(true);
    await act(page, "archive-return");
    await waitForRoom(page, "echoing-nave");
    await act(page, "pilgrim-rest");

    await act(page, "nave-reliquary");
    await waitForRoom(page, "branching-reliquary");
    await capture(page, viewport, "06-branching-reliquary");
    await act(page, "reliquary-moon-path");
    await act(page, "reliquary-bell-path");
    await act(page, "reliquary-sanctum");
    await waitForRoom(page, "inner-sanctum");
    await capture(page, viewport, "07-inner-sanctum");

    const goldBeforeDefeat = (await state(page, "Dungeon")).gold;
    await defeatAtSanctum(page, viewport);
    expect((await state(page, "Dungeon")).gold).toBe(goldBeforeDefeat);

    await act(page, "threshold-nave");
    await act(page, "nave-reliquary");
    await act(page, "reliquary-sanctum");
    await waitForRoom(page, "inner-sanctum");
    const retry = await act(page, "sanctum-guardians");
    expect(retry.phase).toBe("combat");
    const victory = await page.evaluate(() =>
      window.__kithlandsTest.forceVictory("Battle"),
    );
    expect(victory.phase).not.toBe("combat");
    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("Space", "Battle"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Battle")
        .some((entry) => entry.interactive && entry.text === "Continue"),
    );
    await capture(page, viewport, "11-retry-victory");
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Continue", "Battle"),
    );
    await waitForRoom(page, "inner-sanctum");

    const beforeReward = await state(page, "Dungeon");
    const rewardCountBefore = beforeReward.items.filter((item) =>
      item.name.includes("Twin-Sigil Amulet"),
    ).length;
    await act(page, "twin-sigil-altar");
    const rewarded = await state(page, "Dungeon");
    const amulets = rewarded.items.filter((item) =>
      item.name.includes("Twin-Sigil Amulet"),
    );
    expect(amulets).toHaveLength(rewardCountBefore + 1);
    expect(amulets[0].required_level).toBe(6);
    expect(amulets[0].item_level).toBe(6);
    expect(amulets[0].sockets).toHaveLength(1);
    await capture(page, viewport, "12-amulet-claimed");

    await act(page, "sanctum-return");
    await act(page, "reliquary-return");
    await act(page, "nave-threshold");
    const goldBeforePayoff = (await state(page, "Dungeon")).gold;
    await act(page, "threshold-return");
    const completed = await state(page, "World");
    const completedEntry = completed.dungeon_entries.find(
      (candidate) => candidate.id === "forgotten-shrine",
    );
    expect(completedEntry.completed).toBe(true);
    expect(completed.gold).toBe(goldBeforePayoff + 240);
    expect(completed.message).toContain("240 gold");
    await capture(page, viewport, "13-far-world-payoff");

    await enterDungeon(page, "forgotten-shrine");
    await act(page, "threshold-nave");
    await act(page, "nave-reliquary");
    await act(page, "reliquary-sanctum");
    const replay = await state(page, "Dungeon");
    expect(
      replay.dungeon.actions.find(
        (candidate) => candidate.id === "sanctum-guardians",
      )?.completed,
    ).toBe(true);
    expect(
      replay.dungeon.actions.find(
        (candidate) => candidate.id === "twin-sigil-altar",
      )?.completed,
    ).toBe(true);
    expect(
      replay.items.filter((item) => item.name.includes("Twin-Sigil Amulet")),
    ).toHaveLength(1);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );

    if (viewport.width === 1440) {
      await enterDungeon(page, "old-mill");
      const mill = await state(page, "Dungeon");
      expect(mill.active_dungeon_id).toBe("old-mill");
      expect(mill.dungeon.room_id).toBe("approach");
      expect(mill.dungeon.journal || []).not.toContain(
        "The bell answers with a low clear note. An amber seal wakes in the nave.",
      );
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
      );
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
      await enterDungeon(page, "forgotten-shrine");
      const shrineAgain = await state(page, "Dungeon");
      expect(shrineAgain.dungeon.journal).toContain(
        "The bell answers with a low clear note. An amber seal wakes in the nave.",
      );
      expect(shrineAgain.dungeon.journal).toContain(
        "The mirror catches a pale beam. A silver-blue seal wakes in the nave.",
      );
    }

    expect(pageErrors).toEqual([]);
    console.log(
      `Forgotten Shrine proof ${viewport.width}x${viewport.height}: ${proofDir}`,
    );
  });
}
