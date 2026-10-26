import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openShowcase } from "./battle-vfx-proof-helpers.js";

const proof = path.resolve(`tmp/cinder-lightning-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion, spell] of [
  [1440, 900, "no-preference", "shock"],
  [390, 844, "no-preference", "shock"],
  [375, 667, "no-preference", "shock"],
  [800, 600, "reduce", "shock"],
  [1440, 900, "no-preference", "thunder"],
  [390, 844, "reduce", "thunder"],
]) {
  const label = `${width}-${spell}`;
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("native lightning releases, strikes and recovers without a flash", async ({
      page,
    }) => {
      test.setTimeout(150000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nimport { battleCastOrigin as __liveOrigin } from "/src/scenes/battle_cinematics.js"; window.__lightningOrigin=__liveOrigin; window.__lightningGame=game;`,
        });
      });
      await openShowcase(page, { width, height, reducedMotion: motion });
      await page.evaluate(() => {
        const game = window.__lightningGame,
          scene = game.scene.getScene("Battle");
        const data = (window.__lightningAudit = {
          samples: [],
          labels: [],
          images: {},
        });
        let last = "";
        window.__lightningCapture = () => {
          const effects = scene.children.list.filter(
            (o) =>
              o.active &&
              (o._battleEffectFamily === "lightning" ||
                o._combatFxTag === "spell-projectile"),
          );
          const actor = scene.partySprites?.Sparks?.sprite;
          const time = performance.now();
          const stages = [
            ...new Set(effects.map((o) => o._battleEffectStage || "generic")),
          ];
          const progress = Math.floor(
            (effects.find((o) => o._battleEffectStage === "travel")
              ?.lightningProgress || 0) * 4,
          );
          const key = `${actor?.battleState}:${actor?.battleFrameIndex}:${stages.join()}:${progress}`;
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
          if (key === last) return;
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
              progress: o.lightningProgress,
              reduced: o._lightningReduced,
              x: o.x,
              y: o.y,
              alpha: o.alpha,
              originDelta: (() => {
                const tip = window.__lightningOrigin(
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
          if (progress >= 2)
            data.images["travel-mid"] ||= game.canvas.toDataURL("image/png");
          for (const stage of stages)
            data.images[stage] ||= game.canvas.toDataURL("image/png");
          if (actor?.battleState === "cast_class_ability")
            data.images[`pose-${actor.battleFrameIndex}`] ||=
              game.canvas.toDataURL("image/png");
        };
        game.events.on("postrender", window.__lightningCapture);
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__lightningGame.scene.getScene("Battle");
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
        if (slot !== 1) await command("d", "DEFEND");
        else {
          await command("s", "SPELL");
          await choose(
            page.getByRole("button", { name: new RegExp(`^${spell} ·`, "i") }),
          );
          if (spell === "shock")
            await choose(
              page.locator(".battle-choice-list button:not(:disabled)").first(),
            );
        }
      }
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      await page.waitForFunction(() => {
        const s = window.__lightningGame.scene.getScene("Battle");
        return (
          !s.animating &&
          s.currentMemberIdx === 0 &&
          s.promptText?.getText().includes("choose an action")
        );
      });
      const data = await page.evaluate(() => {
        window.__lightningGame.events.off(
          "postrender",
          window.__lightningCapture,
        );
        return window.__lightningAudit;
      });
      const actions = result.combat_actions.filter(
        (a) => a.actor_name === "Sparks" && a.action_id === spell,
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
      expect(actions).toHaveLength(spell === "shock" ? 1 : 2);
      for (const action of actions)
        expect(action.presentation).toMatchObject({
          effect_family: "lightning",
          intensity_tier: spell === "shock" ? 1 : 2,
        });
      const first = (stage) =>
        data.samples.find((s) => s.stages.includes(stage));
      expect(first("release")).toBeTruthy();
      expect(first("travel")).toBeTruthy();
      expect(first("impact")).toBeTruthy();
      expect(first("release").time).toBeLessThan(first("travel").time);
      expect(first("travel").time).toBeLessThan(first("impact").time);
      expect(data.labels[0].time).toBeGreaterThanOrEqual(first("impact").time);
      for (const action of actions) {
        const before = data.samples[0].hp[action.target_id];
        expect(before).toBeGreaterThan(0);
        const changed = data.samples.find(
          (s) => s.hp[action.target_id] < before,
        );
        expect(changed).toBeTruthy();
        expect(changed.time).toBeGreaterThanOrEqual(first("impact").time);
        expect(data.samples.at(-1).hp[action.target_id]).toBe(
          before - action.damage,
        );
      }
      for (const action of actions)
        expect(
          data.labels.some(
            (l) =>
              l.key === `enemy_${action.target_id}` &&
              l.text.includes(String(action.damage)),
          ),
        ).toBe(true);
      if (spell === "thunder")
        expect(
          first("impact").effects.filter((e) => e.stage === "impact"),
        ).toHaveLength(2);
      const travel = data.samples.flatMap((s) =>
        s.effects.filter((e) => e.stage === "travel"),
      );
      if (motion !== "reduce")
        expect(travel.every((e) => e.originDelta < 3)).toBe(true);
      expect(travel.every((e) => e.reduced === (motion === "reduce"))).toBe(
        true,
      );
      expect(
        data.samples
          .filter((s) => s.state === "cast_class_ability")
          .every((s) => s.shadowDelta < 0.1),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            window.__lightningGame.scene
              .getScene("Battle")
              .children.list.filter(
                (o) => o.active && o._battleEffectFamily === "lightning",
              ).length,
        ),
      ).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}
