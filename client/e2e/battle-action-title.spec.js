import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const proof = path.resolve(`tmp/action-title-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [label, width, height, motion, speed] of [
  ["desktop", 1440, 900, "no-preference", 3],
  ["default-reduced-fast", 800, 600, "reduce", 1],
  ["phone-fast", 390, 844, "no-preference", 1],
  ["short-phone-fast", 375, 667, "no-preference", 1],
]) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("readable action cards survive Fast speed and clear at results", async ({
      page,
    }) => {
      test.setTimeout(90000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        (battleSpeed) =>
          localStorage.setItem(
            "kithlands_prefs",
            JSON.stringify({ battleSpeed, messageSpeed: 6 }),
          ),
        speed,
      );
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__titleGame=game;`,
        });
      });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto("/?noEncounters=1");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      expect(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ).toBe(motion === "reduce");
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `action-title-${label}-${Date.now()}@kithlands.dev`,
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
            { name: "Hero", class_id: "warrior" },
            { name: "Sparks", class_id: "cinder" },
          ],
          rng_seed: 24,
        }),
      );
      const initial = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["slime", "slime"], 1, "World"),
      );
      expect(initial.party.every((member) => member.level === 1)).toBe(true);
      await page.waitForFunction(() =>
        window.__titleGame.scene
          .getScene("Battle")
          .promptText?.getText()
          .includes("choose an action"),
      );
      await page.evaluate(() => {
        const scene = window.__titleGame.scene.getScene("Battle"),
          cards = new Map();
        const audit = (window.__actionTitleAudit = {
          cards: [],
          images: {},
          maxConcurrent: 0,
        });
        const bounds = (node) => {
          const r = node.getBounds();
          return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        window.__actionTitleCapture = () => {
          const objects = scene.children.list.filter(
            (node) => node.active && node.visible,
          );
          const live = objects.filter(
            (node) => node._combatFxTag === "title-card",
          );
          audit.maxConcurrent = Math.max(audit.maxConcurrent, live.length);
          for (const card of live) {
            if (card.alpha < 0.98) continue;
            const actor = objects.find(
                (node) => node._combatFxTag === "title-actor",
              ),
              action = objects.find(
                (node) => node._combatFxTag === "title-action",
              );
            if (!actor || !action) continue;
            let entry = cards.get(card);
            if (!entry) {
              const rect = scene.game.canvas.getBoundingClientRect(),
                ratio = rect.width / scene.scale.gameSize.width;
              entry = {
                actor: actor._actionTitleFullText,
                action: action._actionTitleFullText,
                visibleActor: actor.text,
                visibleAction: action.text,
                actorCSS: parseFloat(actor.style.fontSize) * ratio,
                actionCSS: parseFloat(action.style.fontSize) * ratio,
                card: bounds(card),
                actorBounds: bounds(actor),
                actionBounds: bounds(action),
                logicalWidth: scene.scale.gameSize.width,
                first: performance.now(),
                last: performance.now(),
                ys: [],
                lines: action.getWrappedText().length,
              };
              cards.set(card, entry);
              audit.cards.push(entry);
              audit.images[`${entry.actor}-${entry.action}`] =
                scene.game.canvas.toDataURL("image/png");
            }
            entry.last = performance.now();
            entry.ys.push(card.y);
          }
        };
        scene.game.events.on("postrender", window.__actionTitleCapture);
      });
      const longActor =
        "Alexandria of the Northern Reach and the Western Watch";
      const longAction = "Frost of the Forgotten Meadow and the Old Mill";
      // Presentation-only boundary fixture. No party, spell ownership or Go state changes.
      await page.evaluate(
        ({ actor, action }) =>
          window.__titleGame.scene
            .getScene("Battle")
            .showActionTitle({ name: actor }, action),
        { actor: longActor, action: longAction },
      );
      await page.waitForFunction(() =>
        window.__actionTitleAudit.cards.some((card) =>
          card.actor.startsWith("ALEXANDRIA"),
        ),
      );
      await page.screenshot({
        path: path.join(proof, `${label}-long-text-presentation-fixture.png`),
      });
      await page.waitForFunction(
        () =>
          !window.__titleGame.scene
            .getScene("Battle")
            .children.list.some(
              (node) => node.active && node._combatFxTag === "title-card",
            ),
      );
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const scene = window.__titleGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.currentMemberIdx === slot &&
            scene.promptText?.getText().includes("choose an action")
          );
        }, slot);
      const command = async (key, text) => {
        if (width >= 600) return page.keyboard.press(key);
        const point = await page.evaluate(
          (name) =>
            window.__kithlandsTest.interactiveTextPosition(name, "Battle"),
          text,
        );
        expect(point).toBeTruthy();
        await page.touchscreen.tap(point.x, point.y);
      };
      const choose = async (target) => {
        if (width < 600) await target.tap();
        else await target.click();
      };
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      await ready(0);
      await command("a", "ATTACK");
      await choose(
        page
          .locator(".battle-choice-list button")
          .filter({ hasText: "Slime" })
          .first(),
      );
      await ready(1);
      await command("s", "SPELL");
      await choose(page.getByRole("button", { name: /^Spark ·/ }));
      await choose(
        page
          .locator(".battle-choice-list button")
          .filter({ hasText: "Slime" })
          .last(),
      );
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      expect(
        result.combat_actions.some(
          (a) => a.kind === "attack" && a.actor_name === "Hero",
        ),
      ).toBe(true);
      expect(
        result.combat_actions.some(
          (a) =>
            a.kind === "spell" &&
            a.actor_name === "Sparks" &&
            a.spell_name === "Spark",
        ),
      ).toBe(true);
      await page.waitForFunction(
        () => !window.__titleGame.scene.getScene("Battle").animating,
      );
      expect(["victory", "quest_complete", "promotion"]).toContain(
        result.phase,
      );
      await expect(
        page.getByRole("dialog", { name: "VICTORY!", exact: true }),
      ).toBeVisible();
      await page.waitForFunction(
        () =>
          !window.__titleGame.scene
            .getScene("Battle")
            .children.list.some(
              (node) => node.active && node._combatFxTag === "title-card",
            ),
      );
      const audit = await page.evaluate(() => {
        window.__titleGame.events.off(
          "postrender",
          window.__actionTitleCapture,
        );
        return window.__actionTitleAudit;
      });
      writeFileSync(
        path.join(proof, `${label}-trace.json`),
        JSON.stringify({ result, ...audit, images: undefined }, null, 2),
      );
      for (const [name, image] of Object.entries(audit.images))
        writeFileSync(
          path.join(
            proof,
            `${label}-${name.startsWith("ALEXANDRIA") ? "long-fixture" : name.replaceAll(/[^a-zA-Z0-9-]/g, "-")}.png`,
          ),
          Buffer.from(image.split(",")[1], "base64"),
        );
      expect(audit.maxConcurrent).toBe(1);
      expect(
        audit.cards.some(
          (card) => card.actor === "HERO" && card.action === "ATTACK",
        ),
      ).toBe(true);
      expect(
        audit.cards.some(
          (card) => card.actor === "SPARKS" && card.action === "SPARK",
        ),
      ).toBe(true);
      for (const card of audit.cards) {
        expect(card.actorCSS).toBeGreaterThanOrEqual(14);
        expect(card.actionCSS).toBeGreaterThanOrEqual(18);
        expect(card.card.left).toBeGreaterThanOrEqual(0);
        expect(card.card.top).toBeGreaterThanOrEqual(0);
        expect(card.card.right).toBeLessThan(card.logicalWidth / 2);
        expect(card.actorBounds.right).toBeLessThanOrEqual(card.card.right + 1);
        expect(card.actionBounds.right).toBeLessThanOrEqual(
          card.card.right + 1,
        );
        expect(card.actionBounds.bottom).toBeLessThanOrEqual(
          card.card.bottom + 1,
        );
        expect(card.lines).toBeLessThanOrEqual(2);
        expect(card.last - card.first).toBeGreaterThanOrEqual(900);
        expect(new Set(card.ys).size).toBe(1);
      }
      expect(
        audit.cards.find((card) => card.actor.startsWith("ALEXANDRIA"))
          .visibleActor,
      ).toContain("…");
      await page.screenshot({
        path: path.join(proof, `${label}-result-no-card.png`),
      });
      expect(errors).toEqual([]);
    });
  });
}
