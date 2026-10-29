import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clickRouteText } from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";
const proof = path.resolve(`tmp/cinder-melee-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, reduced] of [
  [1440, false],
  [390, false],
  [800, true],
]) {
  test.describe(`${width} Cinder staff strike`, () => {
    test.use({
      viewport: {
        width,
        height: width === 390 ? 844 : width === 800 ? 600 : 900,
      },
      hasTouch: width === 390,
    });
    test("lands at the authored cue with a blunt impact and recovers before a real win", async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__staffGame=game; window.__normalRouteGame=game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `staff-${width}-${Date.now()}@kithlands.dev`,
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
        window.__kithlandsTest.setPartyLevels([{ slot: 0, level: 8 }], "World"),
      );
      const before = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["slime"], 1, "World"),
      );
      const ready = () =>
        page.waitForFunction(() => {
          const scene = window.__staffGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.promptText?.getText().startsWith("Hero's turn")
          );
        });
      await ready();
      await page.evaluate(() => {
        const game = window.__staffGame,
          scene = game.scene.getScene("Battle");
        const audit = (window.__staffAudit = {
          frames: [],
          contacts: [],
          effects: [],
          images: {},
          recovered: false,
        });
        const fx = scene.hitFx.bind(scene);
        scene.hitFx = (x, y, damage, isParty, defeated, type, opts) => {
          const hero = scene.partySprites.Hero?.sprite;
          if (!isParty && type === "physical")
            audit.contacts.push({
              at: performance.now(),
              frame: hero.battleFrameIndex,
              damage,
              missed: !!opts.missed,
              crit: !!opts.crit,
              family: opts.contactFamily,
            });
          return fx(x, y, damage, isParty, defeated, type, opts);
        };
        let wasAttacking = false;
        game.events.on("postrender", () => {
          const hero = scene.partySprites.Hero?.sprite;
          if (!hero?.active) return;
          if (hero.battleState === "physical_attack") {
            wasAttacking = true;
            const weapon = hero.battleWeaponBack?.visible
              ? hero.battleWeaponBack
              : hero.battleWeaponFront;
            const row = {
              at: performance.now(),
              frame: hero.battleFrameIndex,
              texture: hero.battleBody.texture.key,
              feetOffset: hero.battleBody.y + hero.battleFeetOffset,
              angle: hero.battleBody.angle,
              shadowDelta: Math.hypot(
                hero.x - hero.battleShadow.x,
                hero.y - hero.battleShadow.y,
              ),
              reduced: scene.reducedBattleMotion(),
              mediaReduced: matchMedia("(prefers-reduced-motion: reduce)")
                .matches,
              staff: weapon
                ? {
                    visible: weapon.visible,
                    x: weapon.x,
                    y: weapon.y,
                    angle: weapon.angle,
                  }
                : null,
            };
            audit.frames.push(row);
            audit.images[`pose-${row.frame}`] ||=
              game.canvas.toDataURL("image/png");
          } else if (wasAttacking && hero.battleState === "idle_guard") {
            audit.recovered =
              hero.battleBody.texture.key === "battle_cinder_staff_cast_body";
            audit.images.recovered ||= game.canvas.toDataURL("image/png");
          }
          const contact = scene.children.list.find(
            (o) =>
              o.active &&
              o._combatFxTag === "melee-contact" &&
              o._contactFamily === "blunt",
          );
          if (contact) {
            audit.effects.push({
              family: contact._contactFamily,
              scaleX: contact.scaleX,
              scaleY: contact.scaleY,
            });
            audit.images.impact ||= game.canvas.toDataURL("image/png");
          }
        });
      });
      const result = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      if (width === 390) await clickRouteText(page, "ATTACK", "Battle", true);
      else await page.keyboard.press("a");
      const target = page
        .locator(".battle-choice-list button:not(:disabled)")
        .first();
      await expect(page.locator(".battle-choice-panel")).toContainText(
        "Choose enemy",
      );
      if (width === 390) await target.tap();
      else await target.click();
      const struck = await (await result).json();
      expect(struck.error).toBeUndefined();
      const strike = struck.combat_actions.find(
        (a) => a.kind === "attack" && a.actor_name === "Hero",
      );
      expect(strike).toBeTruthy();
      expect(strike.damage).toBeGreaterThan(0);
      if (struck.phase === "combat") {
        await ready();
        const finish = page.waitForResponse(
          (r) =>
            r.url().endsWith("/action") &&
            r.request().postDataJSON()?.type === "combat_round",
        );
        if (width === 390) await clickRouteText(page, "SPELL", "Battle", true);
        else await page.keyboard.press("s");
        const spark = page
          .locator(".battle-choice-list button")
          .filter({ hasText: "Spark" });
        if (width === 390) await spark.tap();
        else await spark.click();
        const enemy = page
          .locator(".battle-choice-list button:not(:disabled)")
          .first();
        await expect(page.locator(".battle-choice-panel")).toContainText(
          "Choose enemy",
        );
        if (width === 390) await enemy.tap();
        else await enemy.click();
        const won = await (await finish).json();
        expect(won.error).toBeUndefined();
        expect(won.phase).not.toBe("combat");
        expect(won.phase).not.toBe("defeat");
      }
      await fightNormally(page);
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
      const audit = await page.evaluate(() => window.__staffAudit);
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(
          { before, struck, ...audit, images: undefined },
          null,
          2,
        ),
      );
      for (const [name, data] of Object.entries(audit.images))
        writeFileSync(
          path.join(proof, `${width}-${name}.png`),
          Buffer.from(data.split(",")[1], "base64"),
        );
      await page.screenshot({ path: path.join(proof, `${width}-world.png`) });
      const hits = strike.hits?.length ? strike.hits : [strike];
      expect(audit.contacts.map((c) => c.damage)).toEqual(
        hits.map((h) => h.damage),
      );
      expect(
        audit.contacts.every((c) => c.frame === 3 && c.family === "blunt"),
      ).toBe(true);
      expect(audit.effects.length).toBeGreaterThan(0);
      expect([...new Set(audit.frames.map((f) => f.frame))]).toEqual(
        reduced ? [1, 3, 5] : [0, 1, 2, 3, 4, 5],
      );
      for (const frame of audit.frames) {
        expect(frame.texture).toBe("battle_cinder_staff_strike_body");
        expect(frame.feetOffset).toBe(0);
        expect(frame.angle).toBe(0);
        expect(frame.shadowDelta).toBeLessThan(0.5);
        expect(frame.staff?.visible).toBe(true);
        expect(frame.reduced).toBe(reduced);
        expect(frame.mediaReduced).toBe(reduced);
      }
      expect(audit.recovered).toBe(true);
      if (reduced)
        expect(
          audit.effects.every((e) => e.scaleX === 1 && e.scaleY === 1),
        ).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
