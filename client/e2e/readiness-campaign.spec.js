import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const proofDir = path.join("tmp", "readiness", `campaign-${Date.now()}`);
mkdirSync(proofDir, { recursive: true });
const resume = process.env.READINESS_RESUME
  ? JSON.parse(readFileSync(process.env.READINESS_RESUME, "utf8"))
  : null;
const previous = resume?.journalFile
  ? JSON.parse(readFileSync(resume.journalFile, "utf8"))
  : null;
const journal = previous?.journal || [];
const legs = [];
const email = resume?.email || `readiness-${Date.now()}@test.dev`;

async function checkpoint(page, reason) {
  const name = `Readiness checkpoint ${Date.now()}`;
  expect(
    await page.evaluate(
      (label) => window.__kithlandsTest.saveGame(label),
      name,
    ),
  ).toMatchObject({ status: "saved" });
  const saved = await page.evaluate(() => window.__kithlandsTest.listSaves());
  const saveId = saved.saves.find((entry) => entry.name === name)?.id;
  expect(saveId).toBeTruthy();
  const journalFile = path.resolve(proofDir, "journal.json");
  writeFileSync(
    journalFile,
    JSON.stringify({ battles, itemUsed, spellUsed, journal, legs }, null, 2),
  );
  writeFileSync(
    path.join(proofDir, "checkpoint.json"),
    JSON.stringify(
      { email, saveId, journalFile, reason, source: resume || null },
      null,
      2,
    ),
  );
}

async function state(page) {
  return page.evaluate(() =>
    window.__kithlandsTest.gameState(window.__kithlandsTest.activeSceneKey()),
  );
}
async function capture(page, name) {
  const snapshot = await state(page);
  writeFileSync(
    path.join(proofDir, `${name}.json`),
    JSON.stringify(snapshot, null, 2),
  );
  await page.screenshot({
    path: path.join(proofDir, `${name}.png`),
    fullPage: true,
  });
}

function pathToDoor(nav, spawns, nodeId) {
  const queue = [{ x: nav.x, y: nav.y, path: [] }];
  const visited = new Set([`${nav.x},${nav.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    const door = spawns.find(
      (spawn) =>
        spawn.kind !== "natural" &&
        Math.abs(spawn.x - at.x) <= 1 &&
        Math.abs(spawn.y - at.y) <= 2,
    );
    if (door?.node_id === nodeId && at.path.length > 0) return at.path;
    for (const [key, dx, dy] of [
      ["ArrowUp", 0, -1],
      ["ArrowDown", 0, 1],
      ["ArrowLeft", -1, 0],
      ["ArrowRight", 1, 0],
    ]) {
      const x = at.x + dx,
        y = at.y + dy,
        id = `${x},${y}`;
      if (!nav.walkable[y]?.[x] || visited.has(id)) continue;
      visited.add(id);
      queue.push({ x, y, path: [...at.path, key] });
    }
  }
  throw new Error(`No walkable door approach for ${nodeId}`);
}

let itemUsed = previous?.itemUsed || false,
  spellUsed = previous?.spellUsed || false,
  battles = previous?.battles || 0;
async function fight(page) {
  battles++;
  const started = Date.now();
  console.log(`battle ${battles} started`);
  if (battles === 1) await capture(page, "first-battle");
  for (let round = 0; round < 80; round++) {
    await page.waitForFunction(() => {
      const shot = window.__kithlandsTest.battleVisibilitySnapshot();
      return !shot.animating;
    });
    const gs = await state(page);
    expect(gs.phase).not.toBe("defeat");
    if (gs.phase !== "combat") {
      await page.keyboard.press("Space");
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .visibleTexts("Battle")
          .some((entry) => entry.interactive && /^continue$/i.test(entry.text)),
      );
      if (battles === 1) await capture(page, "first-victory");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        window.__kithlandsTest.sceneIsActive("World"),
      );
      journal.push({
        kind: "battle",
        number: battles,
        elapsedMs: Date.now() - started,
        rounds: round,
      });
      if (battles % 5 === 0) await checkpoint(page, `battle ${battles}`);
      console.log(
        `battle ${battles} completed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
      return;
    }
    const enemy = gs.enemies.find((entry) => entry.hp > 0);
    const wounded = gs.party.findIndex(
      (member) => member.hp > 0 && member.hp < member.max_hp,
    );
    let healingAssigned = false;
    const actions = gs.party.flatMap((member, slot) => {
      if (member.hp <= 0) return [];
      const cure = member.spells?.find(
        (spell) =>
          spell.effect === "heal" &&
          spell.target === "single_ally" &&
          member.mp >= spell.mp_cost,
      );
      if (wounded >= 0 && cure && !healingAssigned) {
        healingAssigned = true;
        spellUsed = true;
        return [{ slot, type: "spell", spell_id: cure.id, target_id: wounded }];
      }
      if (!itemUsed && wounded >= 0 && gs.potions > 0) {
        itemUsed = true;
        return [{ slot, type: "item", item_id: "potion", target_id: wounded }];
      }
      const damage = member.spells?.find(
        (spell) => spell.effect === "damage" && member.mp >= spell.mp_cost,
      );
      if (damage) {
        spellUsed = true;
        return [
          { slot, type: "spell", spell_id: damage.id, target_id: enemy.id },
        ];
      }
      return [{ slot, type: "attack", target_id: enemy.id }];
    });
    const roundStarted = Date.now();
    await page.evaluate(
      (commands) => window.__kithlandsTest.playCombatRound(commands),
      actions,
    );
    await page.waitForFunction(
      () => !window.__kithlandsTest.battleVisibilitySnapshot().animating,
      null,
      { timeout: 30000 },
    );
    journal.push({
      kind: "round-timing",
      elapsedMs: Date.now() - roundStarted,
    });
    journal.push({ kind: "round", actions, state: await state(page) });
  }
  throw new Error("Combat exceeded 80 rounds");
}

async function travel(page, nodeId) {
  const first = await page.evaluate(() =>
    window.__kithlandsTest.worldNavigationSnapshot(),
  );
  const leg = {
    nodeId,
    start: { x: first.x, y: first.y },
    shortestSteps:
      first.door?.node_id === nodeId
        ? 0
        : pathToDoor(first, first.spawns, nodeId).length,
    steps: 0,
    battlesBefore: battles,
    started: Date.now(),
  };
  legs.push(leg);
  for (let steps = 0; steps < 600; steps++) {
    await page.waitForFunction(() => {
      const bridge = window.__kithlandsTest;
      return (
        bridge.sceneIsActive("Battle") ||
        (bridge.sceneIsActive("World") &&
          !bridge.worldNavigationSnapshot().animating)
      );
    });
    if (
      await page.evaluate(() => window.__kithlandsTest.sceneIsActive("Battle"))
    ) {
      await fight(page);
      continue;
    }
    const gs = await state(page);
    if (gs.phase === "combat") {
      await page.waitForFunction(() =>
        window.__kithlandsTest.sceneIsActive("Battle"),
      );
      await fight(page);
      continue;
    }
    const nav = await page.evaluate(() =>
      window.__kithlandsTest.worldNavigationSnapshot(),
    );
    if (nav.door?.node_id === nodeId) {
      Object.assign(leg, {
        end: { x: nav.x, y: nav.y },
        elapsedMs: Date.now() - leg.started,
        encounters: battles - leg.battlesBefore,
      });
      console.log(
        `arrived ${nodeId}: ${leg.steps} steps (${leg.shortestSteps} shortest), ${leg.encounters} encounters, ${(leg.elapsedMs / 1000).toFixed(1)}s`,
      );
      return;
    }
    const direction = pathToDoor(nav, nav.spawns, nodeId)[0];
    await page.keyboard.down(direction);
    await page.waitForFunction(({ x, y }) => {
      const pos = window.__kithlandsTest.worldNavigationSnapshot();
      return pos.x !== x || pos.y !== y;
    }, nav);
    await page.keyboard.up(direction);
    leg.steps++;
  }
  throw new Error(`Travel exceeded 600 steps to ${nodeId}`);
}

async function talkToProprietor(page) {
  for (let steps = 0; steps < 100; steps++) {
    await page.waitForFunction(
      () => !window.__kithlandsTest.townNavigationSnapshot().animating,
    );
    const nav = await page.evaluate(() =>
      window.__kithlandsTest.townNavigationSnapshot(),
    );
    if (nav.nearNpcIndex === 0) {
      await page.evaluate(() => window.__kithlandsTest.interact("Town"));
      return;
    }
    const queue = [{ x: nav.x, y: nav.y, path: [] }];
    const visited = new Set([`${nav.x},${nav.y}`]);
    let route;
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i];
      const distances = nav.npcs.map(
        (npc) => Math.abs(npc.x - at.x) + Math.abs(npc.y - at.y),
      );
      if (
        distances[0] <= 2 &&
        distances.indexOf(Math.min(...distances)) === 0
      ) {
        route = at.path;
        break;
      }
      for (const [key, dx, dy] of [
        ["up", 0, -1],
        ["down", 0, 1],
        ["left", -1, 0],
        ["right", 1, 0],
      ]) {
        const x = at.x + dx,
          y = at.y + dy,
          id = `${x},${y}`;
        if (!nav.walkable[y]?.[x] || visited.has(id)) continue;
        visited.add(id);
        queue.push({ x, y, path: [...at.path, key] });
      }
    }
    expect(route, "walkable proprietor approach").toBeTruthy();
    await page.evaluate(
      (direction) => window.__kithlandsTest.movePlayer(direction, "Town"),
      route[0],
    );
  }
  throw new Error("Could not reach proprietor");
}

async function visitService(page, nodeId) {
  await travel(page, nodeId);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
  await talkToProprietor(page);
}

async function leaveTown(page) {
  await page.evaluate(() => window.__kithlandsTest.exitTown("Town"));
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
}

// This is automated normal progression: real walking/encounter rolls and
// authoritative combat actions, without debug mutations or quest warps.
// The separate full-game-loop-victory spec covers debug-assisted edge cases.
test("fresh save walks the fallback campaign through its story milestones", async ({
  page,
}) => {
  // Dedicated full-campaign diagnostic: the measured 1,931-tile itinerary
  // projects ~50 minutes from its first 38 encounters. Per-action watchdogs
  // still fail on stalls; the separate legacy regression retains its 120s cap.
  test.setTimeout(60 * 60_000);
  const forbidden = [];
  const errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/api/debug/**", (route) => {
    forbidden.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/osm/**", (route) => {
    forbidden.push(route.request().url());
    return route.abort();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  try {
    await page.goto("/");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    if (resume) {
      await page.locator('input[type="email"]').fill(email);
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("LOAD GAME", "Title"),
      );
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .visibleTexts("Title")
          .some((entry) => entry.text === "Manual Saves"),
      );
      await page.evaluate(
        (saveId) => window.__kithlandsTest.loadSave(saveId),
        resume.saveId,
      );
      await capture(page, "resumed-checkpoint");
    } else {
      await page.evaluate(
        (address) => window.__kithlandsTest.startWizardFromTitle(address),
        email,
      );
      const wizardClick = (text) =>
        page.evaluate(
          (label) =>
            window.__kithlandsTest.clickInteractiveText(label, "Wizard"),
          text,
        );
      const wizardWait = (text) =>
        page.waitForFunction(
          (label) =>
            window.__kithlandsTest
              .visibleTexts("Wizard")
              .some((entry) => entry.text.includes(label)),
          text,
        );
      await wizardWait("LOCALITY WIZARD");
      await wizardClick("Use real-world map data");
      await page.locator('input[type="text"]').fill("Cadott, WI");
      await wizardClick("FIND & CONTINUE");
      for (const heading of [
        "NAME YOUR NPCs",
        "NAME YOUR PLACES",
        "THE BIG BUILDING",
      ]) {
        await wizardWait(heading);
        await wizardClick("NEXT");
      }
      await wizardWait("PICK YOUR PARTY");
      for (const [slot, name] of ["Ayla", "Cato", "Nia", "Mira"].entries()) {
        await page.locator('input[type="text"]').nth(slot).fill(name);
      }
      await page.route("**/api/game/new", async (route) => {
        const data = route.request().postDataJSON();
        expect(data.use_osm).toBe(false);
        await route.continue({
          postData: JSON.stringify({ ...data, rng_seed: 42 }),
        });
      });
      await wizardClick("CREATE GAME");
      await page.waitForFunction(() =>
        window.__kithlandsTest.sceneIsActive("World"),
      );
      await capture(page, "fresh-world");
      expect((await state(page)).party).toHaveLength(4);
    }
    // Use the player's supported fast presentation settings; game rules and
    // movement/encounter probabilities stay unchanged.
    await page.evaluate(async () => {
      const prefs = await import("/src/systems/prefs.js");
      prefs.setBattleSpeed(1);
      prefs.setWalkSpeed(3);
      prefs.setMessageSpeed(6);
    });
    if (!resume) {
      await visitService(page, "shop");
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .visibleTexts("Town")
          .some((entry) => entry.text === "Leave Shop"),
      );
      const beforeBuy = await state(page);
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("Wooden Club", "Town"),
      );
      await capture(page, "shopping");
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("Buy", "Town"),
      );
      await page.waitForFunction(
        (gold) => window.__kithlandsTest.gameState("Town").gold === gold - 10,
        beforeBuy.gold,
      );
      expect((await state(page)).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "wpn_wooden_club", count: 1 }),
        ]),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("Leave Shop", "Town"),
      );
      await leaveTown(page);

      await visitService(page, "inn");
      expect(
        (await state(page)).party
          .filter((member) => member.hp > 0)
          .every(
            (member) =>
              member.hp === member.max_hp && member.mp === member.max_mp,
          ),
      ).toBe(true);
      await capture(page, "rested-inn");
      await leaveTown(page);
      const beforeSave = await state(page);
      const saveName = `Readiness ${Date.now()}`;
      expect(
        await page.evaluate(
          (name) => window.__kithlandsTest.saveGame(name),
          saveName,
        ),
      ).toMatchObject({ status: "saved" });
      const saves = await page.evaluate(() =>
        window.__kithlandsTest.listSaves(),
      );
      const saved = saves.saves.find((entry) => entry.name === saveName);
      expect(saved).toBeTruthy();
      await page.evaluate(
        (id) => window.__kithlandsTest.loadSave(id),
        saved.id,
      );
      const restored = await state(page);
      for (const key of [
        "party",
        "gold",
        "items",
        "equipment",
        "quests",
        "current_quest",
      ])
        expect(restored[key]).toEqual(beforeSave[key]);
      await capture(page, "save-reloaded");
      await checkpoint(page, "services and save/reload complete");
    }
    let promoted = (await state(page)).party.every((member) => member.promoted);
    for (let visits = 0; visits < 60; visits++) {
      const gs = await state(page);
      if (gs.phase === "victory") break;
      expect(gs.phase).not.toBe("defeat");
      if (gs.phase === "promotion") {
        await capture(page, "promotion-desktop");
        await page.setViewportSize({ width: 390, height: 844 });
        await capture(page, "promotion-phone");
        await page.evaluate(() =>
          window.__kithlandsTest.clickInteractiveText(
            "Claim Promotion",
            "World",
          ),
        );
        await page.waitForFunction(() =>
          window.__kithlandsTest
            .gameState("World")
            .party.every((member) => member.promoted),
        );
        promoted = true;
        await page.setViewportSize({ width: 1440, height: 900 });
        continue;
      }
      const quest = gs.quests[gs.current_quest];
      console.log(
        `campaign quest ${gs.current_quest + 1}/${gs.quests.length}: ${quest.name}, leader level ${gs.party[0].level}`,
      );
      await travel(page, quest.target_node_id);
      const before = await state(page);
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => {
        const bridge = window.__kithlandsTest;
        return (
          bridge.sceneIsActive("Town") ||
          bridge.sceneIsActive("Settlement") ||
          bridge.sceneIsActive("Battle") ||
          ["promotion", "victory"].includes(bridge.gameState("World")?.phase)
        );
      });
      journal.push({
        kind: "visit",
        node: quest.target_node_id,
        before,
        after: await state(page),
      });
      writeFileSync(
        path.join(proofDir, "progress.json"),
        JSON.stringify({ visits, battles, journal }, null, 2),
      );
      const scene = await page.evaluate(() =>
        window.__kithlandsTest.activeSceneKey(),
      );
      if (scene === "Battle") {
        await fight(page);
        continue;
      }
      if (scene === "Town") {
        expect(["world", "quest_complete"]).toContain(
          (await state(page)).phase,
        );
        await page.evaluate(() => window.__kithlandsTest.exitTown("Town"));
      } else if (scene === "Settlement") {
        await page.keyboard.press("Enter");
      }
      await page.waitForFunction(() =>
        window.__kithlandsTest.sceneIsActive("World"),
      );
      await checkpoint(page, `quest visit ${visits}`);
    }
    const final = await state(page);
    expect(final.phase).toBe("victory");
    expect(final.quests.every((quest) => quest.completed)).toBe(true);
    expect(promoted).toBe(true);
    expect(battles).toBeGreaterThan(0);
    expect(itemUsed).toBe(true);
    expect(spellUsed).toBe(true);
    const combatLogs = journal
      .filter((entry) => entry.kind === "round")
      .flatMap((entry) => entry.state.combat_log || [])
      .join("\n");
    expect(combatLogs).toMatch(/potion/i);
    expect(combatLogs).toMatch(/casts /);
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
    await capture(page, "campaign-victory");
  } finally {
    writeFileSync(
      path.join(proofDir, "journal.json"),
      JSON.stringify(
        {
          forbidden,
          errors,
          battles,
          itemUsed,
          spellUsed,
          journal,
          legs,
          resume,
        },
        null,
        2,
      ),
    );
    if (!page.isClosed()) await capture(page, "last-screen");
  }
});
