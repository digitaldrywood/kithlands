import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
  chooseStoryAction,
  clickRouteText,
  openNormalMerchant,
} from "./helpers/normal-route.js";

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  console.log(
    "opening-state",
    await page.evaluate(() => {
      const key = window.__kithlandsTest.activeSceneKey();
      const s = window.__normalRouteGame.scene.getScene(key);
      return {
        key,
        x: s.playerX,
        y: s.playerY,
        animating: s.animating,
        location: s.gameState?.current_location,
        entries: s.gameState?.dungeon_entries?.map((e) => ({
          id: e.id,
          node_id: e.node_id,
          label: e.label,
        })),
        exits: s.model?.interactions?.filter((o) => o.type === "exit"),
        trailActive: s.dungeonEntryButton?.active,
        root: document.querySelector("#game-ui")?.innerHTML.slice(0, 300),
      };
    }),
  );
  await page.screenshot({
    path: info.outputPath(`opening-failed-${Date.now()}.png`),
  });
});

const proof = path.resolve(`tmp/opening-integration-${Date.now()}`);
mkdirSync(proof, { recursive: true });

for (const width of [1440, 390]) {
  test.describe(`${width} town trail return`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
    });
    test("walk through the shop and return to a usable trail junction", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await startNormalRoute(page);
      const initial = await page.evaluate(() =>
        window.__kithlandsTest.gameState("World"),
      );
      expect(initial.gold).toBe(100);
      expect(initial.party[1].spells.map((s) => s.id)).toEqual(["spark"]);
      expect(initial.party[3].spells.map((s) => s.id)).toEqual(["cure"]);
      const home = await page.evaluate(() => {
        const scene = window.__normalRouteGame.scene.getScene("World");
        return scene.spawns.find(
          (s) => s.node_id === scene.gameState.settlement_entry_node_id,
        );
      });
      await walkNormally(page, "World", { x: home.x, y: home.y });
      await page.getByRole("button", { name: /^Enter —/ }).click();
      await routeReady(page, "Settlement");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              !!window.__kithlandsTest.interactiveTextPosition(
                "Old Mill trail",
                "Settlement",
              ),
          ),
        )
        .toBe(true);
      await walkNormally(page, "Settlement", { x: 18, y: 9 });
      await page.keyboard.press("Enter");
      await routeReady(page, "Town");
      await page.screenshot({
        path: path.join(proof, `${width}-shop-arrival.png`),
      });
      await openNormalMerchant(page);
      await clickRouteText(page, "Spells", "Town", width === 390);
      await clickRouteText(page, "Frost (black 1)", "Town", width === 390);
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .visibleTexts("Town")
          .some((t) => t.text === "Learn Frost"),
      );
      await page.screenshot({
        path: path.join(proof, `${width}-eligible-frost.png`),
      });
      const learning = page.waitForResponse(
        (r) => r.url().endsWith("/learn") && r.request().method() === "POST",
      );
      await clickRouteText(page, "Learn", "Town", width === 390);
      const learned = await (await learning).json();
      expect(learned.error).toBeUndefined();
      expect(learned.gold).toBe(0);
      expect(learned.party[1].spells.map((s) => s.id)).toEqual([
        "spark",
        "frost",
      ]);
      await page.waitForFunction(
        () => window.__kithlandsTest.gameState("Town").gold === 0,
      );
      await page.screenshot({
        path: path.join(proof, `${width}-frost-learned.png`),
      });
      await clickRouteText(page, "Leave Shop", "Town", width === 390);

      await page.keyboard.press("Escape");
      await routeReady(page, "Settlement");
      await walkNormally(page, "Settlement", { x: 12, y: 16 });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              !!window.__kithlandsTest.interactiveTextPosition(
                "Old Mill trail",
                "Settlement",
              ),
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: path.join(proof, `${width}-returned-trail.png`),
      });
      await clickRouteText(page, "Old Mill trail", "Settlement", width === 390);
      await routeReady(page, "Dungeon");
      expect(
        await page.evaluate(
          () => window.__kithlandsTest.gameState("Dungeon").active_dungeon_id,
        ),
      ).toBe("old-mill");
      await page.screenshot({
        path: path.join(proof, `${width}-trail-entered.png`),
      });
    });
  });
}

test("one Attack key cannot reopen targeting for the next party member", async ({
  page,
}) => {
  await startNormalRoute(page);
  await page
    .getByRole("button", { name: "Old Mill trail", exact: true })
    .click();
  await routeReady(page, "Dungeon");
  await chooseStoryAction(page, "heron-trail");
  await chooseStoryAction(page, "pool-bramblehog");
  await page.waitForFunction(() => {
    const scene = window.__normalRouteGame.scene.getScene("Battle");
    return (
      !scene.animating && scene.promptText?.getText().startsWith("Hero's turn")
    );
  });
  await page.evaluate(() => {
    window.__normalRouteGame.scene
      .getScene("Battle")
      .input.keyboard.once("keydown-A", (event) => {
        window.__openingAttackEvent = event;
      });
  });
  await page.keyboard.press("a");
  await expect(page.locator(".battle-choice-panel")).toContainText(
    "Choose enemy",
  );
  await page.keyboard.press("1");
  await page.waitForFunction(() => {
    const scene = window.__normalRouteGame.scene.getScene("Battle");
    return (
      scene.currentMemberIdx === 1 &&
      scene.promptText?.getText().startsWith("Sparks's turn")
    );
  });
  await page.evaluate(() =>
    window.__normalRouteGame.scene
      .getScene("Battle")
      .input.keyboard.emit("keydown-A", window.__openingAttackEvent),
  );
  await expect(page.locator(".battle-choice-panel")).toHaveCount(0);
  await page.screenshot({
    path: path.join(proof, "attack-event-not-replayed.png"),
  });
  await page.keyboard.press("s");
  await expect(page.locator(".battle-choice-panel")).toContainText("Magic");
  await page.keyboard.press("1");
  await expect(page.locator(".battle-choice-panel")).toContainText(
    "Choose enemy",
  );
  await page.keyboard.press("1");
  await page.waitForFunction(() => {
    const s = window.__normalRouteGame.scene.getScene("Battle");
    return (
      s.currentMemberIdx === 2 &&
      s.promptText?.getText().startsWith("Shade's turn")
    );
  });
  await page.keyboard.press("a");
  await expect(page.locator(".battle-choice-panel")).toContainText(
    "Choose enemy",
  );
  await page.keyboard.press("1");
  await page.waitForFunction(() => {
    const s = window.__normalRouteGame.scene.getScene("Battle");
    return (
      s.currentMemberIdx === 3 &&
      s.promptText?.getText().startsWith("Willow's turn")
    );
  });
  await expect(page.locator(".battle-choice-panel")).toHaveCount(0);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/action") &&
      r.request().postDataJSON()?.type === "combat_round",
  );
  await page.keyboard.press("d");
  const resolved = await response;
  expect(
    resolved
      .request()
      .postDataJSON()
      .actions.map((a) => a.type),
  ).toEqual(["attack", "spell", "attack", "defend"]);
  expect((await resolved.json()).error).toBeUndefined();
  await page.screenshot({
    path: path.join(proof, "normal-four-command-round.png"),
  });
});
