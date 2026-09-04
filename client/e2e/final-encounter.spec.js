import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const run = Date.now();
const proof = path.join("tmp", "final-encounter", String(run));
mkdirSync(proof, { recursive: true });
const fixture = JSON.parse(
  readFileSync("../server/api/testdata/final-campaign-checkpoint.json", "utf8"),
);
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
function installCheckpoint(email) {
  const database = process.env.DB_NAME;
  if (!/^kithlands_\d+$/.test(database || ""))
    throw new Error("Use worktree-local DB_NAME");
  const user = randomUUID(),
    locality = randomUUID(),
    save = randomUUID();
  const query = `BEGIN;
INSERT INTO users(id,email) VALUES(${sql(user)},${sql(email)});
INSERT INTO localities(id,user_id,source,name,graph) VALUES(${sql(locality)},${sql(user)},'wizard',${sql(fixture.locality.name)},${sql(JSON.stringify(fixture.locality))});
INSERT INTO saves(id,user_id,locality_id,name,flavor,difficulty,spawn_node_id,party,inventory,quest_state,world_state,rng_seed)
VALUES(${sql(save)},${sql(user)},${sql(locality)},'Natural pre-Q12 checkpoint','conquest',${sql(fixture.difficulty)},${sql(fixture.spawn_node_id)},${sql(JSON.stringify(fixture.party))},${sql(JSON.stringify(fixture.inventory))},${sql(JSON.stringify(fixture.quest_state))},${sql(JSON.stringify(fixture.world_state))},${fixture.rng_seed}); COMMIT;`;
  execFileSync("psql", ["-d", database, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: query,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return save;
}
async function state(page) {
  return page.evaluate(() =>
    window.__kithlandsTest.gameState(window.__kithlandsTest.activeSceneKey()),
  );
}
async function capture(page, name) {
  await page.screenshot({
    path: path.join(proof, `${name}-${run}.png`),
    fullPage: true,
  });
  writeFileSync(
    path.join(proof, `${name}-${run}.json`),
    JSON.stringify(await state(page), null, 2),
  );
}
function commands(gs, lose) {
  const alive = gs.enemies.filter((e) => e.hp > 0);
  const target =
    alive.find((e) => e.monster_id !== "bellbound_regent") || alive[0];
  const lowest = gs.party.reduce(
    (at, m, i) =>
      m.hp > 0 &&
      (gs.party[at].hp <= 0 ||
        m.hp / m.max_hp < gs.party[at].hp / gs.party[at].max_hp)
        ? i
        : at,
    0,
  );
  return gs.party.flatMap((m, slot) => {
    if (m.hp <= 0) return [];
    if (lose) return [{ slot, type: "defend" }];
    const heal =
      m.class_id === "mender" &&
      gs.party[lowest].hp < gs.party[lowest].max_hp / 2 &&
      m.spells
        .filter((s) => s.castable && s.effect === "heal" && s.mp_cost <= m.mp)
        .sort((a, b) => b.power - a.power)[0];
    if (heal)
      return [{ slot, type: "spell", spell_id: heal.id, target_id: lowest }];
    const spell = m.spells
      .filter(
        (s) =>
          s.castable &&
          s.effect === "damage" &&
          s.element === "ice" &&
          s.mp_cost <= m.mp,
      )
      .sort((a, b) => b.power - a.power)[0];
    return [
      spell
        ? { slot, type: "spell", spell_id: spell.id, target_id: target.id }
        : { slot, type: "attack", target_id: target.id },
    ];
  });
}
async function fight(page, lose = false) {
  for (let round = 0; round < 100; ) {
    await page.waitForFunction(
      () => {
        const b = window.__kithlandsTest;
        return (
          !b.sceneIsActive("Battle") || !b.battleVisibilitySnapshot().animating
        );
      },
      null,
      { timeout: 45000 },
    );
    const gs = await state(page);
    if (gs.phase !== "combat") return gs;
    const sent = await page.evaluate(
      (actions) => {
        const bridge = window.__kithlandsTest;
        if (
          !bridge.sceneIsActive("Battle") ||
          bridge.gameState("Battle")?.phase !== "combat" ||
          bridge.battleVisibilitySnapshot().animating
        )
          return false;
        bridge.playCombatRound(actions);
        return true;
      },
      commands(gs, lose),
    );
    if (sent) {
      round++;
      if (round % 10 === 0) console.log("fight rounds", round, "loss", lose);
    }
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  throw new Error("final encounter exceeded 100 rounds");
}
async function arrive(page) {
  const gs = await state(page);
  const result = await page.evaluate(
    (node) =>
      window.__kithlandsTest.submitAction(
        { type: "quest_advance", node_id: node },
        "World",
      ),
    gs.quests[gs.current_quest].target_node_id,
  );
  expect(result.phase).toBe("combat");
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Battle"),
  );
}
for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`${viewport.name}: ordinary final fight, defeat, preparation, retry, ending and save`, async ({
    page,
  }) => {
    test.setTimeout(20 * 60_000);
    page.setDefaultTimeout(30000);
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(msg.text());
    });
    page.on("pageerror", (e) => console.log(String(e)));
    const errors = [],
      forbidden = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/api/debug/**", (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    });
    const email = `final-${viewport.name}-${run}@test.dev`,
      save = installCheckpoint(email);
    await page.setViewportSize(viewport);
    await page.goto("/");
    console.log("loaded page", viewport.name);
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.locator('input[type="email"]').fill(email);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("LOAD GAME", "Title"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Title")
        .some((e) => e.text === "Manual Saves"),
    );
    await page.evaluate((id) => window.__kithlandsTest.loadSave(id), save);
    await page.evaluate(async () => {
      const prefs = await import("/src/systems/prefs.js");
      prefs.setBattleSpeed(1);
      prefs.setMessageSpeed(6);
    });

    await capture(page, `${viewport.name}-approach`);
    const before = await state(page);
    expect(before.phase).not.toBe("victory");
    await arrive(page);
    expect((await state(page)).final_encounter.active).toBe(true);
    await page.waitForFunction(
      () => !window.__kithlandsTest.battleVisibilitySnapshot().animating,
    );
    await capture(page, `${viewport.name}-boss`);
    console.log("starting loss", viewport.name);
    const lost = await fight(page, true);
    expect(lost.phase).toBe("world");
    expect(lost.final_encounter.recovery).toBe("defeat");
    expect(lost.quests.at(-1).completed).toBe(false);
    await expect(
      page.getByRole("dialog", { name: "A chance to regroup" }),
    ).toBeVisible();
    await capture(page, `${viewport.name}-recovery`);
    await page.getByRole("button", { name: "Prepare and explore" }).click();
    await page.keyboard.press("m");
    await page.waitForFunction(() =>
      window.__kithlandsTest.menuButtonEnabled("CHARACTER", "World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
    );
    await expect(page.locator(".kith-equipment-screen")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recommend Gear" }),
    ).toBeVisible();
    await capture(page, `${viewport.name}-prepare`);
    await page.getByRole("button", { name: "Close equipment" }).click();
    await page.keyboard.press("m");
    // The ordinary quest-arrival action re-enters after regrouping. No quest warp,
    // debug HP mutation, forced victory, or direct engine resolution is used.
    await arrive(page);
    console.log("starting retry", viewport.name);
    const won = await fight(page);
    expect(won.phase).toBe("victory");
    expect(won.final_encounter.defeated).toBe(true);
    await page.keyboard.press("Space");
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Battle")
        .some((e) => e.interactive && /^continue$/i.test(e.text)),
    );
    await capture(page, `${viewport.name}-result`);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "The roads are yours again" }),
    ).toBeVisible();
    await capture(page, `${viewport.name}-ending`);
    await page.getByRole("button", { name: "Save this ending" }).click();
    await expect(page.getByRole("status")).toContainText("Ending saved");
    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const completed = saves.saves.find((s) => s.name.endsWith("— Complete"));
    expect(completed).toBeTruthy();
    await page.getByRole("button", { name: "Return to title" }).click();
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.sceneIsActive("Title") &&
        window.__kithlandsTest
          .visibleTexts("Title")
          .some((e) => e.interactive && e.text.includes("LOAD GAME")),
    );
    await page.locator('input[type="email"]').fill(email);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("LOAD GAME", "Title"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Title")
        .some((e) => e.text.endsWith("— Complete")),
    );
    const canvas = await page.locator("canvas").boundingBox();
    // First manual-save row: title screen renders it at x=400, y=115 in its 800x600 canvas.
    await page.mouse.click(
      canvas.x + canvas.width / 2,
      canvas.y + (canvas.height * 115) / 600,
    );
    await expect(
      page.getByRole("dialog", { name: "The roads are yours again" }),
    ).toBeVisible();
    expect((await state(page)).gold).toBe(won.gold);
    expect(errors).toEqual([]);
    expect(forbidden).toEqual([]);
  });
}
