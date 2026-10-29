import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(
  `../tmp/defeat-responsive-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["default", 800, 600],
  ["phone", 390, 844],
  ["short-phone", 375, 667],
]) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: true });
    test("ordinary Go defeat, explicit save recovery, then native Title exit", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.log("defeat runtime error:", error.stack);
      });
      const capture = (name) =>
        page.screenshot({
          path: new URL(`${label}-${name}.png`, proof).pathname,
        });
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__defeatProofGame = game;`,
        });
      });
      await page.goto("/?noEncounters=1");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `defeat-${label}-${Date.now()}@kithlands.dev`,
      );
      const initial = await page.evaluate(() =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          use_osm: false,
          people: [],
          places: ["Old Mill", "Market", "School"],
          big_building: "Town Hall",
          difficulty: "normal",
          party: [{ name: "Ayla", class_id: "warrior" }],
          world_seed: 24,
        }),
      );
      expect(initial.phase).toBe("world");
      const saveName = `Before defeat ${label}`;
      await page.evaluate(
        (name) => window.__kithlandsTest.saveGame(name, "World"),
        saveName,
      );
      const saves = await page.evaluate(() =>
        window.__kithlandsTest.listSaves(),
      );
      const saved = saves.saves.find((save) => save.name === saveName);
      expect(saved?.id).toBeTruthy();
      const before = await page.evaluate(() =>
        window.__kithlandsTest.gameState("World"),
      );
      const lose = async () => {
        // Explicit combat fixture: HP=1 and a forced enemy; defeat comes from Go
        // through native defend input, not a fabricated result presentation.
        await page.evaluate(() =>
          window.__kithlandsTest.setPartyVitals(
            [{ slot: 0, hp: 1, mp: 0 }],
            "World",
          ),
        );
        const encounter = await page.evaluate(() =>
          window.__kithlandsTest.forceEncounter(["goblin"], 10, "World"),
        );
        expect(encounter.phase).toBe("combat");
        await page.evaluate(() => {
          window.__defeatBattleObjects = [
            ...window.__defeatProofGame.scene.getScene("Battle").children.list,
          ];
        });
        for (let turn = 0; turn < 6; turn++) {
          await page.waitForFunction(() => {
            const state = window.__kithlandsTest.gameState("Battle");
            const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
            return (
              state?.phase === "defeat" ||
              snapshot.messageWindow?.text.includes("choose an action")
            );
          });
          const phase = await page.evaluate(
            () => window.__kithlandsTest.gameState("Battle").phase,
          );
          if (phase === "defeat") break;
          await page.keyboard.press("d");
          await page.waitForFunction(
            () =>
              window.__kithlandsTest.gameState("Battle").phase !== "combat" ||
              !window.__kithlandsTest
                .battleVisibilitySnapshot()
                .messageWindow?.text.includes("choose an action"),
          );
        }
        const dialog = page.getByRole("dialog", { name: "PARTY DEFEATED" });
        await expect(dialog).toBeVisible();
        const state = await page.evaluate(() =>
          window.__kithlandsTest.gameState("Battle"),
        );
        expect(state.phase).toBe("defeat");
        expect(state.party[0].hp).toBe(0);
        const liveObjects = await page.evaluate(() =>
          window.__defeatBattleObjects
            .filter((object) => object.scene)
            .map((object) => object.type),
        );
        expect(
          liveObjects,
          "battle actors and controls are destroyed before the result UI",
        ).toEqual([]);
        await expect(
          dialog.getByText(`HP 0 / ${state.party[0].max_hp}`, { exact: true }),
        ).toBeVisible();
        return state;
      };
      const lost = await lose();
      const dialog = page.getByRole("dialog", { name: "PARTY DEFEATED" });
      await expect(
        dialog.getByRole("button", { name: /^Choose a save/ }),
      ).toBeFocused();
      const metrics = await dialog.evaluate((root) => {
        const panel = root
          .querySelector(".viewport-dialog-panel")
          .getBoundingClientRect();
        const fonts = [...root.querySelectorAll("h1,h2,h3,p,button")].map(
          (node) => parseFloat(getComputedStyle(node).fontSize),
        );
        return {
          minFont: Math.min(...fonts),
          right: panel.right,
          bottom: panel.bottom,
          left: panel.left,
          top: panel.top,
          overflow: root.scrollWidth > root.clientWidth,
        };
      });
      expect(metrics.minFont).toBeGreaterThanOrEqual(14);
      expect(metrics.overflow).toBe(false);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.top).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(width);
      expect(metrics.bottom).toBeLessThanOrEqual(height);
      await capture("defeated");
      // Presentation-only maximum-party/long-name fixture; authoritative Go loss
      // is restored immediately afterward, before any recovery input.
      await page.evaluate((state) => {
        const names = [
          "Ayla of the Western Watch",
          "Sparks the Ember Keeper",
          "Shade of the Old Mill",
          "Willow of the Meadow",
        ];
        const classes = ["warrior", "cinder", "rogue", "mender"];
        window.__defeatProofGame.scene.getScene("Battle").showVictoryResults({
          ...state,
          party: names.map((name, index) => ({
            ...state.party[0],
            name,
            class_id: classes[index],
            sprite_id: classes[index],
            class_name: classes[index],
          })),
        });
      }, lost);
      await expect(dialog.locator(".defeat-member")).toHaveCount(4);
      await capture("long-party-fixture-top");
      await dialog.locator(".defeat-member").last().scrollIntoViewIfNeeded();
      await expect(
        dialog.getByRole("button", { name: /^Choose a save/ }),
      ).toBeInViewport();
      await expect(
        dialog.getByRole("button", { name: /^Title screen/ }),
      ).toBeInViewport();
      await capture("long-party-fixture-bottom");
      await page.evaluate(
        (state) =>
          window.__defeatProofGame.scene
            .getScene("Battle")
            .showVictoryResults(state),
        lost,
      );
      await expect(dialog.locator(".defeat-member")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: /^Title screen/ }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", { name: /^Choose a save/ }),
      ).toBeFocused();
      // The Title heading renders before its real save-list request completes.
      // Keep that ordering observable even against a fast local API.
      await page.route("**/api/saves", async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 750));
        await route.fulfill({ response });
      });
      if (width < 500)
        await dialog.getByRole("button", { name: /^Choose a save/ }).tap();
      else await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Your adventures" }),
        `Runtime errors: ${errors.join(" | ")}`,
      ).toBeVisible();
      await expect(page.locator(".defeat-receipt")).toHaveCount(0);
      const target = page.locator(`[data-save-id="${saved.id}"]`);
      await expect(target, "wait for the requested save to load").toHaveCount(
        1,
      );
      if (!(await target.isVisible()))
        await page.locator("details.save-history > summary").click();
      await expect(target).toBeVisible();
      await capture("save-choice");
      if (width < 500) await target.tap();
      else {
        await target.focus();
        await page.keyboard.press("Enter");
      }
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      const recovered = await page.evaluate(() =>
        window.__kithlandsTest.gameState("World"),
      );
      expect(recovered.party).toEqual(before.party);
      expect(recovered.gold).toBe(before.gold);
      expect(recovered.inventory).toEqual(before.inventory);
      expect(recovered.quests).toEqual(before.quests);
      expect(recovered.phase).toBe("world");
      await expect(page.locator(".defeat-receipt")).toHaveCount(0);
      await capture("recovered");
      await lose();
      if (label === "phone")
        await page.getByRole("button", { name: /^Title screen/ }).tap();
      else await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: /^New game/ }),
      ).toBeVisible();
      await expect(page.locator(".defeat-receipt")).toHaveCount(0);
      await expect(page.locator(".title-saves")).toHaveCount(0);
      await capture("title");
      expect(errors).toEqual([]);
    });
  });
}
