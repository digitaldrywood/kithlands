import {
  installCombatTextAudit,
  collectCombatTextAudit,
  expectReadableCombatText,
} from "./helpers/combat-text-audit.js";
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openShowcase } from "./battle-vfx-proof-helpers.js";

const proof = path.resolve(`tmp/cinder-statusSpell-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [
  width,
  height,
  motion,
  spell,
  statusEffect,
  casterName,
  casterSlot,
  targetIndex,
] of [
  [1440, 900, "no-preference", "sleep", "sleep", "Sparks", 1, 0],
  [390, 844, "no-preference", "sleep", "sleep", "Sparks", 1, 1],
  [1440, 900, "no-preference", "mute", "silence", "Mercy", 2, 1],
  [800, 600, "reduce", "mute", "silence", "Mercy", 2, 0],
  [1440, 900, "no-preference", "slow", "slow", "Sparks", 1, 0],
  [390, 844, "reduce", "slow", "slow", "Sparks", 1, 1],
]) {
  const label = `${width}-${spell}`;
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("native status cast distinguishes applied and resisted at contact", async ({
      page,
    }) => {
      test.setTimeout(150000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nimport { battleCastOrigin as __liveOrigin } from "/src/scenes/battle_cinematics.js"; window.__statusSpellOrigin=__liveOrigin; window.__statusSpellGame=game;`,
        });
      });
      const initial = await openShowcase(page, {
        width,
        height,
        reducedMotion: motion,
      });
      if (motion === "reduce")
        await page.evaluate(async () => {
          const { setPref } = await import("/src/systems/prefs.js");
          setPref("battleSpeed", 1);
          setPref("messageSpeed", 6);
        });
      await page.evaluate(installCombatTextAudit, {
        gameKey: "__statusSpellGame",
      });
      await page.evaluate((casterName) => {
        const game = window.__statusSpellGame,
          scene = game.scene.getScene("Battle");
        const data = (window.__statusSpellAudit = {
          samples: [],
          messages: [],
          labels: [],
          images: {},
        });
        let last = "";
        window.__statusSpellCapture = () => {
          const effects = scene.children.list.filter(
            (o) =>
              o.active &&
              (o._battleEffectFamily?.startsWith("status_") ||
                o._combatFxTag === "spell-projectile"),
          );
          const actor = scene.partySprites?.[casterName]?.sprite;
          const time = performance.now();
          data.messages.push(scene.messageWindow?.text?.text || "");
          const stages = [
            ...new Set(effects.map((o) => o._battleEffectStage || "generic")),
          ];
          const shard = effects.find((o) => o._battleEffectStage === "travel");
          const progress = shard ? Math.round(shard.x / 80) : -1;
          const key = `${actor?.battleState}:${actor?.battleFrameIndex}:${stages.join()}:${progress}:${Object.values(
            scene.enemySprites || {},
          )
            .map((e) => e.hpBar?.currentHP)
            .join()}`;
          for (const text of scene.floatingText?.active || []) {
            if (
              !text.visible ||
              text.alpha < 0.9 ||
              !text._targetKey?.startsWith("enemy_")
            )
              continue;
            data.labels.push({ time, text: text.text, key: text._targetKey });
            data.images.damage ||= game.canvas.toDataURL("image/png");
          }
          // Keep stationary travel frames so reduced-motion speed can be measured.
          if (key === last && !shard) return;
          last = key;
          data.samples.push({
            time,
            state: actor?.battleState,
            frame: actor?.battleFrameIndex,
            stages,
            effects: effects.map((o) => ({
              stage: o._battleEffectStage,
              family: o._battleEffectFamily,
              tier: o._battleEffectTier,
              outcome: o._statusOutcome,

              x: o.x,
              y: o.y,
              alpha: o.alpha,
              originDelta: (() => {
                const tip = window.__statusSpellOrigin(
                  { sprite: actor },
                  { live: true },
                );
                return Math.hypot(o.x - tip.x, o.y - tip.y);
              })(),
            })),
            shadowDelta: actor?.battleShadow
              ? Math.hypot(
                  actor.x - actor.battleShadow.x,
                  actor.y - actor.battleShadow.y,
                )
              : null,
            hp: Object.fromEntries(
              Object.entries(scene.enemySprites || {}).map(([id, e]) => [
                id,
                e.hpBar?.currentHP,
              ]),
            ),
          });
          if (shard && Math.abs(shard.x - actor.battleCastSource.x) > 100)
            data.images["travel-mid"] ||= game.canvas.toDataURL("image/png");
          for (const stage of stages)
            data.images[stage] ||= game.canvas.toDataURL("image/png");
          if (actor?.battleState === "cast_class_ability")
            data.images[`pose-${actor.battleFrameIndex}`] ||=
              game.canvas.toDataURL("image/png");
        };
        game.events.on("postrender", window.__statusSpellCapture);
      }, casterName);
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__statusSpellGame.scene.getScene("Battle");
          return (
            !s.animating &&
            s.currentMemberIdx === slot &&
            s.promptText
              ?.getText()
              .startsWith(`${s.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      const command = async (key, text) => {
        if (width >= 600) return page.keyboard.press(key);
        const point = await page.evaluate(
          (text) =>
            window.__kithlandsTest.interactiveTextPosition(text, "Battle"),
          text,
        );
        expect(point).toBeTruthy();
        await page.touchscreen.tap(point.x, point.y);
      };
      const choose = (target) => target[width < 600 ? "tap" : "click"]();
      await ready(0);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      for (let slot = 0; slot < 4; slot++) {
        await ready(slot);
        if (slot !== casterSlot) await command("d", "DEFEND");
        else {
          await command("s", "SPELL");
          await choose(
            page.getByRole("button", { name: new RegExp(`^${spell} ·`, "i") }),
          );
          const choices = page.locator(
            ".battle-choice-list button:not(:disabled)",
          );
          expect(await choices.count()).toBe(2);
          await choose(choices.nth(targetIndex));
        }
      }
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      await page.waitForFunction(() => {
        const s = window.__statusSpellGame.scene.getScene("Battle");
        return (
          !s.animating &&
          s.currentMemberIdx === 0 &&
          s.promptText?.getText().includes("choose an action")
        );
      });
      const data = await page.evaluate(() => {
        window.__statusSpellGame.events.off(
          "postrender",
          window.__statusSpellCapture,
        );
        return window.__statusSpellAudit;
      });
      const actions = result.combat_actions.filter(
        (a) => a.actor_name === casterName && a.action_id === spell,
      );
      writeFileSync(
        path.join(proof, `${label}-trace.json`),
        JSON.stringify({ result, ...data, images: undefined }, null, 2),
      );
      for (const [stage, image] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${label}-${stage}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      await page.screenshot({
        path: path.join(proof, `${label}-recovered.png`),
      });
      expect(actions).toHaveLength(1);
      const action = actions[0];
      expect(action.status_effect).toBe(statusEffect);
      expect(["applied", "resisted"]).toContain(action.status_outcome);
      const readability = await collectCombatTextAudit(page);
      expectReadableCombatText(readability);
      writeFileSync(
        path.join(proof, `${label}-readability.json`),
        JSON.stringify(readability, null, 2),
      );
      for (const action of actions)
        expect(action.presentation).toMatchObject({
          effect_family: `status_${statusEffect}`,
          intensity_tier: 1,
        });
      const first = (stage) =>
        data.samples.find((s) => s.stages.includes(stage));
      expect(first("release")).toBeTruthy();
      expect(first("travel")).toBeTruthy();
      expect(first("impact")).toBeTruthy();
      expect(first("release").time).toBeLessThan(first("travel").time);
      expect(first("travel").time).toBeLessThan(first("impact").time);
      expect(data.labels[0].time).toBeGreaterThanOrEqual(first("impact").time);
      const beforeHP = data.samples[0].hp[action.target_id];
      expect(beforeHP).toBeGreaterThan(0);
      expect(
        data.samples.every((s) => s.hp[action.target_id] === beforeHP),
      ).toBe(true);
      const caption =
        action.status_outcome === "resisted" ? "RESISTED" : spell.toUpperCase();
      const resultLabels = data.labels.filter(
        (l) => l.key === `enemy_${action.target_id}` && l.text === caption,
      );
      expect(resultLabels.length).toBeGreaterThan(1);
      expect(resultLabels[0].time).toBeGreaterThanOrEqual(first("impact").time);
      expect(resultLabels.at(-1).time - resultLabels[0].time).toBeGreaterThan(
        1100,
      );
      expect(
        first("impact").effects.find((e) => e.stage === "impact").outcome,
      ).toBe(action.status_outcome);
      const spellState = initial.party[casterSlot].spells.find(
        (s) => s.id === spell,
      );
      expect(result.party[casterSlot].mp).toBe(
        initial.party[casterSlot].mp - spellState.mp_cost,
      );
      const receiptMessage =
        action.status_outcome === "resisted"
          ? `${action.target_name} resists ${action.spell_name}.`
          : `${action.spell_name} takes hold on ${action.target_name}.`;
      expect(data.messages).toContain(receiptMessage);
      const release = first("release");
      expect(release.frame).toBe(3);
      expect(
        release.effects.find((e) => e.stage === "release").originDelta,
      ).toBeLessThan(1);
      const travelSamples = data.samples
        .map((s) => s.effects.find((e) => e.stage === "travel"))
        .filter(Boolean);
      expect(travelSamples.length).toBeGreaterThan(1);
      const travelDistance = Math.hypot(
        travelSamples.at(-1).x - travelSamples[0].x,
        travelSamples.at(-1).y - travelSamples[0].y,
      );
      if (motion === "reduce") expect(travelDistance).toBeLessThan(0.5);
      else expect(travelDistance).toBeGreaterThan(200);
      expect(
        data.samples
          .filter((s) => s.state === "cast_class_ability")
          .every((s) => s.shadowDelta < 0.1),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            window.__statusSpellGame.scene
              .getScene("Battle")
              .children.list.filter(
                (o) => o.active && o._battleEffectFamily?.startsWith("status_"),
              ).length,
        ),
      ).toBe(0);
      const icon = await page.evaluate((targetID) => {
        const sprite =
          window.__statusSpellGame.scene.getScene("Battle").enemySprites[
            targetID
          ]?.statusIcon;
        return sprite?.visible ? sprite.texture.key : null;
      }, action.target_id);
      const remainingStatus = result.enemies.find(
        (e) => e.id === action.target_id,
      ).status;
      expect(icon).toBe(
        remainingStatus
          ? { sleep: "icon_sleep", silence: "icon_mute", slow: "icon_slow" }[
              remainingStatus
            ]
          : null,
      );
      expect(errors).toEqual([]);
    });
  });
}
