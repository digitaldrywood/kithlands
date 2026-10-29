import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openShowcase } from "./battle-vfx-proof-helpers.js";
import {
  installCombatTextAudit,
  collectCombatTextAudit,
  expectReadableCombatText,
} from "./helpers/combat-text-audit.js";

const proof = path.resolve(`tmp/battle-multi-hit-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion, speed] of [
  [1440, 900, "no-preference", 3],
  [390, 844, "no-preference", 3],
  [375, 667, "no-preference", 1],
  [800, 600, "reduce", 3],
]) {
  test.describe(`${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width <= 600 });
    test("Warrior presents every authoritative hit at contact", async ({
      page,
    }) => {
      test.setTimeout(180000);
      if (speed === 1)
        await page.addInitScript(() =>
          localStorage.setItem(
            "kithlands_prefs",
            JSON.stringify({ battleSpeed: 1, messageSpeed: 6 }),
          ),
        );
      await page.route("**/src/main.js*", async (route) => {
        const r = await route.fetch();
        await route.fulfill({
          response: r,
          body: `${await r.text()}\nwindow.__multiGame=game;`,
        });
      });
      await openShowcase(page, { width, height, reducedMotion: motion });
      await page.evaluate(installCombatTextAudit, { gameKey: "__multiGame" });
      await page.evaluate(() => {
        const s = window.__multiGame.scene.getScene("Battle");
        window.__multiProof = {
          hits: [],
          frames: [],
          images: {},
          hp: [],
          messages: [],
        };
        const p = window.__multiProof;
        let previous = "";
        const hit = s.hitFx.bind(s);
        s.hitFx = (...args) => {
          const hero = s.partySprites.Hero.sprite;
          if (
            ["physical_attack", "critical_attack"].includes(hero.battleState)
          ) {
            p.hits.push({
              damage: args[2],
              crit: !!args[6]?.crit,
              missed: !!args[6]?.missed,
              state: hero.battleState,
              frame: hero.battleFrameIndex,
              at: performance.now(),
            });
            p.pendingImage = `hit-${p.hits.length}`;
          }
          return hit(...args);
        };
        const hp = s.animateHPBar.bind(s);
        s.animateHPBar = (bar, next, max) => {
          if (Object.values(s.enemySprites).some((e) => e.hpBar === bar))
            p.hp.push({ before: bar.currentHP, next });
          return hp(bar, next, max);
        };
        window.__multiCapture = () => {
          const s = window.__multiGame.scene.getScene("Battle"),
            hero = s.partySprites?.Hero?.sprite;
          if (!hero) return;
          const key = `${hero.battleState}:${hero.battleFrameIndex}`;
          if (key !== previous) {
            previous = key;
            const shadow = hero.battleShadow;
            p.frames.push({
              key,
              x: hero.x,
              y: hero.y,
              shadowX: shadow?.x,
              shadowY: shadow?.y,
              shadowDelta: shadow
                ? Math.hypot(hero.x - shadow.x, hero.y - shadow.y)
                : null,
            });
            if (
              ["physical_attack", "critical_attack"].includes(hero.battleState)
            )
              p.images[
                `pose-${p.frames.length}-${hero.battleState}-${hero.battleFrameIndex}`
              ] = s.game.canvas.toDataURL("image/png");
          }
          if (p.pendingImage) {
            p.images[p.pendingImage] = s.game.canvas.toDataURL("image/png");
            p.pendingImage = null;
          }
          const message = s.promptText?.getText();
          if (message && message !== p.messages.at(-1))
            p.messages.push(message);
        };
        window.__multiGame.events.on("postrender", window.__multiCapture);
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__multiGame.scene.getScene("Battle");
          return (
            !s.animating &&
            s.currentMemberIdx === slot &&
            s.promptText
              ?.getText()
              .startsWith(`${s.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      const command = async (key, label) => {
        if (width > 600) return page.keyboard.press(key);
        const p = await page.evaluate(
          (label) =>
            window.__kithlandsTest.interactiveTextPosition(label, "Battle"),
          label,
        );
        expect(p).toBeTruthy();
        await page.touchscreen.tap(p.x, p.y);
      };
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      for (let slot = 0; slot < 4; slot++) {
        await ready(slot);
        if (slot !== 0) await command("d", "DEFEND");
        else {
          await command("a", "ATTACK");
          const target = page
            .locator(".battle-choice-list button")
            .filter({ hasText: "Iron Golem" });
          await expect(target).toHaveCount(1);
          await target[width <= 600 ? "tap" : "click"]();
        }
      }
      const state = await (await response).json();
      expect(state.error).toBeUndefined();
      const action = state.combat_actions.find(
        (a) => a.actor_name === "Hero" && a.kind === "attack",
      );
      expect(action.hits.length).toBeGreaterThan(1);
      await page.waitForFunction(
        () => !window.__multiGame.scene.getScene("Battle").animating,
      );
      const data = await page.evaluate(() => {
        window.__multiGame.events.off("postrender", window.__multiCapture);
        return window.__multiProof;
      });
      const readability = await collectCombatTextAudit(page);
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(
          { action, ...data, images: undefined, readability },
          null,
          2,
        ),
      );
      for (const [label, image] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${width}-${label}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      await page.screenshot({
        path: path.join(proof, `${width}-recovered.png`),
      });
      expect(
        data.hits.map(({ damage, crit, missed }) => ({ damage, crit, missed })),
      ).toEqual(
        action.hits.map((h) => ({
          damage: h.damage,
          crit: !!h.crit,
          missed: !!h.missed,
        })),
      );
      expect(data.hits.every((h) => h.frame === 3)).toBe(true);
      for (let i = 1; i < data.hits.length; i++)
        expect(data.hits[i].at - data.hits[i - 1].at).toBeGreaterThanOrEqual(
          1200,
        );
      expect(data.hp.reduce((sum, h) => sum + h.before - h.next, 0)).toBe(
        action.damage,
      );
      const attackFrames = data.frames.filter(
        (f) =>
          f.key.startsWith("physical_attack:") ||
          f.key.startsWith("critical_attack:"),
      );
      expect(attackFrames.length).toBeGreaterThan(0);
      expect(
        attackFrames.every(
          (f) => f.shadowDelta !== null && f.shadowDelta < 0.5,
        ),
      ).toBe(true);
      expect(data.messages).toContain(
        `Hero: ${action.damage} damage (${action.hits.length} strikes).`,
      );
      expectReadableCombatText(readability);
    });
  });
}
