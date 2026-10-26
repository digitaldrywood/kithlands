import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openShowcase } from "./battle-vfx-proof-helpers.js";

const proof = path.resolve(`tmp/cinder-iceFamily-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion, spell, tier, grouped] of [
  [1440, 900, "no-preference", "chill", 1, true],
  [800, 600, "reduce", "chill", 1, true],
  [1440, 900, "no-preference", "iceshard", 2, false],
  [390, 844, "no-preference", "iceshard", 2, false],
  [1440, 900, "no-preference", "blizzard", 3, true],
  [390, 844, "reduce", "blizzard", 3, true],
]) {
  const label = `${width}-${spell}`;
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("native ice spell releases, hits every Go target and recovers", async ({
      page,
    }) => {
      test.setTimeout(150000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nimport { battleCastOrigin as __liveOrigin } from "/src/scenes/battle_cinematics.js"; window.__iceFamilyOrigin=__liveOrigin; window.__iceFamilyGame=game;`,
        });
      });
      await openShowcase(page, { width, height, reducedMotion: motion });
      await page.evaluate(() => {
        const game = window.__iceFamilyGame,
          scene = game.scene.getScene("Battle");
        const data = (window.__iceFamilyAudit = {
          samples: [],
          labels: [],
          images: {},
        });
        let last = "";
        window.__iceFamilyCapture = () => {
          const effects = scene.children.list.filter(
            (o) =>
              o.active &&
              (o._battleEffectFamily === "ice" ||
                o._combatFxTag === "spell-projectile"),
          );
          const actor = scene.partySprites?.Sparks?.sprite;
          const time = performance.now();
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

              x: o.x,
              y: o.y,
              alpha: o.alpha,
              originDelta: (() => {
                const tip = window.__iceFamilyOrigin(
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
        game.events.on("postrender", window.__iceFamilyCapture);
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__iceFamilyGame.scene.getScene("Battle");
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
          if (!grouped)
            await choose(
              page.locator(".battle-choice-list button:not(:disabled)").first(),
            );
        }
      }
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      await page.waitForFunction(() => {
        const s = window.__iceFamilyGame.scene.getScene("Battle");
        return (
          !s.animating &&
          s.currentMemberIdx === 0 &&
          s.promptText?.getText().includes("choose an action")
        );
      });
      const data = await page.evaluate(() => {
        window.__iceFamilyGame.events.off(
          "postrender",
          window.__iceFamilyCapture,
        );
        return window.__iceFamilyAudit;
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
      expect(actions).toHaveLength(grouped ? 2 : 1);
      for (const action of actions)
        expect(action.presentation).toMatchObject({
          effect_family: "ice",
          intensity_tier: tier,
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
      if (grouped)
        expect(
          first("impact").effects.filter((e) => e.stage === "impact"),
        ).toHaveLength(2);
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
            window.__iceFamilyGame.scene
              .getScene("Battle")
              .children.list.filter(
                (o) => o.active && o._battleEffectFamily === "ice",
              ).length,
        ),
      ).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}
