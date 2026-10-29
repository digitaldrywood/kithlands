import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
const proof = path.resolve(`tmp/heron-loop-${Date.now()}`);
mkdirSync(proof, { recursive: true });
const state = (page) => page.evaluate(() => window.__kithlandsTest.gameState());
async function ready(page, key = "Dungeon") {
  await page.waitForFunction(
    (key) => window.__kithlandsTest.activeSceneKey() === key,
    key,
  );
  if (key === "Battle") {
    await page.waitForFunction(
      () => window.__kithlandsTest.visibleTexts("Battle").length > 5,
    );
  } else {
    await page.evaluate(
      (key) => window.__kithlandsTest.waitForSceneReady(key),
      key,
    );
  }
}
async function control(page, label, touch) {
  // Phaser registers rebuilt HUD hit areas on its input update, after scene readiness.
  await ready(page);
  const p = await page.evaluate(
    (label) => window.__kithlandsTest.interactiveTextPosition(label, "Dungeon"),
    label,
  );
  expect(p, `visible ${label} control`).toBeTruthy();
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function choose(page, id, touch) {
  const action = (await state(page)).dungeon.actions.find((a) => a.id === id);
  expect(action).toBeTruthy();
  for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
    const visible = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Dungeon"),
    );
    if (
      visible.some(
        (t) => t.text === action.label || t.text === `✓ ${action.label}`,
      )
    ) {
      await control(page, action.label, touch);
      return action;
    }
    await control(page, "More routes", touch);
  }
  throw new Error(`Action not reachable: ${id}`);
}
async function act(page, id, touch) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/dungeon") &&
      r.request().postDataJSON()?.action_id === id,
    { timeout: 20000 },
  );
  const action = await choose(page, id, touch);
  if (action.encounter?.optional) {
    const fight = page.getByRole("button", { name: "Fight", exact: true });
    if (touch) await fight.tap();
    else {
      await expect(fight).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(fight).toBeFocused();
      await page.keyboard.press("Enter");
    }
  }
  expect((await (await response).json()).error).toBeUndefined();
  await ready(page, action.encounter ? "Battle" : "Dungeon");
}
async function fight(page) {
  let rounds = 0;
  while ((await state(page)).phase === "combat" && rounds < 30) {
    const s = await state(page);
    const target = s.enemies.find((e) => e.hp > 0).id;
    const actions = s.party.flatMap((member, slot) => {
      if (member.hp <= 0) return [];
      const spark = member.spells?.find(
        (sp) =>
          sp.id === "spark" && sp.castable_in_combat && sp.mp_cost <= member.mp,
      );
      return [
        {
          slot,
          type: spark ? "spell" : "attack",
          spell_id: spark?.id,
          target_id: target,
        },
      ];
    });
    const result = await page.evaluate(
      (actions) =>
        window.__kithlandsTest.submitAction(
          { type: "attack", actions },
          "Battle",
        ),
      actions,
    );
    expect(result.error).toBeUndefined();
    rounds++;
  }
  await ready(page);
  return rounds;
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width} Heron loop`, () => {
    test.use({
      viewport,
      hasTouch: viewport.width === 390,
      reducedMotion: "no-preference",
    });
    test("optional fight, crafted choice and saved consequence in normal game", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const touch = viewport.width === 390;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const capture = (label) =>
        page.screenshot({
          path: path.join(proof, `${viewport.width}-${label}.png`),
          fullPage: true,
        });
      // Ordinary quick-start party and economy; encounters remain enabled.
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__heronGame = game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() =>
        window.__kithlandsTest?.sceneIsActive("Title"),
      );
      await page.evaluate(() => window.__kithlandsTest.startQuickGame());
      await ready(page, "World");
      const started = Date.now();
      await page
        .getByRole("button", { name: "Old Mill trail", exact: true })
        .click();
      await ready(page);
      await act(page, "heron-trail", touch);
      await capture("optional-bank-before");
      const before = await state(page);
      await choose(page, "pool-bramblehog", touch);
      const preview = page.getByRole("dialog", {
        name: "Optional encounter",
        exact: true,
      });
      await expect(preview).toBeVisible();
      await expect(preview).toContainText("Level 2");
      await expect(preview.locator(".encounter-enemy")).toHaveCount(1);
      await expect(
        preview.getByRole("button", { name: /Back to the trail/ }),
      ).toHaveAttribute("aria-keyshortcuts", "Escape");
      await capture("encounter-preview");
      if (!touch) {
        await page.keyboard.press("Tab");
        await expect(
          preview.getByRole("button", { name: "Fight", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(
          preview.getByRole("button", { name: /Back to the trail/ }),
        ).toBeFocused();
      }
      if (touch)
        await preview.getByRole("button", { name: /Back to the trail/ }).tap();
      else await page.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
      expect((await state(page)).phase).toBe("world");
      expect((await state(page)).gold).toBe(before.gold);
      await act(page, "pool-bramblehog", touch);
      await capture("real-battle");
      // Render one complete authoritative round, including real contact frames.
      await page.evaluate(() => {
        window.__heronFrames = [];
        const scene = window.__heronGame.scene.getScene("Battle");
        window.__heronCapture = () => {
          if (window.__heronFrames.length >= 3) return;
          if (
            scene.children.list.some(
              (o) => o.active && o._combatFxTag === "melee-contact",
            )
          )
            window.__heronFrames.push(
              window.__heronGame.canvas.toDataURL("image/png"),
            );
        };
        window.__heronGame.events.on("postrender", window.__heronCapture);
        window.__kithlandsTest.startAuthoritativeBattleRound("spell");
      });
      await page.waitForFunction(
        () => !window.__kithlandsTest.sceneFlags("Battle").animating,
        { timeout: 60000 },
      );
      const frames = await page.evaluate(() => {
        window.__heronGame.events.off("postrender", window.__heronCapture);
        return window.__heronFrames;
      });
      expect(frames.length).toBeGreaterThan(0);
      frames.forEach((frame, i) =>
        writeFileSync(
          path.join(proof, `${viewport.width}-real-contact-${i}.png`),
          Buffer.from(frame.split(",")[1], "base64"),
        ),
      );
      await capture("after-rendered-round");
      const rounds = 1 + (await fight(page));
      await act(page, "pool-smithing-cache", touch);
      const count = (s, id) => s.materials.find((m) => m.id === id)?.count || 0;
      expect(count(await state(page), "bronze_pommel")).toBe(1);
      await capture("supplies-and-cleared-bank");
      await control(page, "Party", touch);
      await page.getByRole("button", { name: /Crafting/i }).click();
      const crafting = page.getByRole("dialog", {
        name: "Crafting",
        exact: true,
      });
      await crafting
        .getByRole("button", {
          name: "Forge Balanced Trail Sword",
          exact: true,
        })
        .click();
      await expect(crafting.locator(".craft-preview")).toContainText(
        "Balanced bronze pommel",
      );
      await capture("precision-recipe");
      await crafting
        .locator(".craft-ingredient")
        .filter({ hasText: "Balanced bronze pommel" })
        .scrollIntoViewIfNeeded();
      await capture("rare-component-source");
      await crafting.locator(".craft-confirm").click();
      await expect(crafting.getByRole("status")).toContainText(
        "Forge Balanced Trail Sword complete",
      );
      await crafting
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.evaluate(() =>
        window.__kithlandsTest.clickMenuButton("CHARACTER", "Dungeon"),
      );
      await page.locator('[data-slot-id="main_hand"]').click();
      await page
        .locator(".equipment-item-row:not(.is-disabled)")
        .filter({ hasText: "Balanced Trail Sword" })
        .click();
      await page
        .getByRole("button", { name: "Equip in Weapon", exact: true })
        .click();
      const slot = page.locator('[data-slot-id="main_hand"]');
      await expect(slot).toContainText("Balanced Trail Sword");
      await expect(slot.locator("img.equipment-item-art")).toHaveAttribute(
        "src",
        "/sprites/items/crafted/iron-sword.png",
      );
      await capture("precision-blade-equipped");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await capture("after-equipment-close");
      await act(page, "pool-rest", touch);
      const restored = await state(page);
      expect(restored.party.every((p) => p.hp === p.max_hp)).toBe(true);
      const receipt = await page.evaluate(() =>
        window.__kithlandsTest.saveGame("Heron proof", "Dungeon"),
      );
      expect(receipt.error).toBeUndefined();
      const saves = await page.evaluate(() =>
        window.__kithlandsTest.listSaves(),
      );
      const save = saves.saves.find((s) => s.name === "Heron proof");
      expect(save).toBeTruthy();
      await page.evaluate((id) => window.__kithlandsTest.loadSave(id), save.id);
      await ready(page);
      const loaded = await state(page);
      expect(loaded.dungeon.description).toContain("quiet after your victory");
      expect(count(loaded, "bronze_pommel")).toBe(0);
      expect(
        loaded.dungeon.actions.find((a) => a.id === "pool-bramblehog")
          .completed,
      ).toBe(true);
      expect(
        loaded.dungeon.actions.find((a) => a.id === "pool-smithing-cache")
          .available,
      ).toBe(false);
      await capture("saved-cleared-bank");
      await act(page, "pool-return", touch);
      await act(page, "trail-bats", touch);
      await fight(page);
      await act(page, "mill-door", touch);
      expect((await state(page)).dungeon.room_id).toBe("receiving");
      await capture("crafted-blade-tested-mill-entry");
      writeFileSync(
        path.join(proof, `${viewport.width}-flow.json`),
        JSON.stringify(
          {
            elapsedMs: Date.now() - started,
            rounds,
            final: await state(page),
            errors,
          },
          null,
          2,
        ),
      );
      expect(errors).toEqual([]);
    });
  });
}
