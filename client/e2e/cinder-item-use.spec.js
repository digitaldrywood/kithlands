import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clickRouteText } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/cinder-item-use-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, reduced] of [
  [1440, false],
  [390, false],
  [800, true],
]) {
  test.describe(`${width} Cinder item gesture`, () => {
    test.use({
      viewport: {
        width,
        height: width === 390 ? 844 : width === 800 ? 600 : 900,
      },
      hasTouch: width === 390,
    });
    test("healing meets the presentation cue and consumes exactly one potion", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__itemGame = game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `item-gesture-${width}-${Date.now()}@kithlands.dev`,
      );
      await page.evaluate(() =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          use_osm: false,
          people: [],
          places: ["Old Mill", "Market"],
          big_building: "Town Hall",
          difficulty: "normal",
          party: [{ name: "Hero", class_id: "cinder" }],
          rng_seed: 6,
        }),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyVitals(
          [{ slot: 0, hp: 10, mp: 0 }],
          "World",
        ),
      );
      const before = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["goblin"], 1, "World"),
      );
      const ready = () =>
        page.waitForFunction(() => {
          const scene = window.__itemGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.currentMemberIdx === 0 &&
            scene.promptText?.getText().startsWith("Hero's turn")
          );
        });
      await ready();
      await page.evaluate(() => {
        const game = window.__itemGame,
          scene = game.scene.getScene("Battle");
        const audit = (window.__itemAudit = {
          frames: [],
          events: [],
          healing: [],
          images: {},
          home: {
            x: scene.partySprites.Hero.sprite.x,
            y: scene.partySprites.Hero.sprite.y,
          },
        });
        const animateHP = scene.animateHPBar.bind(scene);
        scene.animateHPBar = (bar, hp, maxHP) => {
          const actor = scene.partySprites.Hero.sprite;
          if (actor.battleState === "item_use")
            audit.healing.push({ frame: actor.battleFrameIndex, hp, maxHP });
          return animateHP(bar, hp, maxHP);
        };
        const impact = scene.spawnSpellImpact.bind(scene);
        scene.spawnSpellImpact = (entry, element) => {
          const actor = scene.partySprites.Hero.sprite;
          if (actor.battleState === "item_use")
            audit.events.push({
              at: performance.now(),
              state: actor.battleState,
              frame: actor.battleFrameIndex,
              texture: actor.battleBody.texture.key,
              element,
            });
          return impact(entry, element);
        };
        game.events.on("postrender", () => {
          const hero = scene.partySprites.Hero?.sprite;
          if (!hero?.active || hero.battleState !== "item_use") return;
          const row = {
            at: performance.now(),
            frame: hero.battleFrameIndex,
            texture: hero.battleBody.texture.key,
            xDelta: hero.x - audit.home.x,
            yDelta: hero.y - audit.home.y,
            feetOffset: hero.battleBody.y + hero.battleFeetOffset,
            shadowDelta: Math.hypot(
              hero.x - hero.battleShadow.x,
              hero.y - hero.battleShadow.y,
            ),
            bodyAngle: hero.battleBody.angle,
            staffVisible: !!(
              hero.battleWeaponBack?.visible || hero.battleWeaponFront?.visible
            ),
            reduced: scene.reducedBattleMotion(),
            mediaReduced: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          };
          audit.frames.push(row);
          const key = `item-${row.frame}`;
          audit.images[key] ||= game.canvas.toDataURL("image/png");
        });
      });
      if (width === 390) await clickRouteText(page, "ITEMS", "Battle", true);
      else await page.keyboard.press("i");
      const potion = page.getByRole("button", { name: /^Potion ×/ });
      if (width === 390) await potion.tap();
      else await potion.click();
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      const target = page.getByRole("button", { name: /^Hero · 10\// });
      if (width === 390) await target.tap();
      else await target.click();
      const after = await (await response).json();
      expect(after.error).toBeUndefined();
      expect(after.phase).toBe("combat");
      expect(after.items.find((item) => item.id === "potion")?.count || 0).toBe(
        (before.items.find((item) => item.id === "potion")?.count || 0) - 1,
      );
      expect(after.gold).toBe(before.gold);
      expect(
        after.combat_actions.some(
          (action) =>
            action.kind === "item" &&
            action.actor_name === "Hero" &&
            action.target_name === "Hero" &&
            action.damage > 0,
        ),
      ).toBe(true);
      await ready();
      const audit = await page.evaluate(() => window.__itemAudit);
      expect(audit.events).toHaveLength(1);
      expect(audit.healing).toEqual([
        { frame: 2, hp: before.party[0].max_hp, maxHP: before.party[0].max_hp },
      ]);
      expect(audit.events[0]).toMatchObject({
        state: "item_use",
        frame: 2,
        texture: "battle_cinder_staff_item_body",
        element: "holy",
      });
      expect(audit.frames.some((frame) => frame.frame === 2)).toBe(true);
      if (!reduced)
        expect(audit.frames.some((frame) => frame.frame === 1)).toBe(true);
      for (const frame of audit.frames) {
        expect(frame.texture).toBe("battle_cinder_staff_item_body");
        expect(Math.abs(frame.xDelta)).toBeLessThan(0.1);
        expect(Math.abs(frame.yDelta)).toBeLessThan(0.1);
        expect(Math.abs(frame.feetOffset)).toBeLessThan(0.1);
        expect(frame.shadowDelta).toBeLessThan(0.1);
        expect(frame.bodyAngle).toBe(0);
        expect(frame.staffVisible).toBe(frame.frame === 0);
        expect(frame.reduced).toBe(reduced);
        expect(frame.mediaReduced).toBe(reduced);
      }
      expect(
        await page.evaluate(() => {
          const hero =
            window.__itemGame.scene.getScene("Battle").partySprites.Hero.sprite;
          return {
            state: hero.battleState,
            texture: hero.battleBody.texture.key,
            staffVisible: !!(
              hero.battleWeaponBack?.visible || hero.battleWeaponFront?.visible
            ),
          };
        }),
      ).toEqual({
        state: "idle_guard",
        texture: "battle_cinder_staff_cast_body",
        staffVisible: true,
      });
      await page.screenshot({
        path: path.join(proof, `${width}-recovered-guard.png`),
      });
      for (const [name, data] of Object.entries(audit.images))
        writeFileSync(
          path.join(proof, `${width}-${name}.png`),
          Buffer.from(data.split(",")[1], "base64"),
        );
      delete audit.images;
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify({ before, after, audit, errors }, null, 2),
      );
      expect(errors).toEqual([]);
    });
  });
}
