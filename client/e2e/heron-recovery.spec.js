import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  clickRouteText,
  chooseStoryAction,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/heron-recovery-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });

for (const width of [1440, 390]) {
  test.describe(`${width} Heron recovery`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
      reducedMotion: "no-preference",
    });
    test("native recovery, revisit and reloaded supplies cannot replay rewards", async ({
      page,
    }) => {
      test.setTimeout(1200000);
      page.setDefaultTimeout(15000);
      const touch = width === 390;
      const errors = [],
        requests = [],
        milestones = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/api/game/"))
          requests.push({
            path: new URL(request.url()).pathname,
            body: request.postDataJSON(),
          });
      });
      const state = () =>
        page.evaluate(() => window.__kithlandsTest.gameState());
      const capture = async (label) => {
        milestones.push({ label, state: await state() });
        await page.screenshot({
          path: path.join(
            proof,
            `${width}-${String(milestones.length).padStart(2, "0")}-${label}.png`,
          ),
        });
      };
      const input = async (locator) =>
        touch ? locator.tap() : locator.click();
      const action = (s, id) => s.dungeon.actions.find((a) => a.id === id);
      const count = (s, id) => s.materials.find((m) => m.id === id)?.count || 0;
      const locked = (s) => {
        expect(action(s, "pool-bramblehog").completed).toBe(false);
        for (const id of ["pool-rest", "pool-smithing-cache"])
          expect(action(s, id).available).toBe(false);
        expect(count(s, "bronze_pommel")).toBe(0);
      };
      const enter = async () => {
        const key = await page.evaluate(() =>
          window.__kithlandsTest.activeSceneKey(),
        );
        if (key === "World")
          await input(
            page.getByRole("button", { name: "Old Mill trail", exact: true }),
          );
        else {
          expect(key).toBe("Settlement");
          await clickRouteText(page, "Old Mill trail", key, touch);
        }
        await routeReady(page, "Dungeon");
        await chooseStoryAction(page, "heron-trail", touch);
      };
      const saveResume = async () => {
        await clickRouteText(page, "Party", "Dungeon", touch);
        await input(
          page.getByRole("button", { name: "Exit to main menu", exact: true }),
        );
        await input(
          page.getByRole("button", { name: "Save and exit", exact: true }),
        );
        await expect(
          page.getByRole("main", { name: "Kithlands main menu" }),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByRole("main", { name: "Kithlands main menu" }),
        ).toBeVisible();
        await input(page.getByRole("button", { name: /^Continue/ }));
        await expect(
          page.locator(".title-adventure > .title-save"),
        ).toHaveCount(1);
        await input(page.locator(".title-adventure > .title-save"));
        await routeReady(page, "Dungeon");
      };
      const readyCommand = () =>
        page.waitForFunction(
          () => {
            if (window.__kithlandsTest.activeSceneKey() !== "Battle")
              return true;
            const b = window.__normalRouteGame.scene.getScene("Battle");
            const member =
              b.gameState.party[b.livingMembers[b.currentMemberIdx]];
            return (
              !b.animating &&
              member &&
              b.promptText
                ?.getText()
                .startsWith(`${member.name}'s turn -- choose an action`)
            );
          },
          null,
          { timeout: 90000 },
        );
      try {
        await startNormalRoute(page, 24);
        // Only presentation preferences; normal party, HP, gold, content and rolls.
        await page.evaluate(async () => {
          const { setPref } = await import("/src/systems/prefs.js");
          setPref("battleSpeed", 1);
          setPref("messageSpeed", 6);
        });
        await enter();
        const initial = await state();
        expect(initial.party.every((p) => p.level === 1)).toBe(true);
        locked(initial);
        await capture("guarded-bank");
        await chooseStoryAction(page, "pool-bramblehog", touch);
        await capture(touch ? "before-natural-defeat" : "before-native-flee");
        let choices = 0;
        while (choices++ < 400) {
          await readyCommand();
          if (choices % 20 === 0)
            console.log(
              "heron-recovery-inputs",
              width,
              choices,
              (await state()).party.map((p) => ({ name: p.name, hp: p.hp })),
            );
          if (
            await page.evaluate(
              () => window.__kithlandsTest.activeSceneKey() !== "Battle",
            )
          )
            break;
          const before = await page.evaluate(
            () =>
              window.__normalRouteGame.scene.getScene("Battle")
                .currentMemberIdx,
          );
          if (touch) await clickRouteText(page, "DEFEND", "Battle", true);
          else await page.keyboard.press("f");
          await page.waitForFunction((member) => {
            if (window.__kithlandsTest.activeSceneKey() !== "Battle")
              return true;
            const b = window.__normalRouteGame.scene.getScene("Battle");
            return b.animating || b.currentMemberIdx !== member;
          }, before);
        }
        await routeReady(page, "Dungeon");
        const recovered = await state();
        expect(recovered.gold).toBe(initial.gold);
        expect(recovered.party.map((p) => p.xp)).toEqual(
          initial.party.map((p) => p.xp),
        );
        if (touch) {
          expect(recovered.dungeon.recovered_from_defeat).toBe(true);
          expect(recovered.dungeon.room_id).toBe("approach");
          expect(
            recovered.party.every(
              (p) => p.hp === p.max_hp && p.mp === p.max_mp,
            ),
          ).toBe(true);
          await chooseStoryAction(page, "heron-trail", touch);
        }
        locked(await state());
        await capture("recovered-benefits-still-locked");
        await saveResume();
        locked(await state());
        await capture("locked-bank-after-full-reload");
        await clickRouteText(page, "Retreat", "Dungeon", touch);
        await page.waitForFunction(() =>
          ["World", "Settlement"].includes(
            window.__kithlandsTest.activeSceneKey(),
          ),
        );
        await enter();
        locked(await state());
        await capture("uncleared-bank-revisited");
        await chooseStoryAction(page, "pool-bramblehog", touch);
        await fightNormally(page);
        await routeReady(page, "Dungeon");
        expect(action(await state(), "pool-bramblehog").completed).toBe(true);
        await chooseStoryAction(page, "pool-smithing-cache", touch);
        const claimed = await state();
        expect(count(claimed, "bronze_pommel")).toBe(1);
        expect(count(claimed, "ember_ore") - count(initial, "ember_ore")).toBe(
          8,
        );
        expect(count(claimed, "hardwood") - count(initial, "hardwood")).toBe(2);
        await capture("earned-supplies-once");
        const retained = (s) => ({
          gold: s.gold,
          party: s.party.map((p) => ({
            hp: p.hp,
            mp: p.mp,
            xp: p.xp,
            level: p.level,
          })),
          materials: s.materials,
        });
        await saveResume();
        expect(retained(await state())).toEqual(retained(claimed));
        await capture("claimed-bank-after-full-reload");
        await clickRouteText(page, "Retreat", "Dungeon", touch);
        await page.waitForFunction(() =>
          ["World", "Settlement"].includes(
            window.__kithlandsTest.activeSceneKey(),
          ),
        );
        await enter();
        const revisited = await state();
        expect(revisited.dungeon.description).toContain(
          "quiet after your victory",
        );
        expect(action(revisited, "pool-bramblehog").completed).toBe(true);
        expect(action(revisited, "pool-smithing-cache").available).toBe(false);
        // Rest and repeat visits must not issue a second cache claim or
        // change the saved economy. Backend replay rejection is tested separately.
        const claimsBefore = requests.filter(
          (r) =>
            r.body?.action_id === "pool-smithing-cache" &&
            r.body?.type === "interact",
        ).length;
        expect(claimsBefore).toBe(1);
        const completedLabel = `✓ ${action(revisited, "pool-smithing-cache").label}`;
        for (let index = 0; index < 4; index++) {
          const labels = await page.evaluate(() =>
            window.__kithlandsTest.visibleTexts("Dungeon").map((t) => t.text),
          );
          if (labels.includes(completedLabel)) break;
          await clickRouteText(
            page,
            labels.find((label) => label.startsWith("More routes")),
            "Dungeon",
            touch,
          );
        }
        await clickRouteText(page, completedLabel, "Dungeon", touch);
        await page.waitForFunction(() => {
          const scene = window.__normalRouteGame.scene.getScene("Dungeon");
          return !scene.animating && !scene.path.length && !scene.pendingAction;
        });
        await capture("completed-cache-selected-again");
        expect(
          await page.evaluate(() =>
            window.__kithlandsTest.visibleTexts("Dungeon").map((t) => t.text),
          ),
        ).toContain("Already explored.");
        expect(retained(await state())).toEqual(retained(claimed));
        await chooseStoryAction(page, "pool-rest", touch);
        const rested = await state();
        expect(
          rested.party.every((p) => p.hp === p.max_hp && p.mp === p.max_mp),
        ).toBe(true);
        expect(rested.materials).toEqual(claimed.materials);
        expect(rested.gold).toBe(claimed.gold);
        expect(
          requests.filter(
            (r) =>
              r.body?.action_id === "pool-smithing-cache" &&
              r.body?.type === "interact",
          ),
        ).toHaveLength(claimsBefore);
        await capture("cleared-bank-rest-after-revisit");
        expect(
          requests.some(
            (r) => r.path.includes("debug") || r.body?.debug_no_encounters,
          ),
        ).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        writeFileSync(
          path.join(proof, `${width}-audit.json`),
          JSON.stringify({ milestones, requests, errors }, null, 2),
        );
        await page
          .screenshot({ path: path.join(proof, `${width}-final.png`) })
          .catch(() => {});
        console.log("heron-recovery-proof", proof);
      }
    });
  });
}
