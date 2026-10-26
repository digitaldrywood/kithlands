import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openShowcase } from "./battle-vfx-proof-helpers.js";
const proof = path.resolve(`tmp/cinder-frost-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, reducedMotion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test.describe(`${width} Frost`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("native Cinder cast retains release, contact and recovery", async ({
      page,
    }) => {
      test.setTimeout(150000);
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__frostGame=game;`,
        });
      });
      await openShowcase(page, { width, height, reducedMotion });
      await page.evaluate(() => {
        window.__frostProof = {
          frames: [],
          images: {},
          travel: [],
          labels: [],
          motion: [],
        };
        let last = "",
          lastMotion = -Infinity;
        window.__frostCapture = () => {
          const game = window.__frostGame,
            scene = game.scene.getScene("Battle"),
            sprite = scene.partySprites?.Sparks?.sprite;
          if (!sprite?.active) return;
          const effects = scene.children.list.filter(
            (o) =>
              o.active &&
              (o._battleEffectFamily === "ice" ||
                o._combatFxTag === "spell-projectile"),
          );
          const stages = [
            ...new Set(effects.map((o) => o._battleEffectStage || "generic")),
          ];
          const now = performance.now();
          if (
            (sprite.battleState === "cast_class_ability" || effects.length) &&
            now - lastMotion >= 80
          ) {
            lastMotion = now;
            window.__frostProof.motion.push({
              time: now,
              image: game.canvas.toDataURL("image/png"),
            });
          }
          const travel = effects.find((o) => o._battleEffectStage === "travel");
          if (travel)
            window.__frostProof.travel.push({
              time: now,
              x: travel.x,
              y: travel.y,
            });
          for (const text of scene.floatingText?.active || []) {
            if (
              text.visible &&
              text.alpha > 0.9 &&
              text._targetKey?.startsWith("enemy_")
            ) {
              window.__frostProof.labels.push({
                time: now,
                text: text.text,
                key: text._targetKey,
              });
              window.__frostProof.images["damage"] ||=
                game.canvas.toDataURL("image/png");
            }
          }
          const key = `${sprite.battleState}:${sprite.battleFrameIndex}:${stages.join()}`;
          if (key === last) return;
          last = key;
          const shadow = sprite.battleShadow;
          window.__frostProof.frames.push({
            time: performance.now(),
            state: sprite.battleState,
            frame: sprite.battleFrameIndex,
            stages,
            x: sprite.x,
            y: sprite.y,
            shadowDelta: shadow
              ? Math.hypot(shadow.x - sprite.x, shadow.y - sprite.y)
              : null,
            effects: effects.map((o) => ({
              x: o.x,
              y: o.y,
              alpha: o.alpha,
              stage: o._battleEffectStage,
            })),
            source: sprite.battleCastSource,
            aura: (() => {
              const aura = scene.children.list.find(
                (o) => o.active && o._combatFxTag === "cast-aura",
              );
              return aura
                ? {
                    x: aura.x,
                    y: aura.y,
                    depth: aura.depth,
                    bodyDepth: sprite.depth,
                  }
                : null;
            })(),
          });
          if (sprite.battleState === "cast_class_ability") {
            const label = stages[0] || `pose-${sprite.battleFrameIndex}`;
            window.__frostProof.images[label] ||=
              game.canvas.toDataURL("image/png");
          }
        };
        window.__frostGame.events.on("postrender", window.__frostCapture);
      });
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__frostGame.scene.getScene("Battle");
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
          const frost = page
            .locator(".battle-choice-list button")
            .filter({ hasText: "Frost" });
          await expect(frost).toHaveCount(1);
          await frost[width === 390 ? "tap" : "click"]();
          const targets = page.locator(
            ".battle-choice-list button:not(:disabled)",
          );
          await expect(page.locator(".battle-choice-panel")).toContainText(
            "Choose enemy",
          );
          expect(await targets.count()).toBeGreaterThan(0);
          await targets.first()[width === 390 ? "tap" : "click"]();
        }
      }
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      const action = result.combat_actions.find(
        (a) => a.actor_name === "Sparks" && a.action_id === "frost",
      );
      expect(action).toBeTruthy();
      writeFileSync(
        path.join(proof, `${width}-server.json`),
        JSON.stringify(action, null, 2),
      );
      await page.waitForFunction(() =>
        window.__frostProof.frames.some(
          (f) => f.state === "cast_class_ability",
        ),
      );
      await page.waitForFunction(
        () => {
          const s = window.__frostGame.scene.getScene("Battle");
          return (
            !s.animating &&
            s.currentMemberIdx === 0 &&
            s.promptText?.getText().includes("choose an action")
          );
        },
        null,
        { timeout: 90000 },
      );
      const data = await page.evaluate(() => {
        window.__frostGame.events.off("postrender", window.__frostCapture);
        return window.__frostProof;
      });
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(
          { frames: data.frames, travel: data.travel, labels: data.labels },
          null,
          2,
        ),
      );
      for (const [label, dataURL] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${width}-${label}.png`),
          Buffer.from(dataURL.split(",")[1], "base64"),
        );
      for (const [index, frame] of data.motion.entries())
        writeFileSync(
          path.join(
            proof,
            `${width}-motion-${String(index).padStart(2, "0")}.png`,
          ),
          Buffer.from(frame.image.split(",")[1], "base64"),
        );
      writeFileSync(
        path.join(proof, `${width}-motion-timing.json`),
        JSON.stringify(
          data.motion.map((f) => f.time),
          null,
          2,
        ),
      );
      await page.screenshot({
        path: path.join(proof, `${width}-recovered.png`),
      });
      expect(action.presentation).toEqual({
        effect_family: "ice",
        intensity_tier: 1,
      });
      const stages = data.frames.flatMap((f) => f.stages);
      for (const stage of ["release", "travel", "impact"])
        expect(stages).toContain(stage);
      const cast = data.frames.filter((f) => f.state === "cast_class_ability");
      expect(
        cast.every((f) => f.shadowDelta !== null && f.shadowDelta < 0.5),
      ).toBe(true);
      const release = cast.find((f) => f.stages.includes("release"));
      expect(release.frame).toBe(3);
      expect(
        Math.hypot(
          release.effects[0].x - release.source.x,
          release.effects[0].y - release.source.y,
        ),
      ).toBeLessThan(1);
      const aura = cast.filter((f) => f.aura);
      expect(aura.length).toBeGreaterThan(0);
      expect(
        aura.every(
          (f) =>
            Math.abs(f.aura.y - f.y) < 0.5 && f.aura.depth < f.aura.bodyDepth,
        ),
      ).toBe(true);
      expect(data.travel.length).toBeGreaterThan(1);
      const travelDistance = Math.hypot(
        data.travel.at(-1).x - data.travel[0].x,
        data.travel.at(-1).y - data.travel[0].y,
      );
      if (reducedMotion === "reduce") expect(travelDistance).toBeLessThan(0.5);
      else expect(travelDistance).toBeGreaterThan(200);
      const damage = data.labels.filter((t) => t.text === `-${action.damage}`);
      expect(damage.length).toBeGreaterThan(1);
      const contact = data.frames.find((f) => f.stages.includes("impact"));
      expect(damage[0].time).toBeGreaterThanOrEqual(contact.time);
      expect(damage.at(-1).time - damage[0].time).toBeGreaterThan(1000);
      expect(data.frames.at(-1).state).toBe("idle_guard");
    });
  });
}
