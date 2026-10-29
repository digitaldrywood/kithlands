import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  chooseStoryAction,
  clickRouteText,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/cinder-defend-route-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });
for (const [width, reduced] of [
  [1440, false],
  [390, false],
  [800, true],
]) {
  test.describe(`${width} fresh Cinder guard`, () => {
    test.use({
      viewport: {
        width,
        height: width === 390 ? 844 : width === 800 ? 600 : 900,
      },
      hasTouch: width === 390,
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    test("normal Old Mill encounter braces then returns to usable combat and exploration", async ({
      page,
    }) => {
      test.setTimeout(240000);
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await startNormalRoute(page, 6);
      const trail = page.getByRole("button", {
        name: "Old Mill trail",
        exact: true,
      });
      if (width === 390) await trail.tap();
      else await trail.click();
      await routeReady(page, "Dungeon");
      await chooseStoryAction(page, "heron-trail", width === 390);
      await chooseStoryAction(page, "pool-bramblehog", width === 390);
      await page.evaluate(() => {
        window.__defendRouteProof = { frames: [], images: {} };
        let previous = "";
        const game = window.__normalRouteGame;
        window.__defendRouteCapture = () => {
          const hero =
            game.scene.getScene("Battle").partySprites?.Sparks?.sprite;
          if (hero?.battleState !== "defend") return;
          const frame = hero.battleFrameIndex;
          if (String(frame) === previous) return;
          previous = String(frame);
          window.__defendRouteProof.frames.push({
            frame,
            at: performance.now(),
            texture: hero.battleBody.texture.key,
            bodyX: hero.battleBody.x,
            angle: hero.battleBody.angle,
            reduced: game.scene.getScene("Battle").reducedBattleMotion(),
            mediaReduced: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
            staff: (() => {
              const weapon = hero.battleWeaponBack?.visible
                ? hero.battleWeaponBack
                : hero.battleWeaponFront;
              return weapon
                ? {
                    visible: weapon.visible,
                    x: weapon.x,
                    y: weapon.y,
                    angle: weapon.angle,
                    texture: weapon.texture?.key,
                  }
                : null;
            })(),
            feetOffset: hero.battleBody.y + hero.battleFeetOffset,
            shadowDelta: Math.hypot(
              hero.x - hero.battleShadow.x,
              hero.y - hero.battleShadow.y,
            ),
          });
          window.__defendRouteProof.images[frame] ||=
            game.canvas.toDataURL("image/png");
        };
        game.events.on("postrender", window.__defendRouteCapture);
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const scene = window.__normalRouteGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.currentMemberIdx === slot &&
            scene.promptText
              ?.getText()
              .startsWith(`${scene.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      for (let slot = 0; slot < 4; slot++) {
        await ready(slot);
        if (width === 390) await clickRouteText(page, "DEFEND", "Battle", true);
        else await page.keyboard.press("d");
      }
      const guarded = await (await response).json();
      expect(guarded.error).toBeUndefined();
      expect(
        guarded.combat_actions.filter((a) => a.kind === "defend"),
      ).toHaveLength(4);
      await ready(0);
      const data = await page.evaluate(() => {
        const game = window.__normalRouteGame;
        game.events.off("postrender", window.__defendRouteCapture);
        const hero = game.scene.getScene("Battle").partySprites.Sparks.sprite;
        return {
          ...window.__defendRouteProof,
          idle: {
            state: hero.battleState,
            texture: hero.battleBody.texture.key,
          },
        };
      });
      expect([...new Set(data.frames.map((f) => f.frame))]).toEqual(
        reduced ? [1, 2, 0] : [0, 1, 2],
      );
      expect(
        data.frames.every(
          (f) =>
            f.texture === "battle_cinder_staff_defend_body" &&
            f.feetOffset === 0 &&
            f.bodyX === 0 &&
            f.angle === 0 &&
            f.reduced === reduced &&
            f.mediaReduced === reduced &&
            f.staff?.visible === true &&
            f.staff.texture === "battle_weapon_war_staff" &&
            f.shadowDelta < 0.5,
        ),
      ).toBe(true);
      expect(data.idle).toEqual({
        state: "idle_guard",
        texture: "battle_cinder_staff_cast_body",
      });
      for (const [frame, image] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${width}-brace-${frame}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      delete data.images;
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify({ ...data, guarded }, null, 2),
      );
      await page.screenshot({
        path: path.join(proof, `${width}-idle-after-guard.png`),
      });
      await fightNormally(page);
      await routeReady(page, "Dungeon");
      expect(
        await page.evaluate(
          () => window.__kithlandsTest.gameState("Dungeon").active_dungeon_id,
        ),
      ).toBe("old-mill");
      await page.screenshot({
        path: path.join(proof, `${width}-returned-to-trail.png`),
      });
      expect(errors).toEqual([]);
    });
  });
}
