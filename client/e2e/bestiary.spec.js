import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const proofDir = path.resolve(`tmp/bestiary/proof-${Date.now()}`);
mkdirSync(proofDir, { recursive: true });
const viewports = [
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 390, height: 844 },
];
test.use({ hasTouch: true });

function itemNameFromID(itemID) {
  return itemID
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function start(page, email) {
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startQuickGame(email),
    email,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
}

async function openCodex(page, mobile = false) {
  if (mobile) {
    // Real pointer/touch entry uses the game's Help button, once touch controls appear.
    const canvas = await page.locator("canvas").boundingBox();
    await page.touchscreen.tap(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    );
    const layout = await page.evaluate(() =>
      window.__kithlandsTest.gameplayViewportSnapshot("World"),
    );
    const size = await page.evaluate(() =>
      window.__kithlandsTest.logicalGameSize("World"),
    );
    const hud = layout.touchHud;
    await page.touchscreen.tap(
      canvas.x + (hud.x / size.width) * canvas.width,
      canvas.y +
        ((hud.startY + hud.height + hud.gap) / size.height) * canvas.height,
    );
  } else {
    await page.keyboard.press("h");
  }
  await expect(page.getByRole("dialog", { name: "Field codex" })).toBeVisible();
  await expect(
    page.getByRole("listbox", { name: "Monster catalog" }),
  ).toBeVisible();
}

async function capture(page, size, stage) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(proofDir, `${size.width}x${size.height}-${stage}.png`),
  });
}

for (const size of viewports) {
  test(`bestiary real encounter, save/reload and navigation at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const email = `bestiary_${size.width}_${Date.now()}@kithlands.dev`;
    await start(page, email);
    const catalog = await (await page.request.get("/api/data/monsters")).json();
    expect(catalog.length).toBeGreaterThanOrEqual(17);
    await openCodex(page, size.width < 600);
    const options = page.getByRole("option");
    await expect(options).toHaveCount(catalog.length);
    await expect(page.locator(".bestiary-summary")).toContainText(
      `0 / ${catalog.length} discovered`,
    );
    await expect(page.locator(".bestiary-detail")).toContainText(
      "You have not encountered this creature",
    );
    await expect(page.locator(".bestiary-detail img")).toHaveCount(0);
    const hiddenMonster = catalog[0];
    const dialogText = await page
      .getByRole("dialog", { name: "Field codex" })
      .textContent();
    const ariaTree = await page
      .getByRole("dialog", { name: "Field codex" })
      .ariaSnapshot();
    for (const hiddenValue of [
      hiddenMonster.name,
      hiddenMonster.field_note,
      ...hiddenMonster.habitats,
      hiddenMonster.tactics,
      ...hiddenMonster.drops.flatMap((drop) => [
        drop.item_id,
        itemNameFromID(drop.item_id),
      ]),
    ]) {
      expect(dialogText).not.toContain(hiddenValue);
      expect(ariaTree).not.toContain(hiddenValue);
    }
    await expect(page.getByRole("table")).toHaveCount(0);
    await capture(page, size, "unknown");
    const layout = await page.locator(".kith-codex").evaluate((root) => {
      const box = root.getBoundingClientRect();
      return {
        contained:
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= innerWidth &&
          box.bottom <= innerHeight,
        noHorizontalOverflow: [
          ...root.querySelectorAll(".bestiary-list, .bestiary-detail"),
        ].every((node) => node.scrollWidth <= node.clientWidth),
      };
    });
    expect(layout).toEqual({ contained: true, noHorizontalOverflow: true });
    await options.first().focus();
    await page.keyboard.press("End");
    await expect(options.last()).toBeFocused();
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(options.first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The real encounter action (no forced battle or discovery mutation) records IDs.
    let state = await page.evaluate(() =>
      window.__kithlandsTest.submitAction({ type: "encounter" }, "World"),
    );
    expect(state.phase).toBe("combat");
    expect(
      Object.values(state.discovered).filter(Boolean).length,
    ).toBeGreaterThan(0);
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("Battle"),
    );
    await capture(page, size, "server-encounter");
    for (let round = 0; state.phase === "combat" && round < 30; round++) {
      const actions = state.party.map((member, slot) => ({
        slot,
        type: "attack",
        target_id: state.enemies[0].id,
      }));
      state = await page.evaluate(
        (actions) =>
          window.__kithlandsTest.submitAction(
            { type: "attack", actions },
            "Battle",
          ),
        actions,
      );
    }
    expect(["world", "quest_complete"]).toContain(state.phase);
    const discovered = { ...state.discovered };
    const known = catalog.find((monster) => discovered[monster.id]);
    expect(known).toBeTruthy();
    await openCodex(page, size.width < 600);
    await expect(page.locator(".bestiary-detail h2")).toHaveText(known.name);
    await expect(page.locator(".bestiary-detail img")).toHaveAttribute(
      "alt",
      known.name,
    );
    await expect(page.locator(".bestiary-detail img")).toHaveJSProperty(
      "complete",
      true,
    );
    await expect(page.locator(".bestiary-field-note")).toContainText(
      known.field_note,
    );
    await expect(page.locator(".bestiary-field-guide")).toContainText(
      known.habitats[0],
    );
    await expect(page.locator(".bestiary-field-guide")).toContainText(
      known.tactics,
    );
    if (known.drops.length) {
      const dropTable = page.getByRole("table", {
        name: `${known.name} drop table`,
      });
      await expect(dropTable).toBeVisible();
      await expect(dropTable.locator("tbody tr")).toHaveCount(
        known.drops.length,
      );
      await expect(dropTable).toContainText(`${known.drops[0].chance_pct}%`);
    } else {
      await expect(page.locator(".bestiary-detail")).toContainText(
        "No recorded drops.",
      );
    }
    await expect(
      page
        .locator(".bestiary-stats > div")
        .filter({ has: page.getByText("HP", { exact: true }) }),
    ).toContainText(String(known.hp));
    await expect(
      page
        .locator(".bestiary-stats > div")
        .filter({ has: page.getByText("XP", { exact: true }) }),
    ).toContainText(String(known.xp_reward));
    await capture(page, size, "discovered");
    await page
      .locator(".bestiary-detail")
      .evaluate((detail) => (detail.scrollTop = detail.scrollHeight));
    await capture(page, size, "base-stats");
    await expect(page.locator(".bestiary-detail")).toContainText(
      "Base stats & rewards",
    );
    await expect(page.locator(".bestiary-scaling")).toContainText(
      "Encounter level and difficulty",
    );
    await page.getByRole("tab", { name: "Equipment" }).click();
    await expect(
      page.getByText("Equipment Guide", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Steel Sword", { exact: true })).toHaveCount(1);
    await capture(page, size, "equipment-guide");
    await page.getByRole("tab", { name: "Spells" }).click();
    await expect(page.getByText("Spellbook", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Level 2 · Cure Poison", { exact: true }),
    ).toHaveCount(1);
    await capture(page, size, "spell-guide");
    await page.getByRole("button", { name: "Close codex" }).tap();
    await expect(page.locator(".kith-codex-backdrop")).toHaveCount(0);
    const texts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("World"),
    );
    expect(
      texts.some(({ text }) => text === "CODEX" || text === "Field codex"),
    ).toBe(false);
    const movement = await page.evaluate(() =>
      window.__kithlandsTest.movePlayer("left", "World"),
    );
    expect(movement.moved).toBe(true);
    await capture(page, size, "closed-movement-restored");

    const saveName = `Bestiary ${Date.now()}`;
    const saved = await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name),
      saveName,
    );
    expect(saved.status).toBe("saved");
    const { saves } = await page.evaluate(() =>
      window.__kithlandsTest.listSaves(),
    );
    const save = saves.find((save) => save.name === saveName);
    expect(save).toBeTruthy();
    // Reload the browser to discard all in-memory discovery state, then reload the server save.
    await page.reload();
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(async (email) => {
      const api = await import("/src/api.js");
      const auth = await api.login(email);
      api.setToken(auth.token);
    }, email);
    const loaded = await page.evaluate(
      (id) => window.__kithlandsTest.loadSave(id),
      save.id,
    );
    expect(loaded.discovered).toEqual(discovered);
    await openCodex(page);
    await expect(page.locator(".bestiary-detail h2")).toHaveText(known.name);
    // Restarting the world with an open DOM overlay must dispose its entire lifetime.
    await page.evaluate((id) => window.__kithlandsTest.loadSave(id), save.id);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openCodex(page);
    await page.keyboard.press("h");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const expandedBattle = await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(
        ["bramblehog", "mire_toad", "frosthorn", "ridge_rook"],
        3,
        "World",
      ),
    );
    expect(expandedBattle.enemies.map((enemy) => enemy.monster_id)).toEqual([
      "bramblehog",
      "mire_toad",
      "frosthorn",
      "ridge_rook",
    ]);
    const battleSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(
      battleSnapshot.enemyMembers.map((enemy) => enemy.textureKey).sort(),
    ).toEqual(
      [
        "monster_bramblehog",
        "monster_frosthorn",
        "monster_mire_toad",
        "monster_ridge_rook",
      ].sort(),
    );
    expect(
      battleSnapshot.enemyMembers.every(
        (enemy) =>
          enemy.spriteBounds &&
          enemy.spriteBounds.left >= 0 &&
          enemy.spriteBounds.top >= 0 &&
          enemy.spriteBounds.right <= 800 &&
          enemy.spriteBounds.bottom <= 600,
      ),
    ).toBe(true);
    await capture(page, size, "expanded-monster-battle");
    expect(errors).toEqual([]);
  });
}

test("catalog growth, error retry and closing a pending load", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page, `bestiary_growth_${Date.now()}@kithlands.dev`);
  const catalog = await (await page.request.get("/api/data/monsters")).json();
  await page.route("**/api/data/monsters", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await page.keyboard.press("h");
  await expect(
    page.getByText("The monster catalog could not be loaded."),
  ).toBeVisible();
  await page.unroute("**/api/data/monsters");
  await page.route("**/api/data/monsters", (route) =>
    route.fulfill({
      json: [
        ...catalog,
        { ...catalog[0], id: "future_creature", name: "Future Creature" },
      ],
    }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("option")).toHaveCount(catalog.length + 1);
  await expect(page.locator(".bestiary-summary")).toContainText(
    `0 / ${catalog.length + 1} discovered`,
  );
  await expect(page.getByText("Future Creature")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.unroute("**/api/data/monsters");
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/data/monsters", async (route) => {
    await held;
    await route.fulfill({ json: catalog });
  });
  await page.keyboard.press("h");
  await expect(page.getByText("Loading monster catalog…")).toBeVisible();
  await page.keyboard.press("Escape");
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute("**/api/data/monsters");
  await openCodex(page);
  await expect(page.getByRole("option")).toHaveCount(catalog.length);
});
