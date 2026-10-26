import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { clickRouteText } from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/cinder-ko-revive-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 390]) {
  test.describe(`${width} Cinder revival`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
    });
    test("holds fallen body across rounds until a real Phoenix Down restores guard", async ({
      page,
    }) => {
      test.setTimeout(180000);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__koGame=game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `cinder-revive-${width}-${Date.now()}@kithlands.dev`,
      );
      await page.evaluate(() =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          use_osm: false,
          people: [],
          places: ["Old Mill", "Market", "School"],
          big_building: "Town Hall",
          difficulty: "normal",
          party: [
            { name: "Hero", class_id: "cinder" },
            { name: "Willow", class_id: "mender" },
          ],
          rng_seed: 6,
        }),
      );
      // Explicit server-owned setup for a scarce revival item and lethal target.
      await page.evaluate(() =>
        window.__kithlandsTest.debugGiveItem("phoenix_down", 1, "World"),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyVitals(
          [{ slot: 0, hp: 1, mp: 0 }],
          "World",
        ),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["goblin"], 2, "World"),
      );
      const ready = (index) =>
        page.waitForFunction((index) => {
          const s = window.__koGame.scene.getScene("Battle"),
            slot = s.livingMembers?.[index];
          return (
            !s.animating &&
            s.currentMemberIdx === index &&
            s.promptText
              ?.getText()
              .startsWith(`${s.gameState.party[slot]?.name}'s turn`)
          );
        }, index);
      const pose = () =>
        page.evaluate(() => {
          const hero =
            window.__koGame.scene.getScene("Battle").partySprites.Hero.sprite;
          return {
            state: hero.battleState,
            texture: hero.battleBody.texture.key,
            frame: hero.battleFrameIndex,
            angle: hero.battleBody.angle,
          };
        });
      let dead;
      const rounds = [];
      for (let round = 0; round < 6; round++) {
        await ready(0);
        const living = await page.evaluate(
          () =>
            window.__kithlandsTest
              .gameState("Battle")
              .party.filter((p) => p.hp > 0).length,
        );
        const result = page.waitForResponse(
          (r) =>
            r.url().endsWith("/action") &&
            r.request().postDataJSON()?.type === "combat_round",
        );
        for (let index = 0; index < living; index++) {
          await ready(index);
          if (width === 390)
            await clickRouteText(page, "DEFEND", "Battle", true);
          else await page.keyboard.press("d");
        }
        dead = await (await result).json();
        rounds.push(dead);
        expect(dead.error).toBeUndefined();
        expect(dead.phase).toBe("combat");
        await ready(0);
        if (dead.party[0].hp === 0) break;
      }
      expect(dead.party[0].hp).toBe(0);
      expect(dead.items.find((item) => item.id === "phoenix_down")?.count).toBe(
        1,
      );
      expect(dead.party[1].hp).toBeGreaterThan(0);
      const fallen = {
        state: "ko_defeated",
        texture: "battle_cinder_staff_ko_body",
        frame: 2,
        angle: 0,
      };
      expect(await pose()).toEqual(fallen);
      await page.waitForTimeout(250);
      expect(await pose()).toEqual(fallen);
      await page.screenshot({
        path: path.join(proof, `${width}-held-fallen.png`),
      });
      if (width === 390) await clickRouteText(page, "ITEMS", "Battle", true);
      else await page.keyboard.press("i");
      const item = page.getByRole("button", { name: /^Phoenix Down/ });
      if (width === 390) await item.tap();
      else await item.click();
      await expect(page.locator(".battle-choice-panel")).toContainText(
        "Choose ally",
      );
      const revivedResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      const heroTarget = page.getByRole("button", { name: /^Hero · 0\// });
      if (width === 390) await heroTarget.tap();
      else await heroTarget.click();
      const revived = await (await revivedResponse).json();
      expect(revived.error).toBeUndefined();
      expect(revived.party[0].hp).toBe(1);
      expect(
        revived.items.find((item) => item.id === "phoenix_down")?.count || 0,
      ).toBe(0);
      expect(revived.gold).toBe(dead.gold);
      expect(
        revived.combat_actions.some(
          (a) => a.kind === "item" && a.target_name === "Hero",
        ),
      ).toBe(true);
      await ready(0);
      expect(await pose()).toEqual({
        state: "idle_guard",
        texture: "battle_cinder_staff_cast_body",
        frame: 0,
        angle: 0,
      });
      await page.screenshot({
        path: path.join(proof, `${width}-revived-guard.png`),
      });
      writeFileSync(
        path.join(proof, `${width}-results.json`),
        JSON.stringify({ rounds, revived, errors }, null, 2),
      );
      expect(errors).toEqual([]);
    });
  });
}
