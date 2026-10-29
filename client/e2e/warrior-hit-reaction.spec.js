import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { clickRouteText } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/warrior-hit-reaction-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test.describe(`${width} Warrior hit`, () => {
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      reducedMotion: motion,
    });
    test("Go damage recoils, recovers and preserves lethal KO", async ({
      page,
    }) => {
      test.setTimeout(180000);
      await page.emulateMedia({ reducedMotion: motion });
      expect(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ).toBe(motion === "reduce");
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__hitGame=game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `warrior-hit-${width}-${Date.now()}@kithlands.dev`,
      );
      const initial = await page.evaluate(() =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          use_osm: false,
          people: [],
          places: ["Old Mill", "Market", "School"],
          big_building: "Town Hall",
          difficulty: "normal",
          party: [{ name: "Hero", class_id: "warrior" }],
          rng_seed: 6,
        }),
      );
      // Explicit disposable combat fixture; every hit and defeat is resolved by Go.
      const encounter = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["goblin"], 2, "World"),
      );
      expect(encounter.phase).toBe("combat");
      await page.evaluate(() => {
        const game = window.__hitGame,
          scene = game.scene.getScene("Battle");
        const audit = (window.__hitProof = {
          frames: [],
          events: [],
          contacts: [],
          images: {},
          stage: "survive",
        });
        const fx = scene.hitFx.bind(scene);
        scene.hitFx = (...args) => {
          if (args[3] && args[2] > 0 && !args[6]?.missed)
            audit.contacts.push({
              stage: audit.stage,
              at: performance.now(),
              damage: args[2],
            });
          return fx(...args);
        };
        const hit = scene.playPartyHitReaction.bind(scene);
        scene.playPartyHitReaction = (entry, options) => {
          audit.events.push({
            stage: audit.stage,
            at: performance.now(),
            ...options,
            homeX: entry.sprite.x,
            reduced: scene.reducedBattleMotion(),
            mediaReduced: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          });
          return hit(entry, options);
        };
        game.events.on("postrender", () => {
          const hero = scene.partySprites?.Hero?.sprite;
          if (
            !hero?.active ||
            !["hit_reaction", "ko_defeated"].includes(hero.battleState)
          )
            return;
          const event = audit.events.at(-1);
          const state = hero.battleState,
            frame = hero.battleFrameIndex;
          audit.frames.push({
            stage: audit.stage,
            state,
            frame,
            at: performance.now(),
            texture: hero.battleBody.texture.key,
            bodyAngle: hero.battleBody.angle,
            xDelta: hero.x - event.homeX,
            feetOffset: hero.battleBody.y + hero.battleFeetOffset,
            shadowDelta: Math.hypot(
              hero.x - hero.battleShadow.x,
              hero.y - hero.battleShadow.y,
            ),
          });
          audit.images[`${audit.stage}-${state}-${frame}`] ||=
            game.canvas.toDataURL("image/png");
        });
      });
      const ready = () =>
        page.waitForFunction(() => {
          const s = window.__hitGame.scene.getScene("Battle");
          return (
            !s.animating &&
            s.currentMemberIdx === 0 &&
            s.promptText?.getText().startsWith("Hero's turn")
          );
        });
      const guard = async () => {
        await ready();
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/action") &&
            r.request().postDataJSON()?.type === "combat_round",
        );
        if (width === 390) await clickRouteText(page, "DEFEND", "Battle", true);
        else await page.keyboard.press("d");
        const result = await (await response).json();
        expect(result.error).toBeUndefined();
        return result;
      };
      let survivor;
      for (let n = 0; n < 5; n++) {
        survivor = await guard();
        expect(survivor.party[0].hp).toBeGreaterThan(0);
        await ready();
        if (survivor.party[0].hp < initial.party[0].hp) break;
      }
      expect(survivor.party[0].hp).toBeLessThan(initial.party[0].hp);
      const recovered = await page.evaluate(() => {
        const hero =
          window.__hitGame.scene.getScene("Battle").partySprites.Hero.sprite;
        return {
          state: hero.battleState,
          texture: hero.battleBody.texture.key,
        };
      });
      expect(recovered).toEqual({
        state: "idle_guard",
        texture: "battle_warrior_sword_attack_body",
      });
      await page.screenshot({
        path: path.join(proof, `${width}-survived-and-ready.png`),
      });
      // Existing server debug vitals endpoint supplies a one-HP lethal fixture.
      const weakened = await page.evaluate(() =>
        window.__kithlandsTest.setPartyVitals(
          [{ slot: 0, hp: 1, mp: 0 }],
          "Battle",
        ),
      );
      expect(weakened.party[0].hp).toBe(1);
      await page.evaluate(() => {
        window.__hitProof.stage = "lethal";
      });
      let lethal;
      for (let n = 0; n < 5; n++) {
        lethal = await guard();
        if (lethal.phase === "defeat") break;
        await ready();
      }
      expect(lethal.phase).toBe("defeat");
      expect(lethal.party[0].hp).toBe(0);
      await expect(
        page.getByRole("dialog", { name: "PARTY DEFEATED" }),
      ).toBeVisible();
      await page.screenshot({ path: path.join(proof, `${width}-defeat.png`) });
      const data = await page.evaluate(() => window.__hitProof);
      for (const [key, image] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${width}-${key}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      delete data.images;
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify({ ...data, survivor, lethal, errors }, null, 2),
      );
      const survived = data.frames.filter(
        (f) => f.stage === "survive" && f.state === "hit_reaction",
      );
      expect(survived.length).toBeGreaterThan(0);
      expect(survived.some((f) => f.frame === 1)).toBe(true);
      expect(
        survived.every(
          (f) =>
            f.texture === "battle_warrior_sword_hit_body" && f.feetOffset === 0,
        ),
      ).toBe(true);
      expect(data.frames.every((f) => f.shadowDelta < 0.5)).toBe(true);
      const ko = data.frames.filter(
        (f) => f.stage === "lethal" && f.state === "ko_defeated",
      );
      const terminal = ko.filter(
        (f) => f.frame === 2 && f.texture === "battle_warrior_sword_ko_body",
      );
      expect(terminal.length).toBeGreaterThan(1);
      expect(
        terminal.every((f) => f.bodyAngle === 0 && f.feetOffset === 0),
      ).toBe(true);
      expect(terminal.at(-1).at - terminal[0].at).toBeGreaterThan(200);
      expect(ko.at(-1)).toMatchObject({
        frame: 2,
        texture: "battle_warrior_sword_ko_body",
        bodyAngle: 0,
      });
      expect(
        data.frames
          .filter((f) => f.at >= ko[0].at)
          .every((f) => f.state === "ko_defeated"),
      ).toBe(true);
      if (motion === "reduce")
        expect(
          Math.max(...survived.map((f) => Math.abs(f.xDelta))),
        ).toBeLessThan(0.01);
      expect(
        data.events.every(
          (event) =>
            event.reduced === (motion === "reduce") &&
            event.mediaReduced === (motion === "reduce"),
        ),
      ).toBe(true);
      expect(data.contacts).toHaveLength(data.events.length);
      expect(
        data.events.every(
          (event, index) =>
            event.at - data.contacts[index].at >= 0 &&
            event.at - data.contacts[index].at < 40,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
