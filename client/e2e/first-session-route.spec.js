import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
  clickRouteText,
  chooseStoryAction,
  openNormalMerchant,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const width = Number(process.env.FIRST_SESSION_WIDTH) || 1440;
const proof = path.resolve(`tmp/first-session-${width}-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({
  viewport: { width, height: width < 620 ? 844 : 900 },
  hasTouch: width < 620,
  reducedMotion: "no-preference",
  video: "on",
});

test("fresh normal party connects gathering, purchases, combat, crafting and gems", async ({
  page,
}) => {
  test.setTimeout(900000);
  page.setDefaultTimeout(15000);
  const started = Date.now(),
    milestones = [],
    requests = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/game/"))
      requests.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
  });
  const state = () => page.evaluate(() => window.__kithlandsTest.gameState());
  let lastKnown;
  const capture = async (stage) => {
    const gs = (await state()) || lastKnown;
    lastKnown = gs;
    milestones.push({
      stage,
      seconds: (Date.now() - started) / 1000,
      gold: gs.gold,
      party: gs.party.map((p) => ({
        name: p.name,
        level: p.level,
        xp: p.xp,
        hp: p.hp,
        mp: p.mp,
      })),
      materials: gs.materials,
      gems: gs.gems,
      equipment: gs.equipment,
      room: gs.dungeon?.room_id,
      currentQuest: gs.quests?.[gs.current_quest],
      ui: await page.evaluate(() => {
        const key = window.__kithlandsTest.activeSceneKey();
        const s = window.__normalRouteGame.scene.getScene(key);
        return {
          key,
          flags: window.__kithlandsTest.sceneFlags(key),
          input: s.input.enabled,
          keyboard: s.input.keyboard.enabled,
          dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) =>
            d.getAttribute("aria-labelledby"),
          ),
        };
      }),
    });
    writeFileSync(
      path.join(proof, "milestones.json"),
      JSON.stringify(milestones, null, 2),
    );
    await page.screenshot({
      path: path.join(
        proof,
        `${String(milestones.length).padStart(2, "0")}-${stage}.png`,
      ),
    });
    await page.waitForTimeout(1200); // Short reading hold; gameplay speed stays unchanged.
  };
  let battles = 0,
    rounds = 0;
  const battle = async () => {
    battles++;
    await fightNormally(page, async () => {
      rounds++;
      await capture(`battle-${battles}-round-${rounds}`);
    });
  };
  const walk = async (key, target) => {
    while ((await walkNormally(page, key, target)) === "Battle") await battle();
  };
  try {
    await startNormalRoute(page);
    const initial = await state();
    expect(initial.gold).toBe(100);
    expect(initial.party.every((p) => p.level === 1)).toBe(true);
    await capture("fresh-party");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: /Quest journal/ }).click();
    const journal = page.getByRole("dialog", {
      name: "Quest Log",
      exact: true,
    });
    await expect(journal).toContainText("Old Mill");
    await journal.getByRole("button", { name: /Track The Old Mill/ }).click();
    await capture("tracked-journal");
    await page.keyboard.press("Escape");
    while (await page.locator(".kith-viewport-dialog").count())
      await page.keyboard.press("Escape");
    const origin = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      return { x: s.playerX, y: s.playerY };
    });
    const resources = (await state()).resources;
    for (const material of ["meadow_herb", "ember_ore"]) {
      const node = resources
        .filter((r) => r.material_id === material && !r.gathered)
        .sort(
          (a, b) =>
            Math.abs(a.x - origin.x) +
            Math.abs(a.y - origin.y) -
            Math.abs(b.x - origin.x) -
            Math.abs(b.y - origin.y),
        )[0];
      expect(node).toBeTruthy();
      await walk("World", node);
      await page
        .getByRole("button", { name: `Gather — ${node.name}`, exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await state()).resources.find((r) => r.id === node.id).gathered,
        )
        .toBe(true);
      await capture(`gathered-${material}`);
    }
    const home = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      return s.spawns.find(
        (spawn) => spawn.node_id === s.gameState.settlement_entry_node_id,
      );
    });
    await walk("World", home);
    await page.getByRole("button", { name: /^Enter —/ }).click();
    await routeReady(page, "Settlement");
    await walk("Settlement", { x: 18, y: 9 });
    await page.keyboard.press("Enter");
    await routeReady(page, "Town");
    await openNormalMerchant(page);
    await page.getByRole("button", { name: /^Spells/ }).click();
    await page.getByRole("button", { name: /^Frost/ }).click();
    await page.locator(".shop-purchase").click();
    await expect(page.locator(".shop-status")).toHaveText(
      "Sparks learned Frost!",
    );
    expect((await state()).gold).toBe(0);
    await capture("first-spell-purchase");
    await page.getByRole("button", { name: /^Leave Shop/ }).click();
    await page.keyboard.press("Escape");
    await routeReady(page, "Settlement");
    await walk("Settlement", { x: 12, y: 16 });
    await clickRouteText(page, "Old Mill trail", "Settlement");
    await routeReady(page, "Dungeon");
    await chooseStoryAction(page, "heron-trail");
    await capture("optional-heron-trail");
    await chooseStoryAction(page, "pool-bramblehog");
    await battle();
    await routeReady(page, "Dungeon");
    expect(
      (await state()).dungeon.actions.find((a) => a.id === "pool-bramblehog")
        .completed,
    ).toBe(true);
    await chooseStoryAction(page, "pool-smithing-cache");
    await capture("earned-smithing-supplies");
    await clickRouteText(page, "Party", "Dungeon");
    await capture("party-before-crafting");
    await page.getByRole("button", { name: /Crafting/i }).click();
    await capture("crafting-open");
    const crafting = page.getByRole("dialog", {
      name: "Crafting",
      exact: true,
    });
    for (const name of [
      "Brew Potion",
      "Forge Balanced Trail Sword",
      "Refine Ember Shards",
    ]) {
      await crafting.getByRole("button", { name, exact: true }).click();
      await expect(crafting.locator(".craft-confirm")).toBeEnabled();
      await crafting.locator(".craft-confirm").click();
      await expect(crafting.getByRole("status")).toContainText(
        `${name} complete`,
      );
      await capture(name.replaceAll(" ", "-"));
    }
    await crafting
      .getByRole("button", { name: "Gem workshop", exact: true })
      .click();
    await page.getByRole("button", { name: /Transmute ·/ }).click();
    await page.locator('[data-recipe-id="refine_ember_gem"]').click();
    await page
      .getByRole("region", { name: "Recipe preview" })
      .locator(".gem-confirm")
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Created 1 × Ember Gem",
    );
    await capture("mineral-refined-to-gem");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await crafting.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: /Character/ }).click();
    await page.locator('[data-slot-id="main_hand"]').click();
    await page
      .locator(".equipment-item-row:not(.is-disabled)")
      .filter({ hasText: "Balanced Trail Sword" })
      .click();
    await page
      .getByRole("button", { name: "Equip in Weapon", exact: true })
      .click();
    await capture("crafted-blade-equipped");
    await page.getByRole("button", { name: "Socket", exact: true }).click();
    await page.locator('[data-gem-id="ember_gem"]').click();
    await page
      .getByRole("region", { name: "Socket preview" })
      .locator(".gem-confirm")
      .click();
    await expect(page.getByRole("status")).toContainText("Ember Gem socketed");
    await capture("crafted-blade-socketed");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await chooseStoryAction(page, "pool-rest");
    await chooseStoryAction(page, "pool-return");
    await chooseStoryAction(page, "trail-bats");
    await battle();
    await routeReady(page, "Dungeon");
    await capture("upgraded-party-after-mill-bats");
    await clickRouteText(page, "Party", "Dungeon");
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/save") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Save game/ }).click();
    expect((await (await saved).json()).error).toBeUndefined();
    await capture("saved-opening-progress");
    const retained = (gs) => ({
      gold: gs.gold,
      party: gs.party.map((p) => ({
        name: p.name,
        level: p.level,
        xp: p.xp,
        hp: p.hp,
        mp: p.mp,
        spells: (p.spells || []).map((spell) => spell.id),
      })),
      materials: gs.materials,
      gems: gs.gems,
      weapon: {
        ...gs.equipment[0].weapon_item,
        // Quote fingerprints may refresh on load; compare the quoted effects.
        gem_changes: gs.equipment[0].weapon_item.gem_changes?.map(
          ({ token: _token, ...quote }) => quote,
        ),
      },
      resources: gs.resources.map((r) => ({
        id: r.id,
        ready_at: r.ready_at || 0,
      })),
      adventure: gs.active_dungeon_id,
      room: gs.dungeon.room_id,
      actions: gs.dungeon.actions.map((a) => ({
        id: a.id,
        completed: a.completed,
      })),
    });
    const beforeExit = retained(await state());
    expect(beforeExit.party.every((p) => p.xp > 0)).toBe(true);
    expect(beforeExit.party.find((p) => p.name === "Sparks").spells).toContain(
      "frost",
    );
    expect(beforeExit.weapon.name).toBe("Balanced Trail Sword");
    expect(beforeExit.weapon.power).toBe(14);
    expect(beforeExit.weapon.sockets.map((socket) => socket.gem_id)).toContain(
      "ember_gem",
    );
    expect(
      beforeExit.resources.filter((r) => r.ready_at > 0).length,
    ).toBeGreaterThanOrEqual(2);
    await clickRouteText(page, "Party", "Dungeon");
    await page
      .getByRole("button", { name: "Exit to main menu", exact: true })
      .click();
    await page.getByRole("button", { name: /Save and exit/ }).click();
    await expect(
      page.getByRole("main", { name: "Kithlands main menu" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.locator(".title-adventure")).toHaveCount(1);
    await expect(page.locator(".title-adventure > .title-save")).toContainText(
      "Most recent adventure",
    );
    await expect(page.locator(".save-history")).toHaveCount(1);
    await expect(page.locator(".save-history")).not.toHaveAttribute("open");
    await capture("latest-adventure-and-collapsed-history");
    await page.locator(".save-history summary").click();
    await expect(page.locator(".save-history")).toHaveAttribute("open", "");
    await expect(
      page.locator(".save-history .title-save").first(),
    ).toBeVisible();
    await capture("older-snapshots-available");
    await page.locator(".save-history summary").click();
    await page.locator(".title-adventure > .title-save").click();
    await routeReady(page, "Dungeon");
    expect(retained(await state())).toEqual(beforeExit);
    await capture("normal-save-reloaded");
    expect(battles).toBeGreaterThanOrEqual(2);
    expect(requests.filter((r) => r.path.includes("/debug"))).toEqual([]);
    expect(requests.some((r) => r.body?.debug_no_encounters === true)).toBe(
      false,
    );
    expect(errors).toEqual([]);
    expect(Date.now() - started).toBeLessThan(900000);
  } finally {
    writeFileSync(
      path.join(proof, "requests.json"),
      JSON.stringify(requests, null, 2),
    );
    writeFileSync(
      path.join(proof, "errors.json"),
      JSON.stringify(errors, null, 2),
    );
    await capture("final-state").catch(() => {});
    console.log(
      "first-session-proof",
      proof,
      "seconds",
      (Date.now() - started) / 1000,
    );
  }
});
