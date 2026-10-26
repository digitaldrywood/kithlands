import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openShowcase } from "./battle-vfx-proof-helpers.js";
import {
  installCombatTextAudit,
  collectCombatTextAudit,
  expectReadableCombatText,
} from "./helpers/combat-text-audit.js";
const proof = path.resolve(`tmp/battle-crowded-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion, speed, level] of [
  [1440, 900, "no-preference", 3, 1],
  [390, 844, "no-preference", 3, 1],
  [375, 667, "no-preference", 1, 1],
  [800, 600, "reduce", 3, 1],
  [390, 844, "no-preference", 3, 9],
]) {
  const id = `${width}${speed === 1 ? "-fast" : ""}${level > 1 ? "-partial" : ""}`;
  test.describe(id, () => {
    test.use({ viewport: { width, height }, hasTouch: width <= 600 });
    test("five-target spell results remain distinct", async ({ page }) => {
      test.setTimeout(120000);
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
          body: `${await r.text()}\nwindow.__crowdGame=game;`,
        });
      });
      await openShowcase(page, { width, height, reducedMotion: motion });
      const state = await page.evaluate(
        (level) =>
          window.__kithlandsTest.forceEncounter(
            ["slime", "slime", "slime", "wolf", "wolf"],
            level,
            "Battle",
          ),
        level,
      );
      expect(state.error).toBeUndefined();
      expect(state.enemies).toHaveLength(5);
      // Rebuild only the renderer after the debug endpoint replaces the encounter.
      await page.evaluate(() => {
        const s = window.__crowdGame.scene.getScene("Battle");
        s.scene.restart({ gameState: s.gameState });
      });
      await page.waitForFunction(
        () =>
          Object.keys(window.__crowdGame.scene.getScene("Battle").enemySprites)
            .length === 5,
      );
      const equipment = page.getByRole("dialog", { name: "Character" });
      await expect(equipment).toBeVisible();
      await page.getByRole("button", { name: "Close equipment" }).click();
      await expect(equipment).toBeHidden();
      await page.screenshot({ path: path.join(proof, `${id}-formation.png`) });
      await page.evaluate(installCombatTextAudit, { gameKey: "__crowdGame" });
      await page.evaluate(() => {
        window.__crowdProof = {
          samples: [],
          images: {},
          summaries: [],
          summaryStates: [],
          captions: [],
        };
        const intersects = (a, b) =>
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        window.__crowdCapture = () => {
          const s = window.__crowdGame.scene.getScene("Battle");
          const message = s.promptText?.getText() || "";
          if (/^Blaze: \d+ defeated\.$/.test(message)) {
            window.__crowdProof.summaries.push(message);
            window.__crowdProof.summaryStates.push({
              targetVisible: !!s.groupTargetCursor?.graphics.visible,
              casterState: s.partySprites.Sparks.sprite.battleState,
            });
            window.__crowdProof.images.summary ||=
              s.game.canvas.toDataURL("image/png");
          }
          const labels = (s.floatingText?.active || []).filter(
            (t) =>
              t.visible && t.alpha > 0.9 && t._targetKey?.startsWith("enemy_"),
          );
          const caption = s.groupTargetCursor?.label;
          if (caption?.visible) {
            const b = caption.getBounds(),
              collisions = [];
            for (const e of Object.values(s.enemySprites).filter(
              (e) => e.nameText?.visible,
            ))
              if (intersects(b, e.nameText.getBounds()))
                collisions.push(e.name);
            for (const t of labels)
              if (intersects(b, t.getBounds())) collisions.push(t.text);
            window.__crowdProof.captions.push({
              collisions,
              css:
                (parseFloat(caption.style.fontSize) *
                  s.game.canvas.getBoundingClientRect().width) /
                s.scale.gameSize.width,
              bottom: b.bottom,
              fieldBottom:
                s.hudLayout.battlefield.y + s.hudLayout.battlefield.height,
            });
          }
          if (!labels.length) return;
          const names = Object.values(s.enemySprites).filter(
              (e) => e.nameText?.visible,
            ),
            collisions = [];
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++)
              if (intersects(labels[i].getBounds(), labels[j].getBounds()))
                collisions.push([labels[i].text, labels[j].text]);
          for (const t of labels)
            for (const e of names)
              if (intersects(t.getBounds(), e.nameText.getBounds()))
                collisions.push([t.text, e.name]);
          window.__crowdProof.samples.push({
            count: labels.length,
            collisions,
            positions: labels.map((t) => ({
              key: t._targetKey,
              x: t.x,
              y: t.y,
            })),
          });
          if (labels.length >= 5)
            window.__crowdProof.images.results ||=
              s.game.canvas.toDataURL("image/png");
        };
        window.__crowdGame.events.on("postrender", window.__crowdCapture);
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__crowdGame.scene.getScene("Battle");
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
        if (slot !== 1) await command("d", "DEFEND");
        else {
          await command("s", "SPELL");
          const blaze = page
            .locator(".battle-choice-list button")
            .filter({ hasText: "Blaze" });
          await expect(blaze).toHaveCount(1);
          await blaze[width <= 600 ? "tap" : "click"]();
        }
      }
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      writeFileSync(
        path.join(proof, `${id}-server.json`),
        JSON.stringify(
          {
            actions: result.combat_actions,
            log: result.combat_log,
            enemies: result.enemies,
          },
          null,
          2,
        ),
      );
      expect(
        result.combat_actions.filter((a) => a.action_id === "blaze"),
      ).toHaveLength(5);
      const defeated = result.combat_log.filter((line) =>
        line.includes("DEFEATED"),
      ).length;
      if (level === 1) expect(defeated).toBe(5);
      else expect(defeated).toBeLessThan(5);
      await page.waitForFunction(() =>
        window.__crowdProof.samples.some((s) => s.count >= 5),
      );
      if (defeated)
        await page.waitForFunction(
          (n) =>
            window.__crowdProof.summaries.some(
              (s) => s === `Blaze: ${n} defeated.`,
            ),
          defeated,
        );
      await page.waitForTimeout(1200);
      const data = await page.evaluate(() => {
        window.__crowdGame.events.off("postrender", window.__crowdCapture);
        return window.__crowdProof;
      });
      const readability = await collectCombatTextAudit(page);
      writeFileSync(
        path.join(proof, `${id}-trace.json`),
        JSON.stringify(
          {
            samples: data.samples,
            summaries: data.summaries,
            summaryStates: data.summaryStates,
            captions: data.captions,
            readability,
          },
          null,
          2,
        ),
      );
      for (const [label, url] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${id}-${label}.png`),
          Buffer.from(url.split(",")[1], "base64"),
        );
      expectReadableCombatText(readability);
      expect(data.captions.length).toBeGreaterThan(0);
      for (const c of data.captions) {
        expect(c.collisions).toEqual([]);
        expect(c.css).toBeGreaterThanOrEqual(12);
        expect(c.bottom).toBeLessThanOrEqual(c.fieldBottom);
      }

      for (const state of data.summaryStates)
        expect(state).toEqual({
          targetVisible: false,
          casterState: "idle_guard",
        });
      expect(data.samples.flatMap((s) => s.collisions)).toEqual([]);
      expect(Math.max(...data.samples.map((s) => s.count))).toBe(5);
      const positions = new Map();
      for (const sample of data.samples)
        for (const p of sample.positions) {
          if (positions.has(p.key)) expect(p).toEqual(positions.get(p.key));
          else positions.set(p.key, p);
        }
    });
  });
}
