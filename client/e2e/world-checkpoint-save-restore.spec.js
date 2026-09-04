import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });
test.describe.configure({ mode: "serial" });

const runID = Date.now();
const proofDir = path.resolve(`tmp/world-checkpoint-${runID}`);
mkdirSync(proofDir, { recursive: true });

const replacementGame = {
  town_name: "Cache Crossing",
  people: [
    { name: "Mara", relation: "friendly" },
    { name: "Oren", relation: "neutral" },
  ],
  places: ["Lantern School", "North Market", "River Hall"],
  big_building: "Clock Tower",
  party: [
    { name: "Ayla", class_id: "warrior" },
    { name: "Mira", class_id: "mender" },
  ],
  difficulty: "normal",
};

async function capture(page, viewport, label) {
  await page.screenshot({
    path: path.join(
      proofDir,
      `${viewport.width}x${viewport.height}-${label}-${Date.now()}.png`,
    ),
    fullPage: true,
  });
}

async function worldSnapshot(page) {
  return page.evaluate(() => {
    const state = window.__kithlandsTest.gameState("World");
    const nav = window.__kithlandsTest.worldNavigationSnapshot();
    return {
      gameID: state?.id,
      x: nav.x,
      y: nav.y,
      checkpoint: state?.world_checkpoint,
      nodeID: state?.current_location?.world_node_id,
    };
  });
}

function expectExactCheckpoint(snapshot) {
  expect(snapshot.checkpoint).toBeTruthy();
  expect({ x: snapshot.x, y: snapshot.y }).toEqual({
    x: snapshot.checkpoint.x,
    y: snapshot.checkpoint.y,
  });
  expect(snapshot.nodeID).toBe(snapshot.checkpoint.world_node_id);
  expect(snapshot.checkpoint.map_signature).toBeTruthy();
}

async function safeWorldStep(page) {
  const direction = await page.evaluate(() => {
    const nav = window.__kithlandsTest.worldNavigationSnapshot();
    const state = window.__kithlandsTest.gameState("World");
    const currentNodeID = state.current_location?.world_node_id;
    return [
      ["up", 0, -1],
      ["right", 1, 0],
      ["down", 0, 1],
      ["left", -1, 0],
    ].find(([, dx, dy]) => {
      const x = nav.x + dx;
      const y = nav.y + dy;
      return (
        nav.walkable[y]?.[x] &&
        nav.spawns
          .filter((spawn) => spawn.node_id !== currentNodeID)
          .every((spawn) => Math.abs(x - spawn.x) + Math.abs(y - spawn.y) > 3)
      );
    })?.[0];
  });
  expect(direction, "a safe adjacent world tile").toBeTruthy();
  const result = await page.evaluate(
    (dir) => window.__kithlandsTest.sampleMovePlayer(dir, "World"),
    direction,
  );
  expect(result.at(-1).moved).toBe(true);
  await page.waitForFunction(
    () => !window.__kithlandsTest.worldNavigationSnapshot().animating,
  );
}

async function findSave(page, name) {
  const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
  const saved = saves.saves.find((candidate) => candidate.name === name);
  expect(saved).toBeTruthy();
  return saved;
}

async function followShrineRoute(page) {
  const entry = await page.evaluate(() => {
    const state = window.__kithlandsTest.gameState("World");
    return state.dungeon_entries.find(
      (candidate) => candidate.id === "forgotten-shrine",
    );
  });
  expect(entry).toBeTruthy();
  const routeLabel = `Follow path to ${entry.title}`;
  await page.waitForFunction(
    (label) =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((candidate) => candidate.interactive && candidate.text === label),
    routeLabel,
  );
  await page.evaluate(
    (label) => window.__kithlandsTest.clickInteractiveText(label, "World"),
    routeLabel,
  );
  await page.waitForFunction(
    ({ nodeID, entryLabel }) => {
      const state = window.__kithlandsTest.gameState("World");
      return (
        state.current_location?.world_node_id === nodeID &&
        window.__kithlandsTest
          .visibleTexts("World")
          .some(
            (candidate) =>
              candidate.interactive && candidate.text === entryLabel,
          )
      );
    },
    { nodeID: entry.node_id, entryLabel: entry.label },
    { timeout: 120_000 },
  );
  return entry;
}

for (const viewport of [
  { width: 800, height: 600 },
  { width: 390, height: 844 },
]) {
  test(`authoritative world checkpoint survives game switches and full reload at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(30_000);
    await page.setViewportSize(viewport);
    const email = `checkpoint-${viewport.width}-${runID}@kithlands.dev`;
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(
      (account) => window.__kithlandsTest.startQuickGame(account),
      email,
    );

    for (let step = 0; step < 3; step += 1) await safeWorldStep(page);
    const firstSaveName = `Exact overworld ${viewport.width} ${runID}`;
    expect(
      await page.evaluate(
        (name) => window.__kithlandsTest.saveGame(name, "World"),
        firstSaveName,
      ),
    ).toMatchObject({ status: "saved" });
    const first = await worldSnapshot(page);
    expectExactCheckpoint(first);
    const firstSave = await findSave(page, firstSaveName);

    const secondState = await page.evaluate(
      (gameData) => window.__kithlandsTest.startCustomGame(gameData),
      replacementGame,
    );
    expect(secondState.id).not.toBe(first.gameID);
    const second = await worldSnapshot(page);
    expectExactCheckpoint(second);
    expect({ x: second.x, y: second.y }).not.toEqual({
      x: first.x,
      y: first.y,
    });
    await capture(page, viewport, "01-same-spa-second-game");

    const loadedFirst = await page.evaluate(
      (saveID) => window.__kithlandsTest.loadSave(saveID),
      firstSave.id,
    );
    expect(loadedFirst.id).not.toBe(second.gameID);
    const sameSPA = await worldSnapshot(page);
    expectExactCheckpoint(sameSPA);
    expect(sameSPA.checkpoint).toEqual(first.checkpoint);
    await capture(page, viewport, "02-same-spa-exact-restore");

    const shrineEntry = await followShrineRoute(page);
    const beforeEntry = await worldSnapshot(page);
    expect(beforeEntry.nodeID).toBe(shrineEntry.node_id);
    const entryRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith("/dungeon") &&
        request.method() === "POST" &&
        request.postDataJSON()?.type === "enter",
    );
    await page.evaluate(
      (label) => window.__kithlandsTest.clickInteractiveText(label, "World"),
      shrineEntry.label,
    );
    const submittedEntry = (await entryRequest).postDataJSON();
    expect(submittedEntry.world_position).toEqual({
      x: beforeEntry.x,
      y: beforeEntry.y,
    });
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("Dungeon"),
    );
    const dungeonState = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Dungeon"),
    );
    expect(dungeonState.world_checkpoint).toEqual({
      ...beforeEntry.checkpoint,
      x: beforeEntry.x,
      y: beforeEntry.y,
      world_node_id: shrineEntry.node_id,
    });

    const shrineSaveName = `Remote Shrine ${viewport.width} ${runID}`;
    expect(
      await page.evaluate(
        (name) => window.__kithlandsTest.saveGame(name, "Dungeon"),
        shrineSaveName,
      ),
    ).toMatchObject({ status: "saved" });
    const shrineSave = await findSave(page, shrineSaveName);

    await page.reload();
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(async (account) => {
      const api = await import("/src/api.js");
      const auth = await api.login(account);
      api.setToken(auth.token);
    }, email);
    const fullReload = await page.evaluate(
      (saveID) => window.__kithlandsTest.loadSave(saveID),
      shrineSave.id,
    );
    expect(fullReload.current_location?.kind).toBe("dungeon");
    expect(fullReload.world_checkpoint).toEqual(dungeonState.world_checkpoint);
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    const restoredShrine = await worldSnapshot(page);
    expectExactCheckpoint(restoredShrine);
    expect(restoredShrine.checkpoint).toEqual(dungeonState.world_checkpoint);
    await capture(page, viewport, "03-full-reload-shrine-exit");

    await safeWorldStep(page);
    const movedSaveName = `Post Shrine move ${viewport.width} ${runID}`;
    await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name, "World"),
      movedSaveName,
    );
    const moved = await worldSnapshot(page);
    expectExactCheckpoint(moved);
    expect({ x: moved.x, y: moved.y }).not.toEqual({
      x: restoredShrine.x,
      y: restoredShrine.y,
    });
    await capture(page, viewport, "04-full-reload-shrine-moved");

    expect(pageErrors).toEqual([]);
  });
}
