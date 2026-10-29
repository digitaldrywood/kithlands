import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";
import {
  installCombatTextAudit,
  collectCombatTextAudit,
  expectReadableCombatText,
} from "./helpers/combat-text-audit.js";
const proof = path.resolve(`tmp/bandit-guard-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test.describe(`${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("Bandit guard intent and counterplay match three native rounds", async ({
      page,
    }) => {
      test.setTimeout(240000);
      await page.emulateMedia({ reducedMotion: motion });
      await startNormalRoute(page, 6);
      const encounter = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["bandit", "goblin"], 1, "World"),
      );
      expect(encounter.error).toBeUndefined();
      expect(encounter.enemies.map((e) => e.intent.kind)).toEqual([
        "defend",
        "attack",
      ]);
      await page.evaluate(installCombatTextAudit, {
        gameKey: "__normalRouteGame",
      });
      await page.evaluate(() => {
        window.__banditProof = {
          images: {},
          misses: [],
          missImpacts: [],
          cursors: [],
        };
        const samples = new WeakMap();
        const scene = window.__normalRouteGame.scene.getScene("Battle");
        const hitFx = scene.hitFx.bind(scene);
        scene.hitFx = (...args) => {
          const opts = args[6];
          if (!opts?.missed || opts.targetKey !== "enemy_100")
            return hitFx(...args);
          const impact = {
            hpBefore: opts.entry.hpBar.currentHP,
            frame: scene.partySprites.Hero.sprite.battleFrameIndex,
          };
          window.__banditProof.missImpacts.push(impact);
          return hitFx(...args).then((result) => {
            impact.hpAfter = opts.entry.hpBar.currentHP;
            return result;
          });
        };
        window.__banditCapture = () => {
          const s = window.__normalRouteGame.scene.getScene("Battle");
          const bandit = s.enemySprites?.[100];
          if (
            s.revealLastLine === "Bandit defends." &&
            bandit?.sprite?.tintTopLeft === 0x88ccff
          )
            window.__banditProof.images.guard ||=
              s.game.canvas.toDataURL("image/png");
          const text = s.floatingText?.active?.find(
            (t) => t.visible && t.alpha > 0.9 && t._targetKey === "enemy_100",
          );
          if (text)
            window.__banditProof.images.result ||=
              s.game.canvas.toDataURL("image/png");
          if (text?.text.startsWith("GUARD"))
            window.__banditProof.images.guardedHit ||=
              s.game.canvas.toDataURL("image/png");
          if (text?._resultType === "miss") {
            let sample = samples.get(text);
            if (!sample) {
              sample = {
                started: performance.now(),
                opaqueMs: 0,
                contact: s.children.list.some(
                  (o) => o.active && o._combatFxTag === "melee-contact",
                ),
              };
              samples.set(text, sample);
              window.__banditProof.misses.push(sample);
              window.__banditProof.images.miss ||=
                s.game.canvas.toDataURL("image/png");
            }
            if (text.alpha >= 0.99)
              sample.opaqueMs = performance.now() - sample.started;
          }
        };
        window.__normalRouteGame.events.on(
          "postrender",
          window.__banditCapture,
        );
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__normalRouteGame.scene.getScene("Battle");
          return (
            !s.animating &&
            s.currentMemberIdx === slot &&
            s.promptText
              ?.getText()
              .startsWith(`${s.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      const command = async (key, label) => {
        if (width !== 390) return page.keyboard.press(key);
        const p = await page.evaluate(
          (label) =>
            window.__kithlandsTest.interactiveTextPosition(label, "Battle"),
          label,
        );
        expect(p).toBeTruthy();
        await page.touchscreen.tap(p.x, p.y);
      };
      const choose = async (label) => {
        const row = page
          .locator(".battle-choice-list button")
          .filter({ hasText: label });
        await expect(row).toHaveCount(1);
        await row[width === 390 ? "tap" : "click"]();
      };
      const trace = [];
      for (let round = 0; round < 3; round++) {
        await ready(0);
        const before = await page.evaluate(() =>
          window.__kithlandsTest.gameState(),
        );
        expect(before.enemies.find((e) => e.id === 100).intent.kind).toBe(
          round % 2 === 0 ? "defend" : "attack",
        );
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.__normalRouteGame.scene
                .getScene("Battle")
                .promptText.getText(),
            ),
          )
          .toContain(round % 2 === 0 ? "Guard" : "Attack");
        await page.screenshot({
          path: path.join(proof, `${width}-round-${round}-intent.png`),
        });
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/action") &&
            r.request().postDataJSON()?.type === "combat_round",
        );
        for (let slot = 0; slot < 4; slot++) {
          await ready(slot);
          if (slot === 0) {
            await command("a", "ATTACK");
            if (round === 0) {
              await expect(page.locator(".battle-choice-detail")).toContainText(
                "Guard: physical hits halved",
              );
              const cursor = await page.evaluate(() => {
                const s = window.__normalRouteGame.scene.getScene("Battle");
                const label = s.targetCursor.label.getBounds(),
                  name = s.enemySprites[100].nameText.getBounds();
                const data = { gap: name.top - label.bottom, top: label.top };
                window.__banditProof.cursors.push(data);
                return data;
              });
              expect(cursor.gap).toBeGreaterThanOrEqual(14);
              expect(cursor.top).toBeGreaterThanOrEqual(0);
              await page.screenshot({
                path: path.join(proof, `${width}-guard-detail.png`),
              });
            }
            await choose(round === 1 ? "Goblin" : "Bandit");
          } else if (slot === 1 && round !== 1) {
            await command("s", "SPELL");
            await choose("Spark");
            await choose("Bandit");
          } else if (before.party[slot].class_id === "mender") {
            await command("s", "SPELL");
            await choose("Cure");
            await choose("Hero");
          } else await command("d", "DEFEND");
        }
        const result = await (await response).json();
        expect(result.error).toBeUndefined();
        trace.push(result);
        const action = result.combat_actions.find((a) => a.actor_id === 100);
        expect(action?.kind).toBe(round % 2 === 0 ? "defend" : "attack");
        const physical = result.combat_actions.find(
          (a) => a.actor_name === "Hero" && a.kind === "attack",
        );
        expect(physical.target_id).toBe(round === 1 ? 101 : 100);
        if (round !== 1 && physical.damage > 0)
          expect(physical.damage_prevented).toBeGreaterThan(0);
        else expect(physical.damage_prevented || 0).toBe(0);
        if (round !== 1) {
          const spell = result.combat_actions.find(
            (a) => a.actor_name === "Sparks" && a.kind === "spell",
          );
          expect(spell.damage).toBeGreaterThan(0);
          expect(spell.damage_prevented || 0).toBe(0);
        }
      }
      await ready(0);
      expect(
        trace
          .flatMap((r) => r.combat_actions)
          .some((a) => a.actor_name === "Hero" && a.damage_prevented > 0),
      ).toBe(true);
      const data = await page.evaluate(() => {
        window.__normalRouteGame.events.off(
          "postrender",
          window.__banditCapture,
        );
        return window.__banditProof;
      });
      const readability = await collectCombatTextAudit(page);
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(
          {
            rounds: trace,
            readability,
            misses: data.misses,
            missImpacts: data.missImpacts,
            cursors: data.cursors,
          },
          null,
          2,
        ),
      );
      for (const [label, png] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${width}-${label}.png`),
          Buffer.from(png.split(",")[1], "base64"),
        );
      expect(Object.keys(data.images)).toContain("guard");
      expect(Object.keys(data.images)).toContain("guardedHit");
      expect(
        trace[2].combat_actions.find((a) => a.actor_name === "Hero").missed,
      ).toBe(true);
      expect(data.misses).toHaveLength(1);
      expect(data.misses[0].opaqueMs).toBeGreaterThanOrEqual(1100);
      expect(data.misses[0].contact).toBe(false);
      expect(data.missImpacts).toHaveLength(1);
      expect(data.missImpacts[0].frame).toBe(3);
      expect(data.missImpacts[0].hpAfter).toBe(data.missImpacts[0].hpBefore);
      expectReadableCombatText(readability);
      await page.screenshot({
        path: path.join(proof, `${width}-recovered.png`),
      });
    });
  });
}
