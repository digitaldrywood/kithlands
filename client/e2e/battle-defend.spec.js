import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openShowcase } from "./battle-vfx-proof-helpers.js";

const proof = path.resolve(`tmp/battle-defend-${Date.now()}`);
const observedErrors = new WeakMap();
mkdirSync(proof, { recursive: true });
test.afterEach(async ({ page }, info) => {
  const snapshot = await page
    .evaluate(() => {
      const scene = window.__guardGame?.scene.getScene("Battle");
      return {
        phase: scene?.gameState?.phase,
        animating: scene?.animating,
        member: scene?.currentMemberIdx,
        message: scene?.promptText?.getText(),
        sameHero:
          scene?.partySprites?.Hero?.sprite === window.__guardPreviousHero,
        state: scene?.partySprites?.Hero?.sprite?.battleState,
        frames: window.__guardProof?.frames,
      };
    })
    .catch(() => null);
  writeFileSync(
    info.outputPath(`defend-state-${Date.now()}.json`),
    JSON.stringify(
      { ...snapshot, errors: observedErrors.get(page) || [] },
      null,
      2,
    ),
  );
  await page
    .screenshot({ path: info.outputPath(`defend-last-${Date.now()}.png`) })
    .catch(() => {});
});

for (const [width, height, reducedMotion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test.describe(`${width} Defend`, () => {
    test.use({ hasTouch: width === 390 });
    test("keyboard/touch guards and Repeat submit real protected rounds", async ({
      page,
    }) => {
      test.setTimeout(180000);
      const errors = [];
      observedErrors.set(page, errors);
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.log("[pageerror]", e.stack);
      });
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
          console.log(message.text());
        }
      });
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__guardGame=game;`,
        });
      });
      await openShowcase(page, { width, height, reducedMotion });
      await page.evaluate(() => {
        window.__guardProof = { images: {}, frames: [] };
        let previous = "";
        window.__guardCapture = () => {
          const game = window.__guardGame,
            scene = game.scene.getScene("Battle");
          const hero = scene.partySprites?.Hero?.sprite;
          if (!hero?.active) return;
          const key = `${hero.battleState}-${hero.battleFrameIndex}-${hero.battleBody?.x}-${hero.battleBody?.y}`;
          if (hero.battleState === "defend" && key !== previous) {
            previous = key;
            window.__guardProof.frames.push({
              frame: hero.battleFrameIndex,
              at: performance.now(),
              texture: hero.battleBody?.texture?.key,
              feetOffset: hero.battleBody?.y + hero.battleFeetOffset,
              weapon: hero.battleAttachmentLayers?.map((layer) => ({
                x: layer.front.x,
                y: layer.front.y,
                angle: layer.front.angle,
                visible: layer.front.visible,
              })),
              bodyX: hero.battleBody?.x,
              bodyY: hero.battleBody?.y,
              x: hero.x,
              y: hero.y,
              shadowDelta: hero.battleShadow
                ? Math.hypot(
                    hero.x - hero.battleShadow.x,
                    hero.y - hero.battleShadow.y,
                  )
                : null,
            });
            window.__guardProof.images[key] ||=
              game.canvas.toDataURL("image/png");
          }
          if (
            scene.floatingText?.active.some(
              (t) => t.visible && t.alpha > 0.9 && t.text.includes("GUARD"),
            )
          )
            window.__guardProof.images.protected ||=
              game.canvas.toDataURL("image/png");
        };
        window.__guardGame.events.on("postrender", window.__guardCapture);
      });
      const capture = (name) =>
        page.screenshot({ path: path.join(proof, `${width}-${name}.png`) });
      const readyMember = (slot) =>
        page.waitForFunction((slot) => {
          const scene = window.__guardGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.currentMemberIdx === slot &&
            scene.promptText
              ?.getText()
              .startsWith(`${scene.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      const tapControl = async (label) => {
        const pos = await page.evaluate(
          (label) =>
            window.__kithlandsTest.interactiveTextPosition(label, "Battle"),
          label,
        );
        expect(pos).toBeTruthy();
        await page.touchscreen.tap(pos.x, pos.y);
      };
      await readyMember(0);
      await capture("commands");
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      await page.evaluate(() => {
        window.__guardPreviousHero =
          window.__guardGame.scene.getScene("Battle").partySprites.Hero.sprite;
      });
      for (let slot = 0; slot < 4; slot++) {
        await readyMember(slot);
        if (width === 390) await tapControl("DEFEND");
        else if (slot === 0) {
          for (let tabs = 0; tabs < 12; tabs++) {
            await page.keyboard.press("Tab");
            if (
              await page.evaluate(() =>
                window.__guardGame.scene
                  .getScene("Battle")
                  .actionBtns.some(
                    (b) => b.actionType === "defend" && b.isActive(),
                  ),
              )
            )
              break;
          }
          await expect
            .poll(() =>
              page.evaluate(() =>
                window.__guardGame.scene
                  .getScene("Battle")
                  .actionBtns.some(
                    (b) => b.actionType === "defend" && b.isActive(),
                  ),
              ),
            )
            .toBe(true);
          await capture("focused-defend");
          await page.keyboard.press("Enter");
        } else await page.keyboard.press("d");
      }
      const first = await response;
      expect(
        first
          .request()
          .postDataJSON()
          .actions.map((a) => a.type),
      ).toEqual(Array(4).fill("defend"));
      const resolved = await first.json();
      writeFileSync(
        path.join(proof, `${width}-first-server.json`),
        JSON.stringify(resolved, null, 2),
      );
      expect(resolved.error).toBeUndefined();
      expect(
        resolved.combat_actions.filter((a) => a.kind === "defend"),
      ).toHaveLength(4);
      expect(resolved.combat_actions.some((a) => a.damage_prevented > 0)).toBe(
        true,
      );
      await page.waitForFunction(
        () => {
          const scene = window.__guardGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.partySprites.Hero.sprite !== window.__guardPreviousHero
          );
        },
        null,
        { timeout: 60000 },
      );
      await readyMember(0);
      await capture("repeat-ready");
      const repeated = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      await page.evaluate(() => {
        window.__guardPreviousHero =
          window.__guardGame.scene.getScene("Battle").partySprites.Hero.sprite;
      });
      if (width === 390) await tapControl("REPEAT");
      else await page.keyboard.press("r");
      const second = await repeated;
      expect(
        second
          .request()
          .postDataJSON()
          .actions.map((a) => a.type),
      ).toEqual(Array(4).fill("defend"));
      const repeatedResult = await second.json();
      writeFileSync(
        path.join(proof, `${width}-repeat-server.json`),
        JSON.stringify(repeatedResult, null, 2),
      );
      expect(repeatedResult.error).toBeUndefined();
      expect(
        repeatedResult.combat_actions.filter((a) => a.kind === "defend"),
      ).toHaveLength(4);
      // This seed's second-round attacks hit Hero's heavy armor at the
      // one-damage floor. Guards must not turn minimum hits into immunity.
      expect(
        repeatedResult.combat_actions
          .filter((a) => a.kind === "attack")
          .every(
            (action) =>
              action.damage_prevented > 0 ||
              action.hits.every((hit) => hit.missed || hit.damage === 1),
          ),
      ).toBe(true);
      await page.waitForFunction(
        () => {
          const scene = window.__guardGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.partySprites.Hero.sprite !== window.__guardPreviousHero
          );
        },
        null,
        { timeout: 60000 },
      );
      await capture("recovered");
      expect(
        await page.evaluate(() => {
          const hero =
            window.__guardGame.scene.getScene("Battle").partySprites.Hero
              .sprite;
          return {
            state: hero.battleState,
            texture: hero.battleBody.texture.key,
            frame: hero.battleFrameIndex,
          };
        }),
      ).toEqual({
        state: "idle_guard",
        texture: "battle_warrior_sword_attack_body",
        frame: 0,
      });
      const data = await page.evaluate(() => {
        window.__guardGame.events.off("postrender", window.__guardCapture);
        return window.__guardProof;
      });
      expect(data.frames.length).toBeGreaterThan(0);
      expect(data.frames.some((frame) => frame.frame === 2)).toBe(true);
      expect(
        data.frames.every(
          (frame) =>
            frame.texture === "battle_warrior_sword_defend_body" &&
            frame.bodyX === 0 &&
            frame.feetOffset === 0,
        ),
      ).toBe(true);
      expect(
        data.frames.every(
          (frame) => frame.shadowDelta !== null && frame.shadowDelta < 0.5,
        ),
      ).toBe(true);
      expect(data.images.protected).toBeTruthy();
      for (const [name, image] of Object.entries(data.images))
        writeFileSync(
          path.join(proof, `${width}-${name}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      delete data.images;
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(
          { first: resolved, second: repeatedResult, ...data },
          null,
          2,
        ),
      );
      // Render-only density fixture: combine server-provided spells/abilities
      // to exercise all nine command buttons. Never submit this synthetic plan.
      const density = await page.evaluate(() => {
        const scene = window.__guardGame.scene.getScene("Battle"),
          gs = scene.gameState;
        const member = {
          ...gs.party[0],
          spells: gs.party[1].spells,
          abilities: gs.party[3].abilities,
        };
        scene.drawActions({ ...gs, party: [member, ...gs.party.slice(1)] }, 0);
        const bounds = scene.hudLayout.command;
        const buttons = scene.actionBtns.filter((button) => button.actionType);
        const canvas = scene.game.canvas.getBoundingClientRect();
        return {
          count: buttons.length,
          statusClear:
            scene.hudLayout.mode !== "mobile" ||
            scene.partyStatus.rows.every((row) =>
              [row.hpBar, row.mpBar].every((meter) => {
                const bar = meter.bg.getBounds(),
                  label = meter.label.getBounds();
                return (
                  bar.top >= label.bottom + 1 &&
                  bar.bottom <= row.bounds.y + row.bounds.height
                );
              }),
            ),
          minTarget: Math.min(
            ...buttons.flatMap((button) => {
              const rect = button.bg.getBounds();
              return [
                (rect.width * canvas.width) / scene.hudLayout.gameWidth,
                (rect.height * canvas.height) / scene.hudLayout.gameHeight,
              ];
            }),
          ),
          contained: buttons.every((button) => {
            const rect = button.bg.getBounds();
            return (
              rect.left >= bounds.x &&
              rect.right <= bounds.x + bounds.width &&
              rect.top >= bounds.y &&
              rect.bottom <= bounds.y + bounds.height
            );
          }),
        };
      });
      expect(density).toMatchObject({
        count: 9,
        contained: true,
        statusClear: true,
      });
      if (width === 390) expect(density.minTarget).toBeGreaterThanOrEqual(44);
      writeFileSync(
        path.join(proof, `${width}-layout.json`),
        JSON.stringify(density, null, 2),
      );
      await capture("command-density-fixture");
      expect(errors).toEqual([]);
    });
  });
}
