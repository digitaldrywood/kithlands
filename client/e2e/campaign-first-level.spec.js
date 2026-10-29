import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";
const proof = path.resolve(`tmp/campaign-first-level-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on", reducedMotion: "no-preference" });

// Fixed ordinary campaign seeds cover the trail encounter and parcel handoff.
// Only RNG is selected; starting money, resources, XP and encounters are unchanged.
for (const { width, seed } of [
  { width: 1440, seed: 6 },
  { width: 390, seed: 6 },
  { width: 800, seed: 4 },
]) {
  test.describe(`${width} campaign`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
    });
    test("a normal first quest earns a natural level-up", async ({ page }) => {
      test.setTimeout(600000);
      page.setDefaultTimeout(15000);
      const started = Date.now(),
        milestones = [],
        errors = [],
        requests = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/game/"))
          requests.push({
            path: new URL(r.url()).pathname,
            body: r.postDataJSON(),
          });
      });
      const state = () =>
        page.evaluate(() => window.__kithlandsTest.gameState());
      const capture = async (stage) => {
        const gs = await state();
        milestones.push({
          stage,
          seconds: (Date.now() - started) / 1000,
          phase: gs.phase,
          location: gs.current_location,
          gold: gs.gold,
          party: gs.party.map((p) => ({
            name: p.name,
            level: p.level,
            xp: p.xp,
            hp: p.hp,
            mp: p.mp,
          })),
          currentQuest: gs.current_quest,
          quests: gs.quests,
        });
        writeFileSync(
          path.join(proof, `${width}-milestones.json`),
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
      const walk = async (key, target) => {
        while ((await walkNormally(page, key, target)) === "Battle") {
          await fightNormally(page);
          await capture("travel-battle-won");
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
          await page.keyboard.press("Enter");
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
      try {
        await startNormalRoute(page, seed);
        const initial = await state(),
          quest = initial.quests[initial.current_quest];
        expect(initial.party.every((p) => p.level === 1)).toBe(true);
        await capture("fresh-campaign");
        for (let step = 0; step < 12; step++) {
          let gs = await state();
          if (gs.quests.find((q) => q.id === quest.id)?.completed) break;
          const q = gs.quests[gs.current_quest],
            action = q.objectives ? q.actions[q.objectives.step] : null;
          if (!action || action.type === "goto") {
            if (
              (await page.evaluate(() =>
                window.__kithlandsTest.activeSceneKey(),
              )) === "Town"
            )
              await leaveInterior();
            const node = action?.location || q.target_node_id;
            const spawn = await page.evaluate(
              (node) =>
                window.__normalRouteGame.scene
                  .getScene("World")
                  .spawns.find((s) => s.node_id === node),
              node,
            );
            expect(spawn, `quest location ${node}`).toBeTruthy();
            await walk("World", spawn);
            const gather = page.getByRole("button", { name: /^Gather —/ });
            if (await gather.count()) await gather.click();
            const entrance = page
              .getByRole("button")
              .filter({ hasText: `— ${spawn.name}` });
            if (q.template_id === "Q04" && q.objectives.step <= 1) {
              await expect(entrance).toContainText(q.actions[1].prompt);
              await capture("trail-approach");
            }
            await entrance.click();
            await page.waitForFunction(() =>
              ["Town", "Settlement", "Battle"].includes(
                window.__kithlandsTest.activeSceneKey(),
              ),
            );
            if (
              (await page.evaluate(() =>
                window.__kithlandsTest.activeSceneKey(),
              )) === "Battle"
            ) {
              const fighting = await state();
              expect(fighting.quests[0].objectives.step).toBe(1);
              expect(fighting.quests[0].completed).toBe(false);
              await capture("trail-quest-fight");
              if (width === 390) {
                // Deliberately defend until the real enemies win. No HP fixture.
                for (let choice = 0; choice < 200; choice++) {
                  await page.waitForFunction(() => {
                    if (window.__kithlandsTest.activeSceneKey() !== "Battle")
                      return true;
                    const b = window.__normalRouteGame.scene.getScene("Battle");
                    return (
                      !b.animating &&
                      b.promptText?.getText().includes("choose an action")
                    );
                  });
                  if (
                    (await page.evaluate(() =>
                      window.__kithlandsTest.activeSceneKey(),
                    )) !== "Battle"
                  )
                    break;
                  const beforeChoice = await page.evaluate(
                    () =>
                      window.__normalRouteGame.scene.getScene("Battle")
                        .currentMemberIdx,
                  );
                  await page.keyboard.press("d");
                  await page.waitForFunction((before) => {
                    if (window.__kithlandsTest.activeSceneKey() !== "Battle")
                      return true;
                    const b = window.__normalRouteGame.scene.getScene("Battle");
                    return b.animating || b.currentMemberIdx !== before;
                  }, beforeChoice);
                }
                await routeReady(page, "World");
                const recovered = await state();
                expect(recovered.phase).toBe("world");
                expect(recovered.quests[0].objectives.step).toBe(1);
                expect(recovered.quests[0].objectives.recovery).toBe("defeat");
                expect(recovered.quests[0].completed).toBe(false);
                expect(recovered.party.every((p) => p.hp === p.max_hp)).toBe(
                  true,
                );
                expect(recovered.gold).toBe(fighting.gold);
                await capture("quest-defeat-recovered");
                await page
                  .getByRole("button")
                  .filter({ hasText: `— ${spawn.name}` })
                  .click();
                await routeReady(page, "Battle");
                expect(
                  (await state()).quests[0].objectives.recovery,
                ).toBeUndefined();
                await capture("quest-retry");
              }
              await fightNormally(page);
              const cleared = await state();
              expect(cleared.quests[0].objectives.step).toBe(2);
              expect(cleared.quests[0].objectives.clue).toBeTruthy();
              expect(cleared.quests[0].completed).toBe(false);
              await capture("trail-cleared-report-pending");
              if (width === 1440) {
                const resumed = await saveAndResume();
                expect(resumed.quests[0].objectives).toEqual(
                  cleared.quests[0].objectives,
                );
                expect(resumed.quests[0].completed).toBe(false);
                expect(resumed.gold).toBe(cleared.gold);
                expect(resumed.party.map((p) => [p.level, p.xp])).toEqual(
                  cleared.party.map((p) => [p.level, p.xp]),
                );
                await capture("pending-report-reloaded");
              }
              continue;
            }
            gs = await state();
            if (gs.quests.find((q) => q.id === quest.id)?.completed) {
              await capture("quest-reward-arrival");
              break;
            }
            expect(
              await page.evaluate(() =>
                window.__kithlandsTest.activeSceneKey(),
              ),
              "objective location has an accessible NPC interior",
            ).toBe("Town");
            await routeReady(page, "Town");
            await capture(`arrived-${node}`);
          } else {
            expect(
              await page.evaluate(() =>
                window.__kithlandsTest.activeSceneKey(),
              ),
            ).toBe("Town");
            await approachQuestNpc();
            const response = page.waitForResponse(
              (r) =>
                r.url().endsWith("/action") &&
                r.request().postDataJSON()?.type === "quest_action",
            );
            await page.keyboard.press("Enter");
            const result = await (await response).json();
            expect(result.error).toBeUndefined();
            await page.waitForFunction(() =>
              window.__normalRouteGame.scene
                .getScene("Town")
                ._modalLocks?.has("dialogue"),
            );
            for (let line = 0; line < 12; line++) {
              const texts = await page.evaluate(() =>
                window.__kithlandsTest
                  .visibleTexts("Town")
                  .map((t) => t.text)
                  .join("\n"),
              );
              await page.keyboard.press("Enter");
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
            await capture(`objective-${action.type}`);
          }
        }
        const final = await state();
        expect(final.quests.find((q) => q.id === quest.id).completed).toBe(
          true,
        );
        expect(final.party.every((p) => p.level > 1)).toBe(true);
        expect(final.gold).toBeGreaterThanOrEqual(
          initial.gold + quest.reward.gold,
        );
        const rewardNotice = page.getByRole("status", { name: "Quest reward" });
        await expect(rewardNotice).toBeVisible();
        await expect(rewardNotice).toContainText(quest.name);
        await expect(rewardNotice).toContainText(`+${quest.reward.xp} XP`);
        for (const member of final.party)
          await expect(rewardNotice).toContainText(
            `${member.name} · Level ${member.level}`,
          );
        await capture("natural-level-up");
        await page.waitForTimeout(2000); // Verify a readable full-opacity hold.
        await expect(rewardNotice).toHaveCSS("opacity", "1");
        await capture("reward-held");
        if (width === 390) {
          const beforeDismiss = requests.length;
          await rewardNotice
            .getByRole("button", { name: "Dismiss quest reward" })
            .focus();
          await page.keyboard.press("Enter");
          await expect(rewardNotice).toHaveCount(0);
          expect(requests.length).toBe(beforeDismiss);
          await capture("keyboard-dismissed");
        } else {
          await expect(rewardNotice).toHaveCount(0, { timeout: 10000 });
          await capture("reward-expired");
          const resumed = await saveAndResume();
          expect(resumed.party.map((p) => [p.level, p.xp])).toEqual(
            final.party.map((p) => [p.level, p.xp]),
          );
          expect(resumed.gold).toBe(final.gold);
          expect(resumed.quests.find((q) => q.id === quest.id).completed).toBe(
            true,
          );
          await expect(rewardNotice).toHaveCount(0);
          await capture("leveled-party-reloaded");
        }
        expect(requests.filter((r) => r.path.includes("/debug"))).toEqual([]);
        expect(requests.some((r) => r.body?.debug_no_encounters === true)).toBe(
          false,
        );
        expect(errors).toEqual([]);
      } finally {
        writeFileSync(
          path.join(proof, `${width}-requests.json`),
          JSON.stringify(requests, null, 2),
        );
        writeFileSync(
          path.join(proof, `${width}-errors.json`),
          JSON.stringify(errors, null, 2),
        );
        await capture("final-state").catch(() => {});
        console.log(
          "campaign-proof",
          proof,
          "seconds",
          (Date.now() - started) / 1000,
        );
      }
    });
  });
}
