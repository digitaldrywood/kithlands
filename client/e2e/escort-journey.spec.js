import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";
const proof = path.resolve(`tmp/escort-journey-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });
for (const width of [1440, 390]) {
  test.describe(`${width} escort`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
    });
    test("lost traveler follows the return journey and reunites once", async ({
      page,
    }) => {
      test.setTimeout(1200000);
      const state = () =>
        page.evaluate(() => window.__kithlandsTest.gameState());
      const milestones = [];
      const confirm = async () => {
        if (width !== 390) return page.keyboard.press("Enter");
        const canvas = await page.locator("canvas").boundingBox();
        const actionVisible = await page.evaluate(() =>
          window.__normalRouteGame.scene
            .getScene("Town")
            .children.list.some(
              (o) =>
                o.type === "Text" && o.text === "A" && o.visible && o.active,
            ),
        );
        if (!actionVisible) {
          await page.touchscreen.tap(canvas.x + 4, canvas.y + 4);
        }
        const point = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town");
          const l = s.gameplayLayout;
          return {
            x: s._modalLocks?.has("dialogue") ? 400 : l.action.x,
            y: s._modalLocks?.has("dialogue")
              ? l.portrait
                ? l.playfieldBottom - 160
                : 489
              : l.action.y,
            width: s.scale.gameSize.width,
            height: s.scale.gameSize.height,
          };
        });
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await page.touchscreen.tap(
          canvas.x + (canvas.width * point.x) / point.width,
          canvas.y + (canvas.height * point.y) / point.height,
        );
      };
      const readyCommand = () =>
        page.waitForFunction(
          () => {
            if (window.__kithlandsTest.activeSceneKey() !== "Battle")
              return true;
            const b = window.__normalRouteGame.scene.getScene("Battle");
            return (
              !b.animating &&
              b.promptText?.getText().includes("choose an action")
            );
          },
          null,
          { timeout: 90000 },
        );

      const capture = async (stage) => {
        milestones.push({ stage, state: await state() });
        writeFileSync(
          path.join(proof, `${width}-states.json`),
          JSON.stringify(milestones, null, 2),
        );
        await page.screenshot({
          path: path.join(
            proof,
            `${width}-${String(milestones.length).padStart(2, "0")}-${stage}.png`,
          ),
        });
      };
      const saveAndResume = async () => {
        await page.keyboard.press("m");
        await page
          .getByRole("button", { name: "Exit to main menu", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Save and exit", exact: true })
          .click();
        await expect(
          page.getByRole("main", { name: "Kithlands main menu" }),
        ).toBeVisible();
        await expect(
          page.getByRole("status", { name: "Quest reward" }),
        ).toHaveCount(0);
        await page.getByRole("button", { name: /^Continue/ }).click();
        await page.locator(".title-adventure > .title-save").click();
        await routeReady(page, "World");
        return state();
      };
      let joined = false,
        defeatDone = false,
        retreatDone = false;
      const walk = async (key, target) => {
        while ((await walkNormally(page, key, target)) === "Battle") {
          const before = await state();
          if (joined && width === 390 && !defeatDone) {
            const gold = before.gold;
            await capture("escort-travel-defeat-start");
            for (let choice = 0; choice < 300; choice++) {
              await readyCommand();
              if (
                (await page.evaluate(() =>
                  window.__kithlandsTest.activeSceneKey(),
                )) !== "Battle"
              )
                break;
              const member = await page.evaluate(
                () =>
                  window.__normalRouteGame.scene.getScene("Battle")
                    .currentMemberIdx,
              );
              await page.keyboard.press("d");
              await page.waitForFunction((member) => {
                if (window.__kithlandsTest.activeSceneKey() !== "Battle")
                  return true;
                const b = window.__normalRouteGame.scene.getScene("Battle");
                return b.animating || b.currentMemberIdx !== member;
              }, member);
            }
            await routeReady(page, "World");
            const recovered = await state(),
              q = recovered.quests[index];
            expect(q.objectives).toMatchObject({ step: 2, recovery: "defeat" });
            expect(q.objectives.companion).toBeUndefined();
            expect(q.completed).toBe(false);
            expect(recovered.gold).toBe(gold);
            expect(recovered.party.every((p) => p.hp === p.max_hp)).toBe(true);
            await page.waitForFunction(
              () =>
                !window.__normalRouteGame.scene.getScene("World")
                  .escortFollower,
            );
            await capture("escort-defeat-recovered");
            const resumed = await saveAndResume();
            expect(resumed.quests[index].objectives).toEqual(q.objectives);
            await capture("escort-recovery-reloaded");
            joined = false;
            defeatDone = true;
            return "escort-recovered";
          }
          if (joined && width === 1440 && !retreatDone) {
            for (let attempt = 0; attempt < 12; attempt++) {
              await readyCommand();
              if (
                (await page.evaluate(() =>
                  window.__kithlandsTest.activeSceneKey(),
                )) !== "Battle"
              )
                break;
              const response = page.waitForResponse(
                (r) =>
                  r.url().endsWith("/action") &&
                  r.request().postDataJSON()?.type === "flee",
              );
              await page.keyboard.press("f");
              const result = await (await response).json();
              expect(result.error).toBeUndefined();
              if (result.phase === "world") {
                await routeReady(page, "World");
                break;
              }
            }
            await routeReady(page, "World");
            expect((await state()).quests[index].objectives.companion).toBe(
              "lost traveler",
            );
            retreatDone = true;
            await capture("traveler-kept-after-retreat");
          } else {
            await fightNormally(page);
            await capture("travel-battle-won");
          }
        }
      };
      const leaveInterior = async () => {
        await page.keyboard.press("Escape");
        await page.waitForFunction(() =>
          ["World", "Settlement"].includes(
            window.__kithlandsTest.activeSceneKey(),
          ),
        );
        if (
          (await page.evaluate(() =>
            window.__kithlandsTest.activeSceneKey(),
          )) === "Settlement"
        ) {
          await routeReady(page, "Settlement");
          const exit = await page.evaluate(() => {
            const s = window.__normalRouteGame.scene.getScene("Settlement"),
              o = s.model.interactions.find((o) => o.type === "exit");
            return {
              x: Math.floor(o.x / s.model.tileWidth),
              y: Math.floor(o.y / s.model.tileHeight),
            };
          });
          await walk("Settlement", exit);
          await confirm();
        }
        await routeReady(page, "World");
      };
      const approachQuestNpc = async () => {
        const target = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town"),
            grid = s.tileData || s.tiles,
            npc = s.npcs[0],
            queue = [{ x: s.playerX, y: s.playerY }],
            seen = new Set();
          for (let i = 0; i < queue.length; i++) {
            const p = queue[i],
              id = `${p.x},${p.y}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const distance = (n) => Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
            if (
              distance(npc) <= 2 &&
              !s.npcs.slice(1).some((n) => distance(n) < distance(npc)) &&
              !(s.chests || []).some((n) => distance(n) <= 1) &&
              !(s.hiddenItems || []).some((n) => distance(n) <= 1)
            )
              return p;
            for (const [dx, dy] of [
              [1, 0],
              [0, 1],
              [-1, 0],
              [0, -1],
            ]) {
              const n = { x: p.x + dx, y: p.y + dy },
                tile = grid[n.y]?.[n.x];
              if (
                Number.isInteger(tile) &&
                s.canWalkTile(tile) &&
                !s.npcs.some((p) => p.x === n.x && p.y === n.y)
              )
                queue.push(n);
            }
          }
          throw Error("No reachable quest NPC interaction tile");
        });
        await walk("Town", target);
      };

      await startNormalRoute(page, 4);
      // Bounded Act 2 fixture: select an existing generated quest only. No position,
      // money, XP, vitals, quest custody, enemy or encounter mutations. This is not
      // evidence of natural campaign pacing or reaching Act 2 in fifteen minutes.
      const index = await page.evaluate(() =>
        window.__kithlandsTest
          .gameState()
          .quests.findIndex((q) => q.template_id === "Q05"),
      );
      expect(index).toBeGreaterThan(0);
      const fixture = await page.evaluate(
        (i) => window.__kithlandsTest.warpQuest(i),
        index,
      );
      expect(fixture.error).toBeUndefined();
      const quest = fixture.quests[index];
      expect(quest.objectives.step).toBe(0);
      await capture("escort-fixture-before-search");
      for (let n = 0; n < 18; n++) {
        let gs = await state();
        const q = gs.quests[index];
        if (q.completed) break;
        const action = q.actions[q.objectives.step];
        if (action.type === "goto") {
          if (
            (await page.evaluate(() =>
              window.__kithlandsTest.activeSceneKey(),
            )) === "Town"
          )
            await leaveInterior();
          if (joined) {
            await page.waitForFunction(
              () =>
                !!window.__normalRouteGame.scene.getScene("World")
                  .escortFollower,
            );
            await capture("following-in-world");
            const held = q.objectives;
            gs = await saveAndResume();
            expect(gs.quests[index].objectives).toEqual(held);
            await page.waitForFunction(
              () =>
                !!window.__normalRouteGame.scene.getScene("World")
                  .escortFollower,
            );
            await capture("escort-saved-and-reloaded");
          }
          const spawn = await page.evaluate(
            (node) =>
              window.__normalRouteGame.scene
                .getScene("World")
                .spawns.find((s) => s.node_id === node),
            action.location,
          );
          expect(spawn).toBeTruthy();
          if ((await walk("World", spawn)) === "escort-recovered") continue;
          if (joined) {
            const following = await page.evaluate(() => {
              const s = window.__normalRouteGame.scene.getScene("World"),
                f = s.escortFollower;
              return {
                companion:
                  s.gameState.quests[s.gameState.current_quest].objectives
                    .companion,
                distance: Math.hypot(
                  s.player.x - f.sprite.x,
                  s.player.y - f.sprite.y,
                ),
                shadowError: Math.hypot(
                  f.shadow.x - f.sprite.x,
                  f.shadow.y - (f.sprite.y - 2),
                ),
                frame: f.sprite.frame.name,
              };
            });
            expect(following.companion).toBeTruthy();
            expect(following.distance).toBeGreaterThan(5);
            expect(following.distance).toBeLessThan(48);
            expect(following.shadowError).toBeLessThan(0.1);
            await capture("traveler-returned-home");
          }
          await page
            .getByRole("button")
            .filter({ hasText: `— ${spawn.name}` })
            .click();
          await routeReady(page, "Town");
          await capture(`arrival-${action.location}`);
          expect((await state()).quests[index].completed).toBe(false);
        } else {
          await approachQuestNpc();
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith("/action") &&
              r.request().postDataJSON()?.type === "quest_action",
            { timeout: 15000 },
          );
          await confirm();
          const result = await (await response).json();
          expect(result.error).toBeUndefined();
          await page.waitForFunction(() =>
            window.__normalRouteGame.scene
              .getScene("Town")
              ._modalLocks?.has("dialogue"),
          );
          await capture(`interaction-${action.type}`);
          for (let line = 0; line < 12; line++) {
            const texts = await page.evaluate(() =>
              window.__kithlandsTest
                .visibleTexts("Town")
                .map((t) => t.text)
                .join("\n"),
            );
            await confirm();
            await page.waitForFunction(
              (texts) =>
                !window.__normalRouteGame.scene
                  .getScene("Town")
                  ._modalLocks?.has("dialogue") ||
                window.__kithlandsTest
                  .visibleTexts("Town")
                  .map((t) => t.text)
                  .join("\n") !== texts,
              texts,
            );
            if (
              await page.evaluate(
                () =>
                  !window.__normalRouteGame.scene
                    .getScene("Town")
                    ._modalLocks?.has("dialogue"),
              )
            )
              break;
          }
          await page.waitForFunction(
            () =>
              !window.__normalRouteGame.scene.getScene("Town")._modalLocks
                ?.size,
          );
          if (action.type === "escort") {
            joined = true;
            expect(result.quests[index].objectives.companion).toBe(
              "lost traveler",
            );
            await page.waitForFunction(
              () =>
                !!window.__normalRouteGame.scene.getScene("Town")
                  .escortFollower,
            );
            await capture("traveler-joined");
          }
          if (action.type === "report") {
            expect(result.quests[index].completed).toBe(true);
            expect(result.gold).toBe(gs.gold + q.reward.gold);
            expect(result.quests[index].objectives.companion).toBeUndefined();
            await page.waitForFunction(
              () =>
                !window.__normalRouteGame.scene.getScene("Town").escortFollower,
            );
            await capture("reunion-reward");
          }
        }
      }
      expect((await state()).quests[index].completed).toBe(true);
      expect(joined).toBe(true);
      expect(width === 390 ? defeatDone : retreatDone).toBe(true);
    });
  });
}
