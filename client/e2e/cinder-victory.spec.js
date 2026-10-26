import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clickRouteText } from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/cinder-victory-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, reduced] of [
  [1440, false],
  [390, false],
  [800, true],
]) {
  test.describe(`${width} Cinder victory`, () => {
    test.use({
      viewport: {
        width,
        height: width === 390 ? 844 : width === 800 ? 600 : 900,
      },
      hasTouch: width === 390,
    });
    test("celebrates a real win with planted feet before the native receipt and return", async ({
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
          body: `${await response.text()}\nwindow.__victoryGame = game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `victory-${width}-${Date.now()}@kithlands.dev`,
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
      // Disposable high-level fixture isolates celebration, not opening pacing.
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyLevels([{ slot: 0, level: 8 }], "World"),
      );
      const before = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["slime"], 1, "World"),
      );
      await page.waitForFunction(() => {
        const s = window.__victoryGame.scene.getScene("Battle");
        return (
          !s.animating && s.promptText?.getText().startsWith("Hero's turn")
        );
      });
      await page.evaluate(() => {
        const game = window.__victoryGame;
        const audit = (window.__victoryAudit = {
          frames: [],
          images: {},
          receiptDuringPose: false,
        });
        game.events.on("postrender", () => {
          const scene = game.scene.getScene("Battle"),
            hero = scene.partySprites?.Hero?.sprite;
          if (!hero?.active || hero.battleState !== "victory") return;
          audit.home ||= { x: hero.x, y: hero.y };
          const row = {
            at: performance.now(),
            frame: hero.battleFrameIndex,
            texture: hero.battleBody.texture.key,
            staffVisible: !!(
              hero.battleWeaponBack?.visible || hero.battleWeaponFront?.visible
            ),
            xDelta: hero.x - audit.home.x,
            yDelta: hero.y - audit.home.y,
            feetOffset: hero.battleBody.y + hero.battleFeetOffset,
            bodyAngle: hero.battleBody.angle,
            shadowDelta: Math.hypot(
              hero.x - hero.battleShadow.x,
              hero.y - hero.battleShadow.y,
            ),
            reduced: scene.reducedBattleMotion(),
            mediaReduced: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          };
          audit.frames.push(row);
          audit.receiptDuringPose ||=
            !!document.querySelector(".victory-receipt");
          audit.images[`pose-${row.frame}`] ||=
            game.canvas.toDataURL("image/png");
        });
      });
      const result = page.waitForResponse(
        (response) =>
          response.url().endsWith("/action") &&
          response.request().postDataJSON()?.type === "combat_round",
      );
      if (width === 390) await clickRouteText(page, "SPELL", "Battle", true);
      else await page.keyboard.press("s");
      const spark = page
        .locator(".battle-choice-list button")
        .filter({ hasText: "Spark" });
      await expect(spark).toHaveCount(1);
      if (width === 390) await spark.tap();
      else await spark.click();
      const target = page
        .locator(".battle-choice-list button:not(:disabled)")
        .first();
      await expect(page.locator(".battle-choice-panel")).toContainText(
        "Choose enemy",
      );
      if (width === 390) await target.tap();
      else await target.click();
      const won = await (await result).json();
      expect(won.error).toBeUndefined();
      expect(
        won.combat_actions.some(
          (action) =>
            action.actor_name === "Hero" &&
            action.action_id === "spark" &&
            action.damage > 0,
        ),
      ).toBe(true);
      expect(won.party[0].mp).toBeLessThan(before.party[0].mp);
      expect(won.phase).not.toBe("combat");
      expect(won.phase).not.toBe("defeat");
      expect(won.gold).toBeGreaterThan(before.gold);
      expect(won.party[0].xp).toBeGreaterThan(before.party[0].xp);
      // The authoritative win arrives before normal-motion playback finishes.
      // Wait for its native handoff, including any equipment-loot choice.
      await page.waitForFunction(
        () =>
          document.querySelector(".battle-loot-keep") ||
          window.__victoryGame.scene.getScene("Battle").victoryContinueShown,
        null,
        { timeout: 15000 },
      );
      while (await page.locator(".battle-loot-keep").count())
        await page.locator(".battle-loot-keep").click();
      await expect(
        page.getByRole("dialog", { name: "VICTORY!", exact: true }),
      ).toBeVisible();
      const audit = await page.evaluate(() => window.__victoryAudit);
      expect(audit.receiptDuringPose).toBe(false);
      expect(audit.frames.some((frame) => frame.frame === 2)).toBe(true);
      expect(audit.frames.some((frame) => frame.frame === 1)).toBe(true);
      for (const frame of audit.frames) {
        expect(frame.texture).toBe("battle_cinder_staff_victory_body");
        expect(frame.staffVisible).toBe(true);
        for (const key of [
          "xDelta",
          "yDelta",
          "feetOffset",
          "bodyAngle",
          "shadowDelta",
        ])
          expect(Math.abs(frame[key])).toBeLessThan(0.1);
        expect(frame.reduced).toBe(reduced);
        expect(frame.mediaReduced).toBe(reduced);
      }
      await page.screenshot({ path: path.join(proof, `${width}-receipt.png`) });
      const acknowledged = page.waitForResponse(
        (response) =>
          response.url().endsWith("/action") &&
          response.request().postDataJSON()?.type === "battle_continue",
      );
      const proceed = page.locator(".victory-continue");
      if (width === 390) await proceed.tap();
      else {
        await proceed.focus();
        await page.keyboard.press("Enter");
      }
      const continued = await (await acknowledged).json();
      expect(continued.phase).toBe("world");
      expect(continued.gold).toBe(won.gold);
      expect(continued.party[0].xp).toBe(won.party[0].xp);
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
      await expect(page.locator(".victory-receipt")).toHaveCount(0);
      await page.screenshot({ path: path.join(proof, `${width}-world.png`) });
      for (const [name, data] of Object.entries(audit.images))
        writeFileSync(
          path.join(proof, `${width}-${name}.png`),
          Buffer.from(data.split(",")[1], "base64"),
        );
      delete audit.images;
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify({ before, won, continued, audit, errors }, null, 2),
      );
      expect(errors).toEqual([]);
    });
  });
}
